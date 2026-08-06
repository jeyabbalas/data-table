/**
 * @vitest-environment jsdom
 *
 * Regression: cache-write mechanism that turns non-deterministic
 * ORDER BY into a visible row-shuffling bug.
 *
 * The block pipeline fetches aligned windows (`fetchBlockSize` rows) and
 * writes them at `rowDataCache.set(blockStart + i, row)`. Two fetches
 * never cover the same index within an epoch (blocks are disjoint), but
 * the failure mode survives in a different shape: when DuckDB's ORDER BY
 * is non-deterministic for ties, two *independently executed* block
 * queries can permute the tied rows differently — block 1's window then
 * contains rows that block 0 already returned (and drops others), and
 * adjacent positions show duplicated or missing rows that change as the
 * user scrolls.
 *
 * Post-fix: the SQL always carries `"__rowid__" ASC` as the final
 * tiebreaker, so every block query agrees on one global order and each
 * absolute index maps to exactly one `__rowid__`, no matter which query
 * fetched it.
 *
 * The mock bridge honours the determinism contract (rows come back in
 * ascending `__rowid__` order for the requested window, exactly as a
 * real DuckDB would under the tiebreaker); the invariant asserted is
 * that every cached index — across the UNION of both fetched windows,
 * which no longer overlap by construction — holds the row whose
 * `__rowid__` equals that index.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

import { makeRowFetchBridge, parseRowWindow } from '../helpers/rowFetchBridge';

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tag', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

const BLOCK = 16; // small block size for readable offsets

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Build a TableBody harness over the deferred mock bridge. Prefetch is
 * disabled: this suite is about the determinism of the SQL each window
 * fetch emits, and a speculative background fetch would only add noise
 * to the call indices.
 */
function setup(totalRows = 200) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(totalRows);
  state.filteredRows.set(totalRows);

  // Synthesize a row where every row shares the same `tag` so a sort
  // on `tag` produces all-ties. `__rowid__` is the unique key the
  // tiebreaker pins.
  function rowAt(rowid: number) {
    return { __rowid__: rowid, id: rowid, tag: 'TIE' };
  }

  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);

  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
    { fetchBlockSize: BLOCK, prefetch: false },
  );

  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320, // 10 rows at rowHeight=32 (+5 buffer rows each side)
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(totalRows);

  return { body, state, bridge, queries, container, rowAt };
}

async function drainMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/**
 * The shared invariant: the union of the fetched windows is contiguously
 * cached and every cached index holds the row whose `__rowid__` equals it.
 */
function expectRowidAgreement(
  cache: Map<number, { __rowid__: number }>,
  windows: Array<{ offset: number; limit: number }>,
): void {
  const unionStart = Math.min(...windows.map((w) => w.offset));
  const unionEnd = Math.max(...windows.map((w) => w.offset + w.limit));
  expect(cache.size).toBe(unionEnd - unionStart);
  for (let i = unionStart; i < unionEnd; i++) {
    expect(cache.get(i)?.__rowid__, `cache row ${i} __rowid__`).toBe(i);
  }
}

describe('TableBody — cross-block cache invariant under sort + ties', () => {
  it('block fetches under a tied sort write the same __rowid__ to the same cache index (deterministic SQL)', async () => {
    const { body, state, queries, rowAt } = setup(200);

    // Sort on the all-ties column. Pre-fix this would let DuckDB
    // return rows in any order; post-fix the tiebreaker pins them.
    state.sortColumns.set([{ column: 'tag', direction: 'asc' }]);

    const initPromise = body.initialize();
    await drainMicrotasks();

    // Initial range {0..15} sits inside block 0 → exactly one
    // block-aligned fetch.
    expect(queries.length).toBe(1);
    const sql1 = queries[0]!.sql;
    expect(sql1).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');

    const { offset: off1, limit: lim1 } = parseRowWindow(sql1);
    expect(off1 % BLOCK).toBe(0); // block-aligned
    expect(lim1).toBeLessThanOrEqual(BLOCK);
    queries[0]!.deferred.resolve(Array.from({ length: lim1 }, (_, i) => rowAt(off1 + i)));
    await drainMicrotasks();

    const cache = (body as unknown as { rowDataCache: Map<number, { __rowid__: number }> })
      .rowDataCache;
    // Sanity: cache populated with __rowid__ matching index.
    for (let i = off1; i < off1 + lim1; i++) {
      expect(cache.get(i)?.__rowid__).toBe(i);
    }

    // Programmatically scroll forward so the next window needs the
    // adjacent block. The 5-row buffer means start clamps to 0 until
    // rawStart exceeds the buffer; scroll past 10 rows so the visible
    // range {5..25} spans block 0 (cached) and block 16 (missing).
    const scroller = body.getVirtualScroller();
    const scrollContainer = scroller.getScrollContainer();
    scrollContainer.scrollTop = 10 * 32; // 10 rows
    scroller.refresh(); // re-derive visible range synchronously

    await drainMicrotasks();
    // handleScroll rendered immediately and the reconciler issued
    // exactly the one missing block.
    expect(queries.length).toBe(2);
    const sql2 = queries[1]!.sql;
    expect(sql2).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');
    const { offset: off2, limit: lim2 } = parseRowWindow(sql2);
    expect(off2).toBeGreaterThan(off1); // moved forward
    expect(off2 % BLOCK).toBe(0); // still block-aligned

    // Second query payload: the mock honours the determinism contract —
    // under the tiebreaker a real DuckDB returns the window's rows in
    // ascending __rowid__ order, every time, for every query. Without
    // the tiebreaker the tied rows could permute across the two
    // independent queries and the same absolute index would receive a
    // different row than a neighbouring fetch placed around it.
    queries[1]!.deferred.resolve(Array.from({ length: lim2 }, (_, i) => rowAt(off2 + i)));
    await drainMicrotasks();

    // The invariant, block edition: the union of both windows is
    // contiguously cached and every index agrees with its __rowid__.
    // (Aligned blocks are disjoint, so there is no overlap to compare —
    // agreement across the union is the same guarantee.)
    expectRowidAgreement(cache, [
      { offset: off1, limit: lim1 },
      { offset: off2, limit: lim2 },
    ]);

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('block fetches with no user sort still align on __rowid__ (filter+scroll manifestation)', async () => {
    // Same shape as above but with no `sortColumns` — verifies the
    // fix's empty-sort branch (`ORDER BY "__rowid__" ASC`) makes the
    // SQL deterministic in the filter-only path that closed the
    // user's reported filter+scroll manifestation.
    const { body, queries, rowAt } = setup(200);

    const initPromise = body.initialize();
    await drainMicrotasks();

    expect(queries.length).toBe(1);
    expect(queries[0]!.sql).toContain('ORDER BY "__rowid__" ASC');

    const { offset: off1, limit: lim1 } = parseRowWindow(queries[0]!.sql);
    expect(off1 % BLOCK).toBe(0);
    queries[0]!.deferred.resolve(Array.from({ length: lim1 }, (_, i) => rowAt(off1 + i)));
    await drainMicrotasks();

    const scroller = body.getVirtualScroller();
    const scrollContainer = scroller.getScrollContainer();
    scrollContainer.scrollTop = 10 * 32;
    scroller.refresh();

    await drainMicrotasks();
    expect(queries.length).toBe(2);
    const sql2 = queries[1]!.sql;
    expect(sql2).toContain('ORDER BY "__rowid__" ASC');

    const { offset: off2, limit: lim2 } = parseRowWindow(sql2);
    expect(off2).toBeGreaterThan(off1);
    expect(off2 % BLOCK).toBe(0);
    queries[1]!.deferred.resolve(Array.from({ length: lim2 }, (_, i) => rowAt(off2 + i)));
    await drainMicrotasks();

    const cache = (body as unknown as { rowDataCache: Map<number, { __rowid__: number }> })
      .rowDataCache;
    expectRowidAgreement(cache, [
      { offset: off1, limit: lim1 },
      { offset: off2, limit: lim2 },
    ]);

    body.destroy();
    await initPromise.catch(() => {});
  });
});
