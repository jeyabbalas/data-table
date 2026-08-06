/**
 * @vitest-environment jsdom
 *
 * Regression: row values shuffle while scrolling after sort/filter on a
 * column with duplicate values.
 *
 * `TableBody.buildRowQuery` issues paginated row fetches as
 * `… ORDER BY <userSort> LIMIT N OFFSET M`. Without an explicit unique
 * tiebreaker, DuckDB's ORDER BY is non-deterministic for ties: two
 * separate queries can permute rows that share the same sort key. The
 * scroll path re-fetches the **entire** visible range on every viewport
 * change (`checkNeedsFetch` returns true if any index is missing), so a
 * 1-row scroll fires a fresh query that overwrites ~59 already-cached
 * indices in `rowDataCache` — and with non-deterministic tie-breaking
 * the new rows differ from the cached ones. The user sees row contents
 * shuffle in place.
 *
 * The fix appends `"__rowid__" ASC` as the final tiebreaker (and emits
 * `ORDER BY "__rowid__" ASC` even when the user has no sort) so every
 * paginated SELECT is fully deterministic. Mirrors the idiom used in
 * `Actions.getColumnValues` (Actions.ts:1769) and the loader's
 * table-recreation paths (worker/loaders/common.ts).
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
 * Build a TableBody with a controllable bridge and a non-zero
 * clientHeight (JSDOM defaults to 0). Mirrors
 * `tests/table/TableBody.race.test.ts:setup`.
 */
function setup(totalRows = 100) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(totalRows);
  state.filteredRows.set(totalRows);

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

  // 320 / 32 = 10 rows visible; bufferRows=5 means range is roughly {0,15}.
  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320,
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(totalRows);

  return { body, state, bridge, queryQueue, calls, container };
}

describe('TableBody — __rowid__ tiebreaker on ORDER BY (buildRowQuery)', () => {
  it('emits ORDER BY "<userCol>" ASC, "__rowid__" ASC when user sort is set', async () => {
    const { body, state, queryQueue, calls } = setup();

    state.sortColumns.set([{ column: 'tag', direction: 'asc' }]);

    const initPromise = body.initialize();
    // Drain a microtask so the synchronous fetch dispatch has happened.
    await Promise.resolve();
    expect(queryQueue.length).toBeGreaterThanOrEqual(1);

    const sql = calls[calls.length - 1]!;
    expect(sql).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');
    expect(sql).not.toMatch(/ORDER BY "tag" ASC LIMIT/);

    queryQueue[queryQueue.length - 1]!.resolve([]);
    body.destroy();
    await initPromise.catch(() => {});
  });

  it('emits ORDER BY "<col1>" ASC, "<col2>" DESC, "__rowid__" ASC for multi-sort', async () => {
    const { body, state, queryQueue, calls } = setup();

    state.sortColumns.set([
      { column: 'tag', direction: 'asc' },
      { column: 'id', direction: 'desc' },
    ]);

    const initPromise = body.initialize();
    await Promise.resolve();

    const sql = calls[calls.length - 1]!;
    expect(sql).toContain('ORDER BY "tag" ASC, "id" DESC, "__rowid__" ASC');

    queryQueue[queryQueue.length - 1]!.resolve([]);
    body.destroy();
    await initPromise.catch(() => {});
  });

  it('emits the __rowid__ range fast path (ordered, no OFFSET) when no user sort', async () => {
    const { body, queryQueue, calls } = setup();

    const initPromise = body.initialize();
    await Promise.resolve();

    const sql = calls[0]!;
    // No filters + no user sort takes the fast path: a range predicate on
    // the dense __rowid__ instead of OFFSET pagination. Ordering by
    // __rowid__ is still explicit — scan order is not guaranteed — which
    // also closes the filter+scroll manifestation where a parallel-scan
    // permutation could return rows in a different order across fetches.
    expect(sql).toContain('WHERE "__rowid__" >= 0 AND "__rowid__" < 100');
    expect(sql).toContain('ORDER BY "__rowid__" ASC');
    expect(sql).not.toMatch(/OFFSET/i);

    // Resolve with exactly the requested window — a short result would
    // (correctly) trip the fast path's density valve into an OFFSET
    // re-issue, which is fastPathSql.test.ts's subject, not this one's.
    queryQueue[0]!.resolve(
      Array.from({ length: 100 }, (_, i) => ({ __rowid__: i, id: i, tag: `tag-${i}` })),
    );
    body.destroy();
    await initPromise.catch(() => {});
  });

  it('does not duplicate __rowid__ when user sort already includes it', async () => {
    const { body, state, queryQueue, calls } = setup();

    state.sortColumns.set([{ column: '__rowid__', direction: 'desc' }]);

    const initPromise = body.initialize();
    await Promise.resolve();

    const sql = calls[calls.length - 1]!;
    expect(sql).toContain('ORDER BY "__rowid__" DESC');
    // Tiebreaker append must skip when __rowid__ is already in the
    // user's sort: the user owns the direction, no trailing duplicate.
    expect(sql).not.toContain('"__rowid__" DESC, "__rowid__" ASC');

    queryQueue[queryQueue.length - 1]!.resolve([]);
    body.destroy();
    await initPromise.catch(() => {});
  });

  it('keeps user sort that includes __rowid__ in a non-final position untouched', async () => {
    // Edge case: user sorts by __rowid__ first, then by another column.
    // The append-skip only checks "is __rowid__ in sort?" — it should
    // not append again, because __rowid__ at any position already breaks
    // ties for the rest.
    const { body, state, queryQueue, calls } = setup();

    state.sortColumns.set([
      { column: '__rowid__', direction: 'asc' },
      { column: 'tag', direction: 'desc' },
    ]);

    const initPromise = body.initialize();
    await Promise.resolve();

    const sql = calls[calls.length - 1]!;
    expect(sql).toContain('ORDER BY "__rowid__" ASC, "tag" DESC');
    expect(sql.match(/"__rowid__"/g)?.length).toBe(2); // once in SELECT, once in ORDER BY

    queryQueue[queryQueue.length - 1]!.resolve([]);
    body.destroy();
    await initPromise.catch(() => {});
  });
});
