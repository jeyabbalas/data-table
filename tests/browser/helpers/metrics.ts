/**
 * Page-side instrumentation for the scaling plan: DOM size, listener and
 * observer censuses, frame pacing, bridge query counts, and signal
 * subscriber counts.
 *
 * These are the machine-independent numbers the plan budgets on
 * (`tests/budgets.ts`) — counts and invariants, not wall clock. A run on a
 * loaded CI box and a run on a workstation must agree on "1,000 columns
 * created 2,004 observers"; only the seconds differ.
 *
 * Every census **delegates to the original** implementation and restores it
 * in a `finally`, following the timer census at
 * `tests/performance/lifecycle-stress.test.ts:57-108`. A census that mocks
 * rather than wraps changes the behavior it is measuring, which is how a
 * leak test ends up proving something about the mock.
 *
 * Censuses install through `page.addInitScript` so they are in place before
 * any application code runs (`helpers/demo.ts:57` precedent).
 */
import type { Page } from '@playwright/test';

/** Net listener counts, keyed by event type. */
export interface ListenerCensus {
  /** `addEventListener` calls minus `removeEventListener` calls, per type. */
  net: Record<string, number>;
  added: number;
  removed: number;
}

/** Live observer gauges, by constructor name. */
export interface ObserverCensus {
  resize: number;
  mutation: number;
  intersection: number;
  /** Constructed, ever — the denominator for a leak ratio. */
  created: { resize: number; mutation: number; intersection: number };
}

/** Frame pacing over a sampling window. */
export interface FrameStats {
  frames: number;
  p95DeltaMs: number;
  maxDeltaMs: number;
  /** Frames longer than 50 ms — the "user notices a stall" threshold. */
  over50Count: number;
}

/** The bridge counters, as `WorkerBridge.__getStatsForTests` returns them. */
export interface BridgeStatsSnapshot {
  sent: { query: number; load: number; export: number };
  cacheHits: number;
  inFlight: number;
  maxInFlight: number;
}

type MetricsWindow = {
  __t?: { state: Record<string, { subscriberCount?: () => number }>; bridge: unknown };
  __dtListeners?: ListenerCensus;
  __dtObservers?: ObserverCensus;
  __dtFrames?: { deltas: number[]; rafId: number; active: boolean };
};

/**
 * Elements under `.dt-root`.
 *
 * The same expression `helpers/demo.ts`'s `settle` polls, so a spec that
 * settles and then counts is reading the number it just waited on.
 */
export async function domNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector('.dt-root');
    return root ? root.querySelectorAll('*').length : 0;
  });
}

/**
 * Canvases under `.dt-root` — one per live column visualization.
 *
 * The direct gauge for lazy creation: before Phase 2 this was the applicable
 * column count (1,000 at the WIDE tier), and after it is the visible window
 * plus overscan. Hoisted here from the two identical copies it grew in
 * (`tiers.full.spec.ts`'s `readShape`, `perf-baseline.spec.ts`) so a spec and
 * the capture that is supposed to corroborate it cannot drift apart.
 */
export async function canvasCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.dt-root canvas').length);
}

/**
 * Wrap `EventTarget.prototype.add/removeEventListener` so
 * `window.__dtListeners` carries net counts per event type.
 *
 * Net, not gross: a table that adds and removes 10,000 listeners is fine;
 * one that adds 10,000 and removes none is the leak. Both wrappers
 * delegate, so behavior is unchanged.
 */
export async function installListenerCensus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as MetricsWindow;
    const census: ListenerCensus = (w.__dtListeners = { net: {}, added: 0, removed: 0 });
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (
      type: string,
      ...rest: [never, never]
    ): void {
      census.net[type] = (census.net[type] ?? 0) + 1;
      census.added++;
      return add.call(this, type, ...rest);
    } as typeof add;

    EventTarget.prototype.removeEventListener = function (
      type: string,
      ...rest: [never, never]
    ): void {
      census.net[type] = (census.net[type] ?? 0) - 1;
      census.removed++;
      return remove.call(this, type, ...rest);
    } as typeof remove;
  });
}

/** Read the listener census. Returns zeros if it was never installed. */
export async function readListenerCensus(page: Page): Promise<ListenerCensus> {
  return page.evaluate(
    () => (window as unknown as MetricsWindow).__dtListeners ?? { net: {}, added: 0, removed: 0 },
  );
}

/**
 * Wrap `ResizeObserver` / `MutationObserver` / `IntersectionObserver` so
 * `window.__dtObservers` carries live gauges plus lifetime creation counts.
 *
 * Live count is what matters at 1,000 columns: each column header owns a
 * `ResizeObserver` and each canvas viz a `MutationObserver`, so "how many
 * are still connected" is the leak signal, and "how many were ever built"
 * is the churn signal.
 */
export async function installObserverCensus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as MetricsWindow;
    const census: ObserverCensus = (w.__dtObservers = {
      resize: 0,
      mutation: 0,
      intersection: 0,
      created: { resize: 0, mutation: 0, intersection: 0 },
    });

    // Which instances are currently counted, so a second `disconnect()`
    // cannot drive the gauge negative and an `observe()` after one can bring
    // the instance back. The second half matters from Phase 2 on: the
    // visualization controller re-points its one IntersectionObserver by
    // `disconnect()`-then-`observe()` on every header rebuild, and a gauge
    // that only ever counted down would report 0 live observers for an
    // observer that is very much alive.
    //
    // A `WeakSet` rather than a `#private` field, and this is not a style
    // choice: Playwright compiles init scripts through Babel, which lowers
    // `#name` to a `_classPrivateFieldInitSpec` helper it does not inject
    // into the page. The subclass then throws `ReferenceError` the first
    // time the library constructs a `ResizeObserver` — which is during
    // `new TableContainer`, so every mount fails. Keep this file to syntax
    // that survives that transpile.
    const counted = new WeakSet<object>();

    const wrap = (
      name: 'resize' | 'mutation' | 'intersection',
      Original:
        | undefined
        | (new (...args: never[]) => { disconnect: () => void; observe: (...a: never[]) => void }),
    ): unknown => {
      if (!Original) return Original;
      // A subclass, not a Proxy: `class X extends ResizeObserver` keeps the
      // prototype chain and `instanceof` intact for library code that
      // checks either.
      return class extends Original {
        constructor(...args: never[]) {
          super(...args);
          counted.add(this);
          census[name]++;
          census.created[name]++;
        }
        override observe(...args: never[]): void {
          if (!counted.has(this)) {
            counted.add(this);
            census[name]++;
          }
          super.observe(...args);
        }
        override disconnect(): void {
          if (counted.has(this)) {
            counted.delete(this);
            census[name]--;
          }
          super.disconnect();
        }
      };
    };

    const g = window as unknown as Record<string, unknown>;
    g['ResizeObserver'] = wrap('resize', g['ResizeObserver'] as never);
    g['MutationObserver'] = wrap('mutation', g['MutationObserver'] as never);
    g['IntersectionObserver'] = wrap('intersection', g['IntersectionObserver'] as never);
  });
}

/** Read the observer census. Returns zeros if it was never installed. */
export async function readObserverCensus(page: Page): Promise<ObserverCensus> {
  return page.evaluate(
    () =>
      (window as unknown as MetricsWindow).__dtObservers ?? {
        resize: 0,
        mutation: 0,
        intersection: 0,
        created: { resize: 0, mutation: 0, intersection: 0 },
      },
  );
}

/**
 * Sample rAF deltas while `work` runs, and report the pacing.
 *
 * p95 rather than mean: a scroll that is smooth 95 % of the time and
 * freezes for 800 ms once is exactly the experience this plan is about,
 * and a mean hides it.
 */
export async function frameSampler<T>(page: Page, work: () => Promise<T>): Promise<FrameStats> {
  await page.evaluate(() => {
    const w = window as unknown as MetricsWindow;
    const state = (w.__dtFrames = { deltas: [] as number[], rafId: 0, active: true });
    let last = performance.now();
    const tick = (): void => {
      if (!state.active) return;
      const now = performance.now();
      state.deltas.push(now - last);
      last = now;
      state.rafId = requestAnimationFrame(tick);
    };
    state.rafId = requestAnimationFrame(tick);
  });

  try {
    await work();
    return await collectFrames(page);
  } finally {
    // Idempotent, and in a `finally` so a throwing `work` still kills the
    // rAF loop — otherwise it survives and pollutes the next call's deltas.
    // On the happy path the loop is already gone and this is a no-op.
    await collectFrames(page);
  }
}

/** Stop the sampler if it is running and summarize whatever it collected. */
async function collectFrames(page: Page): Promise<FrameStats> {
  return page.evaluate(() => {
    const w = window as unknown as MetricsWindow;
    const state = w.__dtFrames;
    if (!state) return { frames: 0, p95DeltaMs: 0, maxDeltaMs: 0, over50Count: 0 };
    state.active = false;
    cancelAnimationFrame(state.rafId);
    delete w.__dtFrames;
    // Drop the first delta: it spans from installation to the first frame,
    // which is scheduling noise rather than a rendered frame.
    const deltas = state.deltas.slice(1).sort((a, b) => a - b);
    if (deltas.length === 0) return { frames: 0, p95DeltaMs: 0, maxDeltaMs: 0, over50Count: 0 };
    const at = (q: number): number =>
      deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))]!;
    return {
      frames: deltas.length,
      p95DeltaMs: at(0.95),
      maxDeltaMs: deltas[deltas.length - 1]!,
      over50Count: deltas.filter((d) => d > 50).length,
    };
  });
}

/**
 * Read `WorkerBridge.__getStatsForTests()` off the mounted table.
 *
 * Requires a table stashed at `window.__t` (both `bigTable.ts` and
 * `wideTable.ts` do that) or, in demo perf mode, `window.__dtPerf.table`.
 */
export async function bridgeStats(page: Page): Promise<BridgeStatsSnapshot | null> {
  return page.evaluate(() => {
    const table =
      (window as unknown as { __t?: { bridge: unknown } }).__t ??
      (window as unknown as { __dtPerf?: { table?: { bridge: unknown } } }).__dtPerf?.table;
    const bridge = table?.bridge as { __getStatsForTests?: () => BridgeStatsSnapshot } | undefined;
    return bridge?.__getStatsForTests ? bridge.__getStatsForTests() : null;
  });
}

/** Zero the bridge counters so a spec can measure one interaction alone. */
export async function resetBridgeStats(page: Page): Promise<void> {
  await page.evaluate(() => {
    const table =
      (window as unknown as { __t?: { bridge: unknown } }).__t ??
      (window as unknown as { __dtPerf?: { table?: { bridge: unknown } } }).__dtPerf?.table;
    const bridge = table?.bridge as { __resetStatsForTests?: () => void } | undefined;
    bridge?.__resetStatsForTests?.();
  });
}

/**
 * Subscriber count per `TableState` signal.
 *
 * Every column header used to subscribe to seven signals of its own; at 1,000
 * columns that was ~7,000 subscriptions, and a destroy path that missed one
 * leaked them by the thousand. `TableContainer` subscribes once per signal and
 * fans out to the mounted headers now, so what this reports is a small
 * constant — measured 4 / 3 / 2 / 1 / 4 / 1 for sort, rows, pins, filters,
 * visible columns and tooltips, the same at 8 columns as at 80. It still
 * catches the leak it was written for, and it now also catches a regression to
 * per-header subscription, which shows up as a count that tracks the window.
 *
 * Counts alone cannot see *churn*: a scroll sweep that returns to where it
 * started ends with the same headers mounted, so subscribe and unsubscribe net
 * to zero and the totals match either way. `TableContainer.subscriptions.test.ts`
 * spies on `subscribe` itself for that.
 *
 * Computed signals expose the same `subscriberCount()`, so they are counted too.
 */
export async function readSubscriberCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const table = (window as unknown as MetricsWindow).__t;
    if (!table) return {};
    const out: Record<string, number> = {};
    for (const [name, signal] of Object.entries(table.state)) {
      if (signal && typeof signal.subscriberCount === 'function') {
        out[name] = signal.subscriberCount();
      }
    }
    return out;
  });
}
