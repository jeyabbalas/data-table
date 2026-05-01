/**
 * @vitest-environment jsdom
 *
 * Regression: filter race after `createDataTable({ source })` resolves.
 *
 * The body's first `bridge.query` for unfiltered rows (kicked off
 * fire-and-forget by `TableContainer.render()` → `tableBody.initialize()`)
 * could land *after* a synchronous `addFilter` cleared `rowDataCache`,
 * polluting the just-cleared cache with stale unfiltered rows. The next
 * `checkNeedsFetch` then short-circuited (cache "full") and the user saw
 * unfiltered rows in the rendered table even though `state.filters`
 * carried the new filter.
 *
 * Fixed by tagging each `fetchRows` invocation with a monotonic
 * `fetchSequence` and dropping its result when seq has been bumped — the
 * same idiom `CrossfilterCoordinator.filterSequence` and
 * `BaseVisualization.fetchSequence` use elsewhere in the library.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';

// Minimal deferred — same shape as the helper in
// `tests/DataTable.destroy.race.test.ts:33-46`. Lets a test interleave
// signal mutations between a `bridge.query()` call and its resolution.
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// MockResizeObserver — required by VirtualScroller construction in JSDOM.
class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tag', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Create a TableBody whose virtual scroller reports a non-zero clientHeight
 * — JSDOM defaults to 0, which would short-circuit `initialize()` past the
 * first `handleScroll(range)` call (effectiveTotal stays 0, never reached).
 */
function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  state.filteredRows.set(100);

  const queryQueue: Deferred<unknown[]>[] = [];
  const calls: string[] = [];
  const bridge = {
    query: vi.fn((sql: string) => {
      calls.push(sql);
      const d = deferred<unknown[]>();
      queryQueue.push(d);
      return d.promise;
    }),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);

  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
  );

  // Force a non-empty visible range so initialize() actually triggers a
  // fetch. Without this JSDOM reports clientHeight=0 and `effectiveTotal`
  // is gated by `if (effectiveTotal > 0)` at TableBody.ts:174 — but the
  // condition fires; the issue is that `getVisibleRange()` returns 0..0
  // and `checkNeedsFetch` is false-from-empty. Stub clientHeight on the
  // scroller's container so we get a real range.
  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320, // 10 rows at rowHeight=32
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(100);

  return { body, state, bridge, queryQueue, calls, container };
}

describe('TableBody — race protection (fetchSequence)', () => {
  it('an addFilter dispatched while the initial fetch is in-flight does NOT pollute the cache with unfiltered rows', async () => {
    const { body, state, queryQueue } = setup();

    // Kick off initialize() but do NOT await it: the initial unfiltered
    // SELECT is now sitting at `await bridge.query(sql)` inside fetchRows.
    const initPromise = body.initialize();

    // The fire-and-forget initial fetch ran sync up to the first await;
    // exactly one query is queued.
    expect(queryQueue.length).toBe(1);

    // User calls addFilter immediately after `await createDataTable(...)`.
    // synchronous fan-out: TableBody's filter subscriber clears the cache,
    // bumps fetchSequence, and queues a pending fetch (because
    // fetchInProgress is still true from the initial fetch).
    const filter: Filter = { type: 'point', column: 'tag', value: 'A' };
    state.filters.set([filter]);

    // Resolve the in-flight unfiltered query AFTER the filter mutation —
    // this is the exact bug timeline. Sentinel `tag` values let us prove
    // the rows never reach the cache.
    queryQueue[0]!.resolve([
      { __rowid__: 0, id: 0, tag: 'UNFILTERED' },
      { __rowid__: 1, id: 1, tag: 'UNFILTERED' },
    ]);

    // Drain microtasks so fetchRows resumes after its await.
    await Promise.resolve();
    await Promise.resolve();

    // The seq guard inside fetchRows must drop the stale rows BEFORE they
    // land in rowDataCache. The cache should be empty (cleared by
    // invalidateCacheAndRefresh and never re-populated by the stale fetch).
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).not.toBe('UNFILTERED');
    }

    // Now the pending fetch should have been kicked off in
    // `fetchAndRender`'s `finally`. A second query is queued — and its SQL
    // carries the new WHERE clause.
    expect(queryQueue.length).toBe(2);
    expect((queryQueue[1] as unknown as never) !== undefined).toBe(true);

    // Resolve the pending (filtered) fetch. Now the cache should fill.
    queryQueue[1]!.resolve([{ __rowid__: 0, id: 0, tag: 'A' }]);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.size).toBeGreaterThan(0);
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).toBe('A');
    }

    // initialize() resolves once its outer await chain settles (which
    // includes the pendingFetch via finally). Don't leave a dangling promise.
    body.destroy();
    // After destroy(), any further worker responses are silently ignored.
    // Resolve initPromise's path — initialize already returned in finally.
    await initPromise.catch(() => {});
  });

  it('the SQL of the pending fetch contains the new filter predicate', async () => {
    const { body, state, queryQueue, calls } = setup();

    const initPromise = body.initialize();
    expect(queryQueue.length).toBe(1);
    expect(calls[0]).not.toContain('WHERE');

    const filter: Filter = { type: 'point', column: 'tag', value: 'A' };
    state.filters.set([filter]);

    queryQueue[0]!.resolve([{ __rowid__: 0, id: 0, tag: 'UNFILTERED' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(queryQueue.length).toBe(2);
    expect(calls[1]).toContain('WHERE');
    expect(calls[1]).toContain("'A'");

    queryQueue[1]!.resolve([{ __rowid__: 0, id: 0, tag: 'A' }]);
    await Promise.resolve();

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('a sort change mid-fetch drops the stale unsorted rows', async () => {
    const { body, state, queryQueue } = setup();

    const initPromise = body.initialize();
    expect(queryQueue.length).toBe(1);

    // Trigger sort change while the first fetch is in flight. TableBody's
    // sortColumns subscriber also funnels into invalidateCacheAndRefresh.
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);

    queryQueue[0]!.resolve([
      { __rowid__: 0, id: 0, tag: 'UNSORTED' },
      { __rowid__: 1, id: 1, tag: 'UNSORTED' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).not.toBe('UNSORTED');
    }

    expect(queryQueue.length).toBe(2);

    // Resolve the pending sorted fetch so initialize() can settle. (Since
    // the contract fix, initialize() awaits first paint — including the
    // pendingFetch processed in `fetchAndRender`'s finally — instead of
    // returning early. Leaving queryQueue[1] unresolved would hang
    // initPromise indefinitely.)
    queryQueue[1]!.resolve([{ __rowid__: 0, id: 0, tag: 'A' }]);
    await Promise.resolve();
    await Promise.resolve();

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('destroy() during an in-flight fetch silently drops the result', async () => {
    const { body, queryQueue } = setup();

    const initPromise = body.initialize();
    expect(queryQueue.length).toBe(1);

    body.destroy();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryQueue[0]!.resolve([{ __rowid__: 0, id: 0, tag: 'POST_DESTROY' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();

    // rowDataCache is cleared in destroy(), so it's already empty regardless.
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.size).toBe(0);

    await initPromise.catch(() => {});
  });
});
