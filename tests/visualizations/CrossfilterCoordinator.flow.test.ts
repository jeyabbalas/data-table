/**
 * Phase 6 — CrossfilterCoordinator filter-flow integration.
 *
 * The existing `tests/visualizations/CrossfilterCoordinator.test.ts` locks
 * the concurrency cap. This file complements it by asserting the actual
 * filter / action plumbing the coordinator was designed for:
 *
 *   1. `handleFilterChange(col, filter)` → `actions.addFilter(filter)`
 *   2. `handleFilterChange(col, null)`   → `actions.removeFilter(col)`
 *   3. A `state.filters` change triggers `viz.updateFilters` on every
 *      registered, non-destroyed peer.
 *   4. Multi-column filter composition: viz A and viz B can each register
 *      a filter; the coordinator broadcasts the combined array.
 *   5. `updateFilteredRowCount` issues a COUNT(*) query and updates
 *      `state.filteredRows`; stale results are dropped via filterSequence.
 *   6. A destroyed peer mid-broadcast does NOT crash the run; survivors
 *      keep receiving updates.
 *   7. `destroy()` unsubscribes from `state.filters` so subsequent filter
 *      changes do not invoke the now-detached coordinator.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CrossfilterCoordinator } from '@/visualizations/CrossfilterCoordinator';
import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import type { Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';

/**
 * Stub viz with a settable destroyed flag and an updateFilters spy.
 */
function makeViz(): BaseVisualization & {
  __destroyed: boolean;
  __calls: Filter[][];
} {
  const obj = {
    __destroyed: false,
    __calls: [] as Filter[][],
    isDestroyed: () => obj.__destroyed,
    async updateFilters(filters: Filter[]): Promise<void> {
      obj.__calls.push([...filters]);
    },
  };
  return obj as unknown as BaseVisualization & { __destroyed: boolean; __calls: Filter[][] };
}

function makeBridge(rowCount = 0): WorkerBridge {
  return {
    query: vi.fn().mockResolvedValue([{ cnt: rowCount }]),
    clearQueryCache: vi.fn(),
  } as unknown as WorkerBridge;
}

let state: ReturnType<typeof createTableState>;
let bridge: WorkerBridge;
let actions: StateActions;
let coord: CrossfilterCoordinator | null = null;

beforeEach(() => {
  state = createTableState();
  state.tableName.set('t');
  state.totalRows.set(1000);
  bridge = makeBridge(1000);
  actions = new StateActions(state, bridge);
  coord = null;
});

afterEach(() => {
  if (coord) coord.destroy();
  coord = null;
});

describe('CrossfilterCoordinator — filter flow', () => {
  it('handleFilterChange(col, filter) routes to actions.addFilter', () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    const filter: Filter = { type: 'point', column: 'age', value: 30 } as Filter;
    coord.handleFilterChange('age', filter);
    expect(state.filters.get()).toEqual([filter]);
  });

  it('handleFilterChange(col, null) routes to actions.removeFilter', () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    actions.addFilter({ type: 'point', column: 'age', value: 30 } as Filter);
    actions.addFilter({ type: 'point', column: 'name', value: 'a' } as Filter);
    expect(state.filters.get()).toHaveLength(2);

    coord.handleFilterChange('age', null);
    const remaining = state.filters.get();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.column).toBe('name');
  });

  it('a filter change broadcasts updateFilters to every registered, non-destroyed peer', async () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    const a = makeViz();
    const b = makeViz();
    coord.register('age', a);
    coord.register('name', b);

    const filter: Filter = { type: 'point', column: 'age', value: 30 } as Filter;
    state.filters.set([filter]);

    // Wait for the (synchronous) signal subscriber to fan out and complete
    // its in-flight viz updates. The signal callback uses void Promise
    // chaining so we drain the microtask queue + a macrotask round-trip.
    await new Promise((r) => setTimeout(r, 30));

    expect(a.__calls).toHaveLength(1);
    expect(a.__calls[0]).toEqual([filter]);
    expect(b.__calls).toHaveLength(1);
    expect(b.__calls[0]).toEqual([filter]);
  });

  it('multi-column composition: filters from two columns broadcast as a combined array to every viz', async () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    const a = makeViz();
    const b = makeViz();
    coord.register('age', a);
    coord.register('name', b);

    const f1: Filter = { type: 'point', column: 'age', value: 30 } as Filter;
    const f2: Filter = { type: 'point', column: 'name', value: 'x' } as Filter;
    actions.addFilter(f1);
    actions.addFilter(f2);

    await new Promise((r) => setTimeout(r, 50));

    // The most recent broadcast carries both filters.
    const lastA = a.__calls[a.__calls.length - 1];
    const lastB = b.__calls[b.__calls.length - 1];
    expect(lastA).toEqual([f1, f2]);
    expect(lastB).toEqual([f1, f2]);
  });

  it('updateFilteredRowCount queries COUNT(*) and updates state.filteredRows', async () => {
    bridge = makeBridge(42);
    coord = new CrossfilterCoordinator(state, actions, bridge);
    state.filters.set([{ type: 'point', column: 'age', value: 30 } as Filter]);

    await new Promise((r) => setTimeout(r, 30));
    expect(state.filteredRows.get()).toBe(42);
    expect(bridge.query).toHaveBeenCalled();
    const sql = (bridge.query as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0];
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('"t"');
  });

  it('clearing filters resets filteredRows to totalRows without issuing a query', async () => {
    bridge = makeBridge(42);
    coord = new CrossfilterCoordinator(state, actions, bridge);

    state.filters.set([{ type: 'point', column: 'age', value: 30 } as Filter]);
    await new Promise((r) => setTimeout(r, 30));
    expect(state.filteredRows.get()).toBe(42);

    (bridge.query as unknown as { mockClear: () => void }).mockClear();
    state.filters.set([]);
    await new Promise((r) => setTimeout(r, 10));
    expect(state.filteredRows.get()).toBe(state.totalRows.get());
    expect(bridge.query).not.toHaveBeenCalled();
  });

  it('a destroyed peer is skipped during broadcast; survivors still receive updateFilters', async () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    const a = makeViz();
    const b = makeViz();
    coord.register('age', a);
    coord.register('name', b);

    a.__destroyed = true; // mark before the broadcast

    state.filters.set([{ type: 'point', column: 'name', value: 'x' } as Filter]);
    await new Promise((r) => setTimeout(r, 30));

    expect(a.__calls).toHaveLength(0);
    expect(b.__calls).toHaveLength(1);
  });

  it('destroy() unsubscribes from state.filters so subsequent changes do not fire updateFilters', async () => {
    coord = new CrossfilterCoordinator(state, actions, bridge);
    const a = makeViz();
    coord.register('age', a);

    state.filters.set([{ type: 'point', column: 'age', value: 1 } as Filter]);
    await new Promise((r) => setTimeout(r, 30));
    expect(a.__calls).toHaveLength(1);

    coord.destroy();
    coord = null; // afterEach guard

    state.filters.set([{ type: 'point', column: 'age', value: 2 } as Filter]);
    await new Promise((r) => setTimeout(r, 30));
    // No new update.
    expect(a.__calls).toHaveLength(1);
  });

  it('updateFilteredRowCount drops stale results via filterSequence (newer overrides older)', async () => {
    let resolveFirst: ((v: unknown) => void) | null = null;
    let resolveSecond: ((v: unknown) => void) | null = null;
    const queryMock = vi
      .fn<(sql: string) => Promise<{ cnt: number }[]>>()
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res as unknown as (v: unknown) => void;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSecond = res as unknown as (v: unknown) => void;
          }),
      );
    bridge = { query: queryMock, clearQueryCache: vi.fn() } as unknown as WorkerBridge;
    coord = new CrossfilterCoordinator(state, actions, bridge);

    // Two filter changes back-to-back schedule two COUNT queries.
    actions.addFilter({ type: 'point', column: 'age', value: 1 } as Filter);
    await Promise.resolve();
    actions.addFilter({ type: 'point', column: 'age', value: 2 } as Filter);
    await new Promise((r) => setTimeout(r, 5));

    // Resolve OLDER first → seq guard inside updateFilteredRowCount drops the
    // assignment because filterSequence has already advanced.
    resolveFirst!([{ cnt: 99 }]);
    await new Promise((r) => setTimeout(r, 10));

    // Resolve NEWER → its assignment lands.
    resolveSecond!([{ cnt: 7 }]);
    await new Promise((r) => setTimeout(r, 10));

    expect(state.filteredRows.get()).toBe(7);
  });
});
