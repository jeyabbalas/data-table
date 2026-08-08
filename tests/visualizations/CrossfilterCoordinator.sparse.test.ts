/**
 * CrossfilterCoordinator — sparse-registration invariants + the optional
 * `vizScheduler` fan-out seam (scaling plan Phase 2 §4.4 / §4.8.1).
 *
 * Once visualizations are created lazily (only for headers that scroll into
 * view), the coordinator can no longer assume "one registration per column".
 * These tests pin the behavior the lazy controller will be built against:
 *
 *   1. a filter cycle with **zero** registrations still updates
 *      `state.filteredRows` and still fires `onFilterCycleComplete`;
 *   2. a filter cycle with **one** registration out of many columns touches
 *      only that one;
 *   3. a viz registered *after* a cycle is not retroactively updated, and
 *      joins the very next cycle (the sparse-registration invariant);
 *   4. a stale in-flight cycle (F1) that lands after a newer one (F2) neither
 *      fires its trailing-edge hook nor writes a stale row count;
 *   5. with a `vizScheduler` attached the coordinator stops iterating
 *      registrations and hands the whole fan-out to the scheduler — exactly
 *      once per cycle, with the live column list, sequence and filters;
 *   6. a scheduler that refreshes a subset updates only that subset;
 *   7. with **no** scheduler, behavior is unchanged: every live registration
 *      is refreshed, bounded by the concurrency cap.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import type { Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';
import { CrossfilterCoordinator } from '@/visualizations/CrossfilterCoordinator';
import type {
  FilterFanOutRequest,
  FilterFanOutScheduler,
} from '@/visualizations/CrossfilterCoordinator';

interface StubViz extends BaseVisualization {
  /** One entry per `updateFilters` call, in call order. */
  calls: Filter[][];
  setDestroyed(value: boolean): void;
}

function makeViz(opts: { destroyed?: boolean; delayMs?: number } = {}): StubViz {
  const calls: Filter[][] = [];
  const flags = { destroyed: Boolean(opts.destroyed) };
  const viz = {
    calls,
    setDestroyed(value: boolean): void {
      flags.destroyed = value;
    },
    isDestroyed: (): boolean => flags.destroyed,
    async updateFilters(filters: Filter[]): Promise<void> {
      calls.push([...filters]);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    },
  };
  return viz as unknown as StubViz;
}

/** Viz that reports live parallelism through a shared counter. */
function makeConcurrencyViz(tracker: { inflight: number; peak: number }, delayMs = 15): StubViz {
  const calls: Filter[][] = [];
  const viz = {
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
  return viz as unknown as StubViz;
}

interface RecordingScheduler extends FilterFanOutScheduler {
  requests: FilterFanOutRequest[];
}

/**
 * Scheduler that records every request. `onRequest` stands in for the real
 * controller's "refresh the visible ones, mark the rest stale" decision; the
 * default refreshes nothing at all — the extreme sparse case.
 */
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

function makeBridge(rowCount = 0): WorkerBridge {
  return {
    query: vi.fn().mockResolvedValue([{ cnt: rowCount }]),
    clearQueryCache: vi.fn(),
  } as unknown as WorkerBridge;
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
let bridge: WorkerBridge;
let actions: StateActions;
let coord: CrossfilterCoordinator | null = null;
let cycles: Filter[][];

beforeEach(() => {
  state = createTableState();
  state.tableName.set('t');
  state.totalRows.set(1000);
  state.visibleColumns.set(Array.from({ length: 12 }, (_, i) => `c${i}`));
  bridge = makeBridge(42);
  actions = new StateActions(state, bridge);
  cycles = [];
  coord = null;
});

afterEach(() => {
  if (coord) coord.destroy();
  coord = null;
});

function makeCoordinator(
  options: ConstructorParameters<typeof CrossfilterCoordinator>[4] = {},
  concurrency?: number,
): CrossfilterCoordinator {
  coord = new CrossfilterCoordinator(state, actions, bridge, concurrency, {
    onFilterCycleComplete: (filters) => cycles.push([...filters]),
    ...options,
  });
  return coord;
}

describe('CrossfilterCoordinator — sparse registrations', () => {
  it('runs a full filter cycle with zero registrations', async () => {
    makeCoordinator();

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    // No registrations is not an error state: the row count still refreshes
    // and the trailing-edge hook still fires with the applied filters.
    expect(cycles).toEqual([[F1]]);
    expect(state.filteredRows.get()).toBe(42);
    expect(bridge.query).toHaveBeenCalledTimes(1);
  });

  it('resets the row count when the last filter is cleared with zero registrations', async () => {
    makeCoordinator();

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);
    expect(state.filteredRows.get()).toBe(42);

    state.filters.set([]);
    await waitFor(() => cycles.length === 2);

    expect(state.filteredRows.get()).toBe(1000);
    expect(cycles[1]).toEqual([]);
  });

  it('touches only the single registered column when the other 11 have no viz', async () => {
    makeCoordinator();
    const only = makeViz();
    coord!.register('c7', only);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(only.calls).toEqual([[F1]]);
    expect(state.filteredRows.get()).toBe(42);
  });

  it('does not retroactively update a viz registered after a cycle; the next cycle includes it', async () => {
    makeCoordinator();
    const early = makeViz();
    coord!.register('c0', early);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);
    expect(early.calls).toEqual([[F1]]);

    // Registering under already-active filters must not fire an update by
    // itself — the lazy controller owns the initial fetch for a late viz.
    const late = makeViz();
    coord!.register('c5', late);
    await flush();
    expect(late.calls).toEqual([]);

    // ...but the next cycle sees it, with the full current filter array.
    state.filters.set([F1, F2]);
    await waitFor(() => cycles.length === 2);

    expect(late.calls).toEqual([[F1, F2]]);
    expect(early.calls).toEqual([[F1], [F1, F2]]);
  });

  it('discards a stale cycle: a late F1 completion neither fires the hook nor writes its row count', async () => {
    const resolvers: ((rows: { cnt: number }[]) => void)[] = [];
    const query = vi
      .fn<(sql: string) => Promise<{ cnt: number }[]>>()
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    bridge = { query, clearQueryCache: vi.fn() } as unknown as WorkerBridge;
    actions = new StateActions(state, bridge);
    makeCoordinator();
    const viz = makeViz();
    coord!.register('c0', viz);

    state.filters.set([F1]);
    await waitFor(() => resolvers.length === 1);
    state.filters.set([F2]);
    await waitFor(() => resolvers.length === 2);

    // Newer cycle settles first and owns the outcome.
    resolvers[1]!([{ cnt: 7 }]);
    await waitFor(() => cycles.length === 1);
    expect(cycles).toEqual([[F2]]);
    expect(state.filteredRows.get()).toBe(7);

    // Older cycle lands afterwards: its row count is dropped by the sequence
    // guard, and its trailing-edge hook is suppressed so the public
    // `filterChange` payload never regresses to the stale filter set.
    resolvers[0]!([{ cnt: 999 }]);
    await flush();

    expect(state.filteredRows.get()).toBe(7);
    expect(cycles).toEqual([[F2]]);
    // Both cycles did reach the viz — staleness at the viz layer is the
    // scheduler's job, not the row-count guard's.
    expect(viz.calls).toEqual([[F1], [F2]]);
  });
});

describe('CrossfilterCoordinator — vizScheduler seam', () => {
  it('hands the fan-out to the scheduler once per cycle and iterates no registrations itself', async () => {
    const scheduler = makeScheduler();
    makeCoordinator({ vizScheduler: scheduler });
    const a = makeViz();
    const b = makeViz();
    coord!.register('c0', a);
    coord!.register('c1', b);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(scheduler.requests).toHaveLength(1);
    expect(scheduler.requests[0]!.filters).toEqual([F1]);
    expect(scheduler.requests[0]!.columns).toEqual(['c0', 'c1']);
    expect(scheduler.requests[0]!.sequence).toBe(1);
    // The scheduler declined to refresh anything, so nothing was refreshed.
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);

    // The row-count half of the cycle is untouched by the seam.
    expect(state.filteredRows.get()).toBe(42);
    expect(cycles).toEqual([[F1]]);

    state.filters.set([F1, F2]);
    await waitFor(() => cycles.length === 2);

    expect(scheduler.requests).toHaveLength(2);
    expect(scheduler.requests[1]!.sequence).toBe(2);
    expect(scheduler.requests[1]!.filters).toEqual([F1, F2]);
    expect(a.calls).toEqual([]);
  });

  it('reports live registrations in registration order and omits destroyed ones', async () => {
    const scheduler = makeScheduler();
    makeCoordinator({ vizScheduler: scheduler });
    coord!.register('c9', makeViz());
    coord!.register('c2', makeViz());
    const dead = makeViz({ destroyed: true });
    coord!.register('c4', dead);

    state.filters.set([F1]);
    await waitFor(() => scheduler.requests.length === 1);

    expect(scheduler.requests[0]!.columns).toEqual(['c9', 'c2']);
  });

  it('refreshes only the subset the scheduler asks for', async () => {
    const visible = makeViz();
    const offscreen = makeViz();
    const scheduler = makeScheduler(async (request) => {
      await request.refresh('c1');
    });
    makeCoordinator({ vizScheduler: scheduler });
    coord!.register('c0', offscreen);
    coord!.register('c1', visible);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(visible.calls).toEqual([[F1]]);
    expect(offscreen.calls).toEqual([]);
  });

  it('refresh() is a no-op for an unregistered or destroyed column', async () => {
    const dead = makeViz({ destroyed: true });
    const gone = makeViz();
    let refreshErrors = 0;
    const scheduler = makeScheduler(async (request) => {
      try {
        await request.refresh('nope');
        await request.refresh('c3');
        // Unregistered between the request being built and the refresh call.
        coord!.unregister('c6');
        await request.refresh('c6');
      } catch {
        refreshErrors += 1;
      }
    });
    makeCoordinator({ vizScheduler: scheduler });
    coord!.register('c3', dead);
    coord!.register('c6', gone);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(refreshErrors).toBe(0);
    expect(dead.calls).toEqual([]);
    expect(gone.calls).toEqual([]);
    // A destroyed registration is never advertised in the first place.
    expect(scheduler.requests[0]!.columns).toEqual(['c6']);
  });

  it('waits for the scheduler before firing the trailing-edge hook', async () => {
    let released: (() => void) | null = null;
    const scheduler = makeScheduler(
      () =>
        new Promise<void>((resolve) => {
          released = resolve;
        }),
    );
    makeCoordinator({ vizScheduler: scheduler });

    state.filters.set([F1]);
    await waitFor(() => released !== null);
    await flush();

    // Row count already settled, but the cycle is not complete until the
    // scheduler's promise does — same contract the old runLimited half had.
    expect(state.filteredRows.get()).toBe(42);
    expect(cycles).toEqual([]);

    released!();
    await waitFor(() => cycles.length === 1);
    expect(cycles).toEqual([[F1]]);
  });

  it('without a scheduler, every live registration is refreshed under the concurrency cap', async () => {
    makeCoordinator({}, 4);
    const tracker = { inflight: 0, peak: 0 };
    const vizzes = Array.from({ length: 20 }, () => makeConcurrencyViz(tracker, 15));
    vizzes.forEach((viz, i) => coord!.register(`col_${i}`, viz));

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(tracker.peak).toBeGreaterThan(0);
    expect(tracker.peak).toBeLessThanOrEqual(4);
    expect(tracker.inflight).toBe(0);
    for (const viz of vizzes) expect(viz.calls).toEqual([[F1]]);
    expect(cycles).toEqual([[F1]]);
  });

  it('without a scheduler, a registration destroyed before the cycle is skipped', async () => {
    makeCoordinator();
    const live = makeViz();
    const dead = makeViz();
    coord!.register('c0', live);
    coord!.register('c1', dead);
    dead.setDestroyed(true);

    state.filters.set([F1]);
    await waitFor(() => cycles.length === 1);

    expect(live.calls).toEqual([[F1]]);
    expect(dead.calls).toEqual([]);
  });
});
