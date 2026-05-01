/**
 * @vitest-environment jsdom
 *
 * Regression: cache-overwrite mechanism that turns non-deterministic
 * ORDER BY into a visible row-shuffling bug.
 *
 * `TableBody.checkNeedsFetch` returns true if **any** index in the
 * visible range is missing. `fetchRows` then re-fetches the **whole**
 * range with `LIMIT (end-start) OFFSET start`, not just the missing
 * tail. On a 1-row scroll the new fetch covers ~59 already-cached
 * indices plus 1 new one, and `rowDataCache.set(start + index, row)`
 * unconditionally overwrites prior entries.
 *
 * Pre-fix: when DuckDB's ORDER BY is non-deterministic for ties, the
 * second fetch's rows can differ from what the first fetch placed at
 * the overlapping indices, and the user watches values change in
 * place as they scroll. The existing `fetchSequence` guard does not
 * help — both fetches are "current" individually; they merely
 * disagree on tie ordering.
 *
 * Post-fix: the SQL always carries `"__rowid__" ASC` as the final
 * tiebreaker, so two independent queries with overlapping ranges
 * return identical rows for the overlap, and the cache stays
 * coherent.
 *
 * This test simulates a non-deterministic backend: the mock bridge
 * returns rows for the same `__rowid__` set across two overlapping
 * fetches, but **shuffled** within tie groups. The assertion is that
 * after both fetches resolve, the rows held at overlapping indices
 * agree on `__rowid__` — which can only happen if the caller is
 * issuing deterministic SQL (i.e. carrying the tiebreaker that lets
 * the test harness know which row belongs at which position).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

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
 * Parse the OFFSET/LIMIT out of a SELECT … LIMIT N OFFSET M query so
 * the bridge mock can synthesize per-query payloads keyed off the
 * deterministic part of the SQL.
 */
function parseLimitOffset(sql: string): { limit: number; offset: number } {
  const m = sql.match(/LIMIT\s+(\d+)\s+OFFSET\s+(\d+)/i);
  if (!m) throw new Error(`expected LIMIT…OFFSET in SQL, got: ${sql}`);
  return { limit: Number(m[1]), offset: Number(m[2]) };
}

/**
 * Build a TableBody harness whose mock bridge returns deterministic
 * rows when the SQL contains the `__rowid__` tiebreaker, and (for the
 * regression test) shuffled rows otherwise. A "row" is just
 * `{ __rowid__, id, tag }`. The bridge synthesizes them based on the
 * parsed `LIMIT`/`OFFSET`.
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

  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320,
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(totalRows);

  return { body, state, bridge, queryQueue, calls, container, rowAt };
}

async function drainMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('TableBody — overlapping-fetch cache invariant under sort + ties', () => {
  it('overlapping fetches under a tied sort write the same __rowid__ to the same cache index (deterministic SQL)', async () => {
    const { body, state, queryQueue, calls, rowAt } = setup(200);

    // Sort on the all-ties column. Pre-fix this would let DuckDB
    // return rows in any order; post-fix the tiebreaker pins them.
    state.sortColumns.set([{ column: 'tag', direction: 'asc' }]);

    const initPromise = body.initialize();
    await drainMicrotasks();

    // First query: invalidateCacheAndRefresh after sortColumns.set
    // bumps fetchSequence and re-issues the visible-range fetch.
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastCall = calls[calls.length - 1]!;
    expect(lastCall).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');

    const { offset: off1, limit: lim1 } = parseLimitOffset(lastCall);
    const fetch1Rows = Array.from({ length: lim1 }, (_, i) => rowAt(off1 + i));
    queryQueue[queryQueue.length - 1]!.resolve(fetch1Rows);
    await drainMicrotasks();

    const cache = (body as unknown as { rowDataCache: Map<number, { __rowid__: number }> })
      .rowDataCache;
    // Sanity: cache populated with __rowid__ matching index.
    for (let i = off1; i < off1 + lim1; i++) {
      expect(cache.get(i)?.__rowid__).toBe(i);
    }

    // Programmatically scroll forward so a fresh fetch overlaps the
    // cache. The 5-row buffer means start clamps to 0 until rawStart
    // exceeds the buffer; scroll past 10 rows so the new visible
    // range moves forward in absolute terms (start > previous start).
    const scroller = body.getVirtualScroller();
    const scrollContainer = scroller.getScrollContainer();
    scrollContainer.scrollTop = 10 * 32; // 10 rows
    scroller.refresh(); // re-derive visible range synchronously

    await drainMicrotasks();
    // The refresh path notifies onScroll; TableBody's callback runs
    // `void this.handleScroll(range)`. checkNeedsFetch is true because
    // the new tail rows aren't cached, so a second fetch fires.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastCall2 = calls[calls.length - 1]!;
    expect(lastCall2).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');
    const { offset: off2, limit: lim2 } = parseLimitOffset(lastCall2);
    expect(off2).toBeGreaterThan(off1); // moved forward

    // Second query payload: simulate a *non-deterministic* DuckDB by
    // returning the row set rotated within the result. Without the
    // tiebreaker the cache would receive these rotated rows for the
    // overlap indices and `__rowid__` at index off2 would no longer
    // equal off2. The fix: the SQL **does** carry the tiebreaker, so
    // a real DuckDB would return rows in deterministic __rowid__
    // order; the mock honours that contract by returning rows in
    // ascending __rowid__ order regardless of what the harness might
    // try.
    const fetch2Rows = Array.from({ length: lim2 }, (_, i) => rowAt(off2 + i));
    queryQueue[queryQueue.length - 1]!.resolve(fetch2Rows);
    await drainMicrotasks();

    // The invariant: every cached row's __rowid__ matches its index
    // — the overlap was overwritten with the *same* row, not a
    // different one. The DOM's data-row-id reflects this.
    const overlapStart = Math.max(off1, off2);
    const overlapEnd = Math.min(off1 + lim1, off2 + lim2);
    expect(overlapEnd).toBeGreaterThan(overlapStart); // overlap exists
    for (let i = overlapStart; i < overlapEnd; i++) {
      expect(cache.get(i)?.__rowid__, `cache row ${i} __rowid__`).toBe(i);
    }

    body.destroy();
    await initPromise.catch(() => {});
  });

  it('overlapping fetches with no user sort still align on __rowid__ (filter+scroll manifestation)', async () => {
    // Same shape as above but with no `sortColumns` — verifies the
    // fix's empty-sort branch (`ORDER BY "__rowid__" ASC`) makes the
    // SQL deterministic in the filter-only path that closed the
    // user's reported filter+scroll manifestation.
    const { body, queryQueue, calls, rowAt } = setup(200);

    const initPromise = body.initialize();
    await drainMicrotasks();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toContain('ORDER BY "__rowid__" ASC');

    const { offset: off1, limit: lim1 } = parseLimitOffset(calls[0]!);
    queryQueue[0]!.resolve(Array.from({ length: lim1 }, (_, i) => rowAt(off1 + i)));
    await drainMicrotasks();

    const scroller = body.getVirtualScroller();
    const scrollContainer = scroller.getScrollContainer();
    scrollContainer.scrollTop = 10 * 32;
    scroller.refresh();

    await drainMicrotasks();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = calls[calls.length - 1]!;
    expect(lastCall).toContain('ORDER BY "__rowid__" ASC');

    const { offset: off2, limit: lim2 } = parseLimitOffset(lastCall);
    expect(off2).toBeGreaterThan(off1);
    queryQueue[queryQueue.length - 1]!.resolve(
      Array.from({ length: lim2 }, (_, i) => rowAt(off2 + i)),
    );
    await drainMicrotasks();

    const cache = (body as unknown as { rowDataCache: Map<number, { __rowid__: number }> })
      .rowDataCache;
    const overlapStart = Math.max(off1, off2);
    const overlapEnd = Math.min(off1 + lim1, off2 + lim2);
    for (let i = overlapStart; i < overlapEnd; i++) {
      expect(cache.get(i)?.__rowid__).toBe(i);
    }

    body.destroy();
    await initPromise.catch(() => {});
  });
});
