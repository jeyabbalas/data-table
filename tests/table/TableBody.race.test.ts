/**
 * @vitest-environment jsdom
 *
 * Regression: filter race after `createDataTable({ source })` resolves.
 *
 * The body's first `bridge.query` for unfiltered rows (kicked off
 * fire-and-forget by `TableContainer.render()` → `tableBody.initialize()`)
 * could land *after* a synchronous `addFilter` cleared `rowDataCache`,
 * polluting the just-cleared cache with stale unfiltered rows. The next
 * reconcile then saw a "full" cache and the user got unfiltered rows in
 * the rendered table even though `state.filters` carried the new filter.
 *
 * Two layers defend against this in the block pipeline:
 *  1. `invalidateCacheAndRefresh` aborts every in-flight block fetch, so
 *     with the real bridge the superseded query rejects (QUERY_ABORTED)
 *     and its rows never exist; the replacement query is issued
 *     immediately instead of waiting behind the old one.
 *  2. The `epoch` guard (the successor of `fetchSequence`, same idiom as
 *     `CrossfilterCoordinator.filterSequence` /
 *     `BaseVisualization.fetchSequence`) drops the rows of any fetch that
 *     somehow resolves after the state changed — exercised here with a
 *     bridge double that deliberately resolves after its abort.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';

import {
  makeRowFetchBridge,
  parseRowWindow,
  rowsFor,
  type RowFetchBridgeOptions,
} from '../helpers/rowFetchBridge';

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
const COLUMNS = ['id', 'tag'];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Create a TableBody whose virtual scroller reports a non-zero clientHeight
 * — JSDOM defaults to 0, which would leave `getVisibleRange()` at 0..0 and
 * `initialize()` with nothing to fetch.
 */
function setup(bridgeOptions: RowFetchBridgeOptions = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  state.filteredRows.set(100);

  const { bridge, queries } = makeRowFetchBridge(bridgeOptions);
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);

  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
  );

  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320, // 10 rows at rowHeight=32
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(100);

  return { body, state, bridge, queries, container };
}

describe('TableBody — race protection (epoch guard + superseded-fetch abort)', () => {
  it('an addFilter dispatched while the initial fetch is in-flight does NOT pollute the cache with unfiltered rows', async () => {
    // `rejectOnAbort: false` emulates a double that RESOLVES after its
    // signal aborted — the epoch/aborted post-await guards are the only
    // thing standing between those rows and the cache.
    const { body, state, queries } = setup({ rejectOnAbort: false });

    // Kick off initialize() but do NOT await it: the initial unfiltered
    // SELECT is now sitting at `await bridge.query(...)` inside fetchBlock.
    const initPromise = body.initialize();

    // The initial fetch ran sync up to the first await; with the default
    // 128-row block and totalRows=100, the whole table is one block.
    expect(queries.length).toBe(1);

    // User calls addFilter immediately after `await createDataTable(...)`.
    // Synchronous fan-out: TableBody's filter subscriber invalidates —
    // epoch bump, superseded fetch aborted, cache cleared, placeholders
    // painted, and the filtered replacement query issued IMMEDIATELY (the
    // old pipeline made it wait for the in-flight fetch to resolve first).
    const filter: Filter = { type: 'point', column: 'tag', value: 'A' };
    state.filters.set([filter]);

    expect(queries[0]!.signal?.aborted).toBe(true);
    expect(queries.length).toBe(2);
    expect(queries[1]!.sql).toContain('WHERE');

    // Resolve the superseded unfiltered query AFTER the filter mutation —
    // the exact bug timeline. Sentinel `tag` values prove the rows never
    // reach the cache.
    queries[0]!.deferred.resolve([
      { __rowid__: 0, id: 0, tag: 'UNFILTERED' },
      { __rowid__: 1, id: 1, tag: 'UNFILTERED' },
    ]);

    // Drain microtasks so fetchBlock resumes after its await.
    await Promise.resolve();
    await Promise.resolve();

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).not.toBe('UNFILTERED');
    }

    // Resolve the filtered fetch with its full requested window. Now the
    // cache fills — with filtered rows only.
    const window1 = parseRowWindow(queries[1]!.sql);
    queries[1]!.deferred.resolve(
      Array.from({ length: window1.limit }, (_, k) => ({
        __rowid__: window1.offset + k,
        id: window1.offset + k,
        tag: 'A',
      })),
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.size).toBeGreaterThan(0);
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).toBe('A');
    }

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('the superseding fetch is issued immediately and carries the new filter predicate', async () => {
    const { body, state, queries } = setup();

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);
    expect(queries[0]!.sql).not.toContain('WHERE');

    const filter: Filter = { type: 'point', column: 'tag', value: 'A' };
    state.filters.set([filter]);

    // No resolution needed for the superseded call: the bridge mirror
    // rejects it on abort, and the replacement is already issued.
    expect(queries[0]!.signal?.aborted).toBe(true);
    expect(queries.length).toBe(2);
    expect(queries[1]!.sql).toContain('WHERE');
    expect(queries[1]!.sql).toContain("'A'");

    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, COLUMNS));
    await Promise.resolve();

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('a sort change mid-fetch drops the stale unsorted rows', async () => {
    // Resolve-after-abort double again: the epoch guard does the dropping.
    const { body, state, queries } = setup({ rejectOnAbort: false });

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);

    // Trigger sort change while the first fetch is in flight. TableBody's
    // sortColumns subscriber also funnels into invalidateCacheAndRefresh.
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);

    expect(queries[0]!.signal?.aborted).toBe(true);
    expect(queries.length).toBe(2);

    queries[0]!.deferred.resolve([
      { __rowid__: 0, id: 0, tag: 'UNSORTED' },
      { __rowid__: 1, id: 1, tag: 'UNSORTED' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    for (const [, row] of cache) {
      expect((row as { tag?: string }).tag).not.toBe('UNSORTED');
    }

    // Resolve the sorted fetch so nothing dangles.
    expect(queries[1]!.sql).toContain('ORDER BY "id" DESC');
    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, COLUMNS));
    await Promise.resolve();
    await Promise.resolve();

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('destroy() during an in-flight fetch aborts it and silently drops the result', async () => {
    const { body, queries } = setup();

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    body.destroy();

    // destroy() aborts every captured signal; the bridge mirror rejects the
    // deferred with QUERY_ABORTED, which fetchBlock swallows silently.
    for (const q of queries) {
      expect(q.signal?.aborted).toBe(true);
    }

    // A late resolve on the already-rejected deferred is a no-op.
    queries[0]!.deferred.resolve([{ __rowid__: 0, id: 0, tag: 'POST_DESTROY' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.size).toBe(0);

    await initPromise.catch(() => {});
  });
});

/**
 * The other half of the same subscriber: which `visibleColumns` writes are
 * allowed to reach `invalidateCacheAndRefresh` at all. Shares this file's
 * harness because the assertion is a query count, which needs both a
 * controllable bridge and a non-zero viewport.
 */
describe('TableBody — visibleColumns: reorder vs. set change', () => {
  it('a same-set reorder renders from the warm cache while a real set change re-fetches', async () => {
    const { body, state, queries } = setup();

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);

    // Resolve the initial fetch with its full requested window (the whole
    // 100-row table fits one 128-row block). A short resolve would leave
    // the block half-cached, and the control assertion at the bottom would
    // then pass for the wrong reason.
    const window0 = parseRowWindow(queries[0]!.sql);
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, COLUMNS));
    await initPromise;

    const range = body.getVisibleRange();
    expect(range.end).toBeGreaterThan(range.start);
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    // Block-quantized fetch: the cache holds the whole block, not just the
    // visible slice — and every visible index is covered.
    expect(cache.size).toBe(window0.limit);
    for (let i = range.start; i < range.end; i++) {
      expect(cache.has(i), `cache covers visible row ${i}`).toBe(true);
    }
    const callsAfterInit = queries.length;

    // What one step of a keyboard column move writes: the same names in a new
    // order. Rows are keyed by column name, so every value the new order needs
    // is already cached — invalidating here round-trips DuckDB once per
    // keystroke for data the body is already holding.
    state.visibleColumns.set(['tag', 'id']);

    expect(queries.length).toBe(callsAfterInit);
    expect(cache.size).toBe(window0.limit);

    // Control: dropping a column is a genuine set change, and the projection
    // it needs is not in the cache — so this one must still invalidate.
    state.visibleColumns.set(['tag']);

    expect(queries.length).toBe(callsAfterInit + 1);
    expect(cache.size).toBe(0);

    queries[queries.length - 1]!.deferred.resolve(
      rowsFor(queries[queries.length - 1]!.sql, ['tag']),
    );
    body.destroy();
  });
});
