/**
 * StatsPanelCoordinator — sparse-registration invariants + the optional
 * `vizScheduler` fan-out seam (scaling plan Phase 2 §4.4 / §4.8.1).
 *
 * Mirrors `CrossfilterCoordinator.sparse.test.ts` for panels, plus the one
 * place the two coordinators deliberately diverge:
 * `syncExistingFilters` **bypasses** the scheduler. The facade's load gate
 * awaits that call, so routing it through the scheduler would make load
 * completion depend on the header-visibility wave.
 *
 * Covered:
 *   1. a broadcast with **zero** panels registered is a no-op, not an error;
 *   2. a broadcast with **one** panel out of many columns touches only it;
 *   3. a panel registered *after* a cycle is not retroactively updated, and
 *      joins the very next cycle;
 *   4. a stale cycle (F1) superseded by F2 never reaches a panel it had not
 *      yet visited — including through a scheduler-held `refresh`;
 *   5. with a scheduler attached the coordinator stops iterating panels and
 *      delegates once per cycle with the live columns / sequence / filters;
 *   6. a scheduler that refreshes a subset updates only that subset;
 *   7. with **no** scheduler, behavior is unchanged: every live panel is
 *      updated, bounded by the concurrency cap;
 *   8. `syncExistingFilters` fans out directly even when a scheduler exists.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTableState } from '@/core/State';
import type { Filter } from '@/core/types';
import type { BaseStatsPanel } from '@/visualizations/BaseStatsPanel';
import type {
  FilterFanOutRequest,
  FilterFanOutScheduler,
} from '@/visualizations/CrossfilterCoordinator';
import { StatsPanelCoordinator } from '@/visualizations/StatsPanelCoordinator';

interface StubPanel extends BaseStatsPanel {
  /** One entry per `updateFilters` call, in call order. */
  calls: Filter[][];
  setDestroyed(value: boolean): void;
}

function makePanel(
  opts: { destroyed?: boolean; delayMs?: number; throwOnUpdate?: boolean } = {},
): StubPanel {
  const calls: Filter[][] = [];
  const flags = { destroyed: Boolean(opts.destroyed) };
  const panel = {
    calls,
    setDestroyed(value: boolean): void {
      flags.destroyed = value;
    },
    isDestroyed: (): boolean => flags.destroyed,
    async updateFilters(filters: Filter[]): Promise<void> {
      calls.push([...filters]);
      if (opts.throwOnUpdate) throw new Error('panel boom');
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    },
  };
  return panel as unknown as StubPanel;
}

/** Panel that reports live parallelism through a shared counter. */
function makeConcurrencyPanel(
  tracker: { inflight: number; peak: number },
  delayMs = 15,
): StubPanel {
  const calls: Filter[][] = [];
  const panel = {
    calls,
    setDestroyed(): void {},
    isDestroyed: (): boolean => false,
    async updateFilters(filters: Filter[]): Promise<void> {
      calls.push([...filters]);
      tracker.inflight += 1;
      tracker.peak = Math.max(tracker.peak, tracker.inflight);
      try {
        await new Promise((r) => setTimeout(r, delayMs));
      } finally {
        tracker.inflight -= 1;
      }
    },
  };
  return panel as unknown as StubPanel;
}

interface RecordingScheduler extends FilterFanOutScheduler {
  requests: FilterFanOutRequest[];
}

/** Records every request; refreshes nothing unless `onRequest` says so. */
function makeScheduler(
  onRequest?: (request: FilterFanOutRequest) => Promise<void> | void,
): RecordingScheduler {
  const requests: FilterFanOutRequest[] = [];
  return {
    requests,
    async refreshOnFilters(request: FilterFanOutRequest): Promise<void> {
      requests.push(request);
      await onRequest?.(request);
    },
  };
}

const flush = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

const F1: Filter = { type: 'point', column: 'c0', value: 1 } as Filter;
const F2: Filter = { type: 'point', column: 'c1', value: 2 } as Filter;

let state: ReturnType<typeof createTableState>;
let coord: StatsPanelCoordinator | null = null;

beforeEach(() => {
  state = createTableState();
  state.tableName.set('t');
  state.totalRows.set(1000);
  state.visibleColumns.set(Array.from({ length: 12 }, (_, i) => `c${i}`));
  coord = null;
});

afterEach(() => {
  if (coord) coord.destroy();
  coord = null;
});

describe('StatsPanelCoordinator — sparse registrations', () => {
  it('broadcasts with zero panels registered without throwing', async () => {
    coord = new StatsPanelCoordinator(state);

    state.filters.set([F1]);
    await flush();

    // Nothing registered is the default deployment (the built-in registry
    // ships no panels) — the subscription path must stay silent, and the
    // load-gate call must still resolve.
    await expect(coord.syncExistingFilters([F1])).resolves.toBeUndefined();
  });

  it('touches only the single registered panel when the other 11 columns have none', async () => {
    coord = new StatsPanelCoordinator(state);
    const only = makePanel();
    coord.register('c7', only);

    state.filters.set([F1]);
    await waitFor(() => only.calls.length === 1);

    expect(only.calls).toEqual([[F1]]);
  });

  it('does not retroactively update a panel registered after a cycle; the next cycle includes it', async () => {
    coord = new StatsPanelCoordinator(state);
    const early = makePanel();
    coord.register('c0', early);

    state.filters.set([F1]);
    await waitFor(() => early.calls.length === 1);

    const late = makePanel();
    coord.register('c5', late);
    await flush();
    expect(late.calls).toEqual([]);

    state.filters.set([F1, F2]);
    await waitFor(() => late.calls.length === 1);

    expect(late.calls).toEqual([[F1, F2]]);
    expect(early.calls).toEqual([[F1], [F1, F2]]);
  });

  it('drops a superseded cycle before it reaches a panel it had not visited yet', async () => {
    // Concurrency 1 serializes panels in registration order, so panel B's F1
    // task is still queued when F2 lands and advances the sequence.
    coord = new StatsPanelCoordinator(state, 1);
    const slow = makePanel({ delayMs: 50 });
    const queued = makePanel();
    coord.register('c0', slow);
    coord.register('c1', queued);

    state.filters.set([F1]);
    await waitFor(() => slow.calls.length === 1);
    state.filters.set([F2]);
    await flush(150);

    expect(slow.calls).toEqual([[F1], [F2]]);
    expect(queued.calls).toEqual([[F2]]);
  });
});

describe('StatsPanelCoordinator — vizScheduler seam', () => {
  it('hands the fan-out to the scheduler once per cycle and iterates no panels itself', async () => {
    const scheduler = makeScheduler();
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    const a = makePanel();
    const b = makePanel();
    coord.register('c0', a);
    coord.register('c1', b);

    state.filters.set([F1]);
    await waitFor(() => scheduler.requests.length === 1);
    await flush();

    expect(scheduler.requests).toHaveLength(1);
    expect(scheduler.requests[0]!.filters).toEqual([F1]);
    expect(scheduler.requests[0]!.columns).toEqual(['c0', 'c1']);
    expect(scheduler.requests[0]!.sequence).toBe(1);
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);

    state.filters.set([F1, F2]);
    await waitFor(() => scheduler.requests.length === 2);

    expect(scheduler.requests[1]!.sequence).toBe(2);
    expect(scheduler.requests[1]!.filters).toEqual([F1, F2]);
    expect(a.calls).toEqual([]);
  });

  it('reports live panels in registration order and omits destroyed ones', async () => {
    const scheduler = makeScheduler();
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    coord.register('c9', makePanel());
    coord.register('c2', makePanel());
    coord.register('c4', makePanel({ destroyed: true }));

    state.filters.set([F1]);
    await waitFor(() => scheduler.requests.length === 1);

    expect(scheduler.requests[0]!.columns).toEqual(['c9', 'c2']);
  });

  it('updates only the subset the scheduler asks for', async () => {
    const visible = makePanel();
    const offscreen = makePanel();
    const scheduler = makeScheduler(async (request) => {
      await request.refresh('c1');
    });
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    coord.register('c0', offscreen);
    coord.register('c1', visible);

    state.filters.set([F1]);
    await waitFor(() => visible.calls.length === 1);
    await flush();

    expect(visible.calls).toEqual([[F1]]);
    expect(offscreen.calls).toEqual([]);
  });

  it("routes the scheduler's refresh through the per-panel guards", async () => {
    const bad = makePanel({ throwOnUpdate: true });
    const dead = makePanel({ destroyed: true });
    let refreshRejections = 0;
    const scheduler = makeScheduler(async (request) => {
      // A throwing panel is swallowed exactly as on the direct path, an
      // unknown or destroyed column is a no-op, and neither rejects.
      for (const column of ['c0', 'c1', 'nope']) {
        try {
          await request.refresh(column);
        } catch {
          refreshRejections += 1;
        }
      }
    });
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    coord.register('c0', bad);
    coord.register('c1', dead);

    state.filters.set([F1]);
    await waitFor(() => bad.calls.length === 1);
    await flush();

    expect(refreshRejections).toBe(0);
    expect(bad.calls).toEqual([[F1]]);
    expect(dead.calls).toEqual([]);
    expect(scheduler.requests[0]!.columns).toEqual(['c0']);
  });

  it('a refresh held over from a superseded cycle is dropped by the sequence guard', async () => {
    const scheduler = makeScheduler();
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    const panel = makePanel();
    coord.register('c0', panel);

    state.filters.set([F1]);
    await waitFor(() => scheduler.requests.length === 1);
    state.filters.set([F2]);
    await waitFor(() => scheduler.requests.length === 2);

    // The controller deferred F1's refresh (offscreen panel); by the time it
    // runs, F2 owns the epoch, so the stale filter array must not land.
    await scheduler.requests[0]!.refresh('c0');
    expect(panel.calls).toEqual([]);

    await scheduler.requests[1]!.refresh('c0');
    expect(panel.calls).toEqual([[F2]]);
  });

  it('syncExistingFilters bypasses the scheduler and updates every panel', async () => {
    const scheduler = makeScheduler();
    coord = new StatsPanelCoordinator(state, 4, { vizScheduler: scheduler });
    const panels = ['c0', 'c1', 'c2'].map((column) => {
      const panel = makePanel();
      coord!.register(column, panel);
      return panel;
    });

    await coord.syncExistingFilters([F1]);

    // Decision 7: the facade's load gate awaits this call, so it must never
    // depend on the visibility wave the scheduler drives.
    expect(scheduler.requests).toEqual([]);
    for (const panel of panels) expect(panel.calls).toEqual([[F1]]);

    // The subscription path still delegates, and shares the sequence counter
    // (syncExistingFilters consumed sequence 1).
    state.filters.set([F2]);
    await waitFor(() => scheduler.requests.length === 1);
    expect(scheduler.requests[0]!.sequence).toBe(2);
    for (const panel of panels) expect(panel.calls).toEqual([[F1]]);
  });

  it('without a scheduler, every live panel is updated under the concurrency cap', async () => {
    coord = new StatsPanelCoordinator(state, 4);
    const tracker = { inflight: 0, peak: 0 };
    const panels = Array.from({ length: 20 }, () => makeConcurrencyPanel(tracker, 15));
    panels.forEach((panel, i) => coord!.register(`col_${i}`, panel));

    state.filters.set([F1]);
    await waitFor(() => tracker.inflight === 0 && panels[19]!.calls.length === 1);

    expect(tracker.peak).toBeGreaterThan(0);
    expect(tracker.peak).toBeLessThanOrEqual(4);
    for (const panel of panels) expect(panel.calls).toEqual([[F1]]);
  });

  it('without a scheduler, a panel destroyed before the cycle is skipped', async () => {
    coord = new StatsPanelCoordinator(state);
    const live = makePanel();
    const dead = makePanel();
    coord.register('c0', live);
    coord.register('c1', dead);
    dead.setDestroyed(true);

    state.filters.set([F1]);
    await waitFor(() => live.calls.length === 1);
    await flush();

    expect(live.calls).toEqual([[F1]]);
    expect(dead.calls).toEqual([]);
  });
});
