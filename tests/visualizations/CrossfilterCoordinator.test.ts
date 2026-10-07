/**
 * CrossfilterCoordinator — concurrency cap on visualization fan-out
 *
 * Ensures visualisation updates queue through a bounded worker pool instead
 * of flooding DuckDB's single-threaded worker with N parallel queries on wide
 * tables. See `src/visualizations/CrossfilterCoordinator.ts`.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

import { CrossfilterCoordinator } from '../../src/visualizations/CrossfilterCoordinator';
import { createTableState } from '../../src/core/State';
import type { StateActions } from '../../src/core/Actions';
import type { WorkerBridge } from '../../src/data/WorkerBridge';
import type { BaseVisualization } from '../../src/visualizations/BaseVisualization';
import type { Filter } from '../../src/core/types';
import { deferred, type Deferred } from '../helpers/rowFetchBridge';

/** Stub visualization that tracks concurrency through a shared counter. */
function makeStubViz(tracker: { inflight: number; peak: number }, ms = 10): BaseVisualization {
  return {
    async updateFilters(_filters: Filter[]): Promise<void> {
      tracker.inflight += 1;
      tracker.peak = Math.max(tracker.peak, tracker.inflight);
      try {
        await new Promise((r) => setTimeout(r, ms));
      } finally {
        tracker.inflight -= 1;
      }
    },
    isDestroyed: () => false,
  } as unknown as BaseVisualization;
}

function makeBridge(): WorkerBridge {
  return {
    query: vi.fn().mockResolvedValue([{ cnt: 0 }]),
  } as unknown as WorkerBridge;
}

function makeActions(): StateActions {
  return { isRelationReadable: () => true } as unknown as StateActions;
}

describe('CrossfilterCoordinator — concurrency cap', () => {
  it('limits simultaneous viz updateFilters calls to the configured ceiling', async () => {
    const state = createTableState();
    state.tableName.set('t');
    state.totalRows.set(100_000);

    const coord = new CrossfilterCoordinator(state, makeActions(), makeBridge(), 4);

    const tracker = { inflight: 0, peak: 0 };
    for (let i = 0; i < 20; i += 1) {
      coord.register(`col_${i}`, makeStubViz(tracker, 15));
    }

    // Trigger a filter change so onFiltersChanged fires for every registered viz.
    state.filters.set([{ type: 'not-null', column: 'col_0' } as unknown as Filter]);

    // Poll until all viz tasks have drained.
    const start = Date.now();
    while (tracker.inflight > 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(tracker.peak).toBeGreaterThan(0);
    expect(tracker.peak).toBeLessThanOrEqual(4);

    coord.destroy();
  });

  it('defaults to a cap of 4 when no concurrency argument is given', async () => {
    const state = createTableState();
    state.tableName.set('t');
    state.totalRows.set(100);

    const coord = new CrossfilterCoordinator(state, makeActions(), makeBridge());

    const tracker = { inflight: 0, peak: 0 };
    for (let i = 0; i < 12; i += 1) {
      coord.register(`col_${i}`, makeStubViz(tracker, 10));
    }

    state.filters.set([{ type: 'not-null', column: 'col_0' } as unknown as Filter]);

    const start = Date.now();
    while (tracker.inflight > 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(tracker.peak).toBeLessThanOrEqual(4);

    coord.destroy();
  });

  it('floors the concurrency at 1 when given a non-positive value', async () => {
    const state = createTableState();
    state.tableName.set('t');
    state.totalRows.set(100);

    const coord = new CrossfilterCoordinator(state, makeActions(), makeBridge(), 0);

    const tracker = { inflight: 0, peak: 0 };
    for (let i = 0; i < 5; i += 1) {
      coord.register(`col_${i}`, makeStubViz(tracker, 5));
    }

    state.filters.set([{ type: 'not-null', column: 'col_0' } as unknown as Filter]);

    const start = Date.now();
    while (tracker.inflight > 0 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(tracker.peak).toBe(1);

    coord.destroy();
  });
});

describe('CrossfilterCoordinator — after destroy', () => {
  /** A bridge whose count query stays pending until the test settles it. */
  function makeDeferredBridge(): {
    bridge: WorkerBridge;
    resolve: (rows: { cnt: number }[]) => void;
    reject: (err: Error) => void;
  } {
    let resolve!: (rows: { cnt: number }[]) => void;
    let reject!: (err: Error) => void;
    const pending = new Promise<{ cnt: number }[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const bridge = { query: vi.fn().mockReturnValue(pending) } as unknown as WorkerBridge;
    return { bridge, resolve, reject };
  }

  function makeFilteredState() {
    const state = createTableState();
    state.tableName.set('t');
    state.totalRows.set(100);
    state.filteredRows.set(100);
    return state;
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const filter = { type: 'not-null', column: 'a' } as unknown as Filter;

  it('discards a row count that resolves after destroy', async () => {
    const state = makeFilteredState();
    const { bridge, resolve } = makeDeferredBridge();
    const onFilterCycleComplete = vi.fn();
    const coord = new CrossfilterCoordinator(state, makeActions(), bridge, 4, {
      onFilterCycleComplete,
    });

    state.filters.set([filter]);
    expect(bridge.query).toHaveBeenCalledTimes(1);
    coord.destroy();
    resolve([{ cnt: 42 }]);
    await flush();

    expect(state.filteredRows.get()).toBe(100);
    expect(onFilterCycleComplete).not.toHaveBeenCalled();
  });

  it('does not report a row count that fails after destroy', async () => {
    const state = makeFilteredState();
    const { bridge, reject } = makeDeferredBridge();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const coord = new CrossfilterCoordinator(state, makeActions(), bridge);

    state.filters.set([filter]);
    coord.destroy();
    reject(new Error('Worker terminated'));
    await flush();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('issues no query from syncExistingFilters after destroy', async () => {
    const state = makeFilteredState();
    state.filters.set([filter]);
    const bridge = makeBridge();
    const coord = new CrossfilterCoordinator(state, makeActions(), bridge);

    coord.destroy();
    await coord.syncExistingFilters();

    expect(bridge.query).not.toHaveBeenCalled();
  });
});

describe('CrossfilterCoordinator — filter cycle complete', () => {
  /** A chart whose refetches stay pending until the test settles them. */
  function makeHeldViz(): { viz: BaseVisualization; refetches: Deferred<void>[] } {
    const refetches: Deferred<void>[] = [];
    const viz = {
      updateFilters(_filters: Filter[]): Promise<void> {
        const refetch = deferred<void>();
        refetches.push(refetch);
        return refetch.promise;
      },
      isDestroyed: () => false,
    } as unknown as BaseVisualization;
    return { viz, refetches };
  }

  /** A bridge whose count queries stay pending until the test settles them. */
  function makeHeldBridge(): { bridge: WorkerBridge; counts: Deferred<{ cnt: number }[]>[] } {
    const counts: Deferred<{ cnt: number }[]>[] = [];
    const bridge = {
      query: vi.fn(() => {
        const count = deferred<{ cnt: number }[]>();
        counts.push(count);
        return count.promise;
      }),
    } as unknown as WorkerBridge;
    return { bridge, counts };
  }

  /**
   * A coordinator with one held chart, whose hook records the filters and
   * the row count it sees, as the facade's `filterChange` payload reads it.
   */
  function setup() {
    const state = createTableState();
    state.tableName.set('t');
    state.totalRows.set(100);
    state.filteredRows.set(100);
    const { bridge, counts } = makeHeldBridge();
    const seen: { filters: Filter[]; filteredRows: number }[] = [];
    const coord = new CrossfilterCoordinator(state, makeActions(), bridge, 4, {
      onFilterCycleComplete: (filters) => {
        seen.push({ filters, filteredRows: state.filteredRows.get() });
      },
    });
    const chart = makeHeldViz();
    coord.register('a', chart.viz);
    return { state, coord, counts, chart, seen };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const A = { type: 'not-null', column: 'a' } as unknown as Filter;
  const B = { type: 'null', column: 'b' } as unknown as Filter;

  it('fires once the row count settles, while a chart refetch is still pending', async () => {
    const { state, coord, counts, chart, seen } = setup();

    state.filters.set([A]);
    await flush();
    expect(chart.refetches).toHaveLength(1);
    expect(counts).toHaveLength(1);
    expect(seen).toEqual([]);

    counts[0]!.resolve([{ cnt: 42 }]);
    await flush();
    expect(seen).toEqual([{ filters: [A], filteredRows: 42 }]);

    // The chart's refetch settling later fires nothing more.
    chart.refetches[0]!.resolve();
    await flush();
    expect(seen).toHaveLength(1);
    coord.destroy();
  });

  it('fires for cleared filters without waiting for the charts', async () => {
    const { state, coord, counts, chart, seen } = setup();
    state.filters.set([A]);
    await flush();
    counts[0]!.resolve([{ cnt: 42 }]);
    await flush();
    seen.length = 0;

    state.filters.set([]);
    await flush();
    // No count to run: every row is in. The charts rebuild unfiltered.
    expect(counts).toHaveLength(1);
    expect(chart.refetches).toHaveLength(2);
    expect(seen).toEqual([{ filters: [], filteredRows: 100 }]);
    coord.destroy();
  });

  it('skips an older cycle whose count settles after a newer cycle started', async () => {
    const { state, coord, counts, chart, seen } = setup();

    state.filters.set([A]);
    await flush();
    state.filters.set([A, B]);
    await flush();
    expect(counts).toHaveLength(2);
    expect(chart.refetches).toHaveLength(2);

    counts[0]!.resolve([{ cnt: 42 }]);
    await flush();
    expect(seen).toEqual([]);
    expect(state.filteredRows.get()).toBe(100);

    counts[1]!.resolve([{ cnt: 7 }]);
    await flush();
    expect(seen).toEqual([{ filters: [A, B], filteredRows: 7 }]);

    for (const refetch of chart.refetches) refetch.resolve();
    await flush();
    expect(seen).toHaveLength(1);
    coord.destroy();
  });
});
