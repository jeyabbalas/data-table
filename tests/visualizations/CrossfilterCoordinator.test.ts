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
