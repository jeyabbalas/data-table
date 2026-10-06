import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

/**
 * Mock WorkerBridge for getColumnValues.
 *
 * The `query` stub is driven by a user-supplied row producer so each test
 * can control what rows come back. The full SQL of every call is captured
 * so tests can assert on SQL construction.
 */
function createMockBridge() {
  const queryCalls: string[] = [];
  let rowProducer: (sql: string) => Promise<unknown[]> = async () => [];

  const bridge = {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (sql: string, _signal?: AbortSignal) => {
      queryCalls.push(sql);
      return rowProducer(sql);
    }),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    clearQueryCache: vi.fn(),
  };
  return {
    bridge,
    queryCalls,
    /** Override the row producer for the next query. */
    setRowProducer: (fn: (sql: string) => Promise<unknown[]>) => {
      rowProducer = fn;
    },
  };
}

const baseSchema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
  { name: 'qty', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'big', type: 'integer', nullable: false, originalType: 'BIGINT' },
];

describe('StateActions.getColumnValues', () => {
  let state: TableState;
  let harness: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    harness = createMockBridge();
    actions = new StateActions(state, harness.bridge as any);
    initializeColumnsFromSchema(state, baseSchema);
    state.tableName.set('t');
    state.totalRows.set(3);
    state.filteredRows.set(3);
  });

  // -------------------------------------------------------------------------
  // Validation / error paths
  // -------------------------------------------------------------------------

  it('throws COLUMN_NOT_FOUND when the column is not in the schema', async () => {
    await expect(actions.getColumnValues('nope')).rejects.toMatchObject({
      name: 'QueryError',
      code: 'COLUMN_NOT_FOUND',
    });
  });

  it('throws INVALID_PAGINATION when limit is negative', async () => {
    await expect(actions.getColumnValues('id', { limit: -1 })).rejects.toMatchObject({
      code: 'INVALID_PAGINATION',
    });
  });

  it('throws INVALID_PAGINATION when limit is not an integer', async () => {
    await expect(actions.getColumnValues('id', { limit: 1.5 })).rejects.toMatchObject({
      code: 'INVALID_PAGINATION',
    });
  });

  it('throws INVALID_PAGINATION when offset is negative', async () => {
    await expect(actions.getColumnValues('id', { offset: -5 })).rejects.toMatchObject({
      code: 'INVALID_PAGINATION',
    });
  });

  it('throws NO_TABLE when the schema names the column but no table is loaded', async () => {
    state.tableName.set(null);
    await expect(actions.getColumnValues('id')).rejects.toMatchObject({
      code: 'NO_TABLE',
    });
  });

  it('throws COLUMN_NOT_FOUND before any data is loaded: the schema is empty', async () => {
    const fresh = new StateActions(createTableState(), harness.bridge as any);
    await expect(fresh.getColumnValues('__rowid__')).rejects.toMatchObject({
      code: 'COLUMN_NOT_FOUND',
    });
    expect(harness.queryCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // SQL construction — scope 'all' (default)
  // -------------------------------------------------------------------------

  it("emits no WHERE for scope 'all' and skips redundant ORDER BY when there is no filter or sort", async () => {
    harness.setRowProducer(async () => [{ val: 1 }, { val: 2 }, { val: 3 }]);
    await actions.getColumnValues('id');
    expect(harness.queryCalls).toHaveLength(1);
    const sql = harness.queryCalls[0];
    // Skip optimization: the loaders inject __rowid__ in scan order, so
    // the natural scan order already matches and the explicit ORDER BY
    // would be a redundant pass for large tables.
    expect(sql).not.toMatch(/ORDER BY/);
    expect(sql).not.toMatch(/\bWHERE\b/);
    expect(sql).toContain('"id"');
    expect(sql).toContain('FROM "t"');
  });

  it("issues ORDER BY __rowid__ for scope 'all' when a sort is active", async () => {
    actions.setSort([{ column: 'qty', desc: false }]);
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id');
    const sql = harness.queryCalls[0];
    expect(sql).toContain('ORDER BY "__rowid__"');
  });

  it("issues ORDER BY __rowid__ for scope 'filtered' even with no filters", async () => {
    // scope='filtered' always emits ORDER BY because the natural-order
    // guarantee only applies to scope='all'.
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { scope: 'filtered' });
    const sql = harness.queryCalls[0];
    expect(sql).toContain('ORDER BY "__rowid__"');
  });

  it('appends LIMIT and OFFSET when provided', async () => {
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { limit: 10, offset: 5 });
    const sql = harness.queryCalls[0];
    expect(sql).toMatch(/LIMIT 10/);
    expect(sql).toMatch(/OFFSET 5/);
  });

  it('picks an ordered page by rowid first, then reads the values of its rows only', async () => {
    actions.addFilter({ column: 'qty', type: 'range', min: 0, max: 100 });
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { scope: 'filtered', limit: 10, offset: 5 });
    expect(harness.queryCalls[0]).toBe(
      'SELECT "id" AS val FROM "t" WHERE "t"."__rowid__" IN (SELECT "t"."__rowid__" FROM "t" ' +
        'WHERE ("qty" >= 0 AND "qty" < 100) ORDER BY "t"."__rowid__" LIMIT 10 OFFSET 5) ' +
        'ORDER BY "t"."__rowid__"',
    );
  });

  // -------------------------------------------------------------------------
  // SQL construction — scope 'filtered'
  // -------------------------------------------------------------------------

  it("includes the filters WHERE clause for scope 'filtered'", async () => {
    actions.addFilter({ column: 'qty', type: 'range', min: 0, max: 100 });
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { scope: 'filtered' });
    const sql = harness.queryCalls[0];
    expect(sql).toMatch(/\bWHERE\b/);
    // The range filter surfaces the column in a BETWEEN-style fragment.
    expect(sql).toContain('"qty"');
  });

  it("emits no WHERE when scope is 'filtered' but no filters are active", async () => {
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { scope: 'filtered' });
    const sql = harness.queryCalls[0];
    expect(sql).not.toMatch(/\bWHERE\b/);
  });

  // -------------------------------------------------------------------------
  // SQL construction — scope 'selected'
  // -------------------------------------------------------------------------

  it('returns an empty typed array without querying when selection is empty', async () => {
    const result = await actions.getColumnValues('price', { scope: 'selected' });
    expect(harness.queryCalls).toHaveLength(0);
    expect(result).toBeInstanceOf(Float64Array);
    expect((result as Float64Array).length).toBe(0);
  });

  it('returns an empty typed array of the right shape for each type', async () => {
    expect(await actions.getColumnValues('id', { scope: 'selected' })).toBeInstanceOf(Int32Array);
    expect(await actions.getColumnValues('big', { scope: 'selected' })).toBeInstanceOf(
      BigInt64Array,
    );
    expect(await actions.getColumnValues('price', { scope: 'selected' })).toBeInstanceOf(
      Float64Array,
    );
    expect(await actions.getColumnValues('name', { scope: 'selected' })).toEqual([]);
  });

  it('delegates to buildSelectedRowsQuery when selection is non-empty', async () => {
    state.selectedRows.set(new Set([0, 2]));
    harness.setRowProducer(async () => [{ id: 10 }, { id: 30 }]);
    const result = await actions.getColumnValues('id', { scope: 'selected' });
    expect(harness.queryCalls).toHaveLength(1);
    const sql = harness.queryCalls[0];
    // The export selected-rows pattern uses ROW_NUMBER() and __row_idx__.
    expect(sql).toContain('ROW_NUMBER()');
    expect(sql).toContain('__row_idx__');
    expect(sql).toContain('IN (0, 2)');
    expect(result).toBeInstanceOf(Int32Array);
    expect(Array.from(result as Int32Array)).toEqual([10, 30]);
  });

  it("throws INVALID_ROWID when scope='selected' and a rowId is negative", async () => {
    state.selectedRows.set(new Set([-1, 2]));
    await expect(actions.getColumnValues('id', { scope: 'selected' })).rejects.toMatchObject({
      name: 'QueryError',
      code: 'INVALID_ROWID',
    });
    expect(harness.queryCalls).toHaveLength(0);
  });

  it("throws INVALID_ROWID when scope='selected' and a rowId is non-integer", async () => {
    state.selectedRows.set(new Set([1.5]));
    await expect(actions.getColumnValues('id', { scope: 'selected' })).rejects.toMatchObject({
      name: 'QueryError',
      code: 'INVALID_ROWID',
    });
    expect(harness.queryCalls).toHaveLength(0);
  });

  it("throws INVALID_ROWID when scope='selected' and a rowId is NaN", async () => {
    state.selectedRows.set(new Set([Number.NaN]));
    await expect(actions.getColumnValues('id', { scope: 'selected' })).rejects.toMatchObject({
      name: 'QueryError',
      code: 'INVALID_ROWID',
    });
    expect(harness.queryCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Typed-array materialization
  // -------------------------------------------------------------------------

  it('returns Int32Array for non-BIGINT integer columns', async () => {
    harness.setRowProducer(async () => [{ val: 1 }, { val: 2 }]);
    const result = await actions.getColumnValues('id');
    expect(result).toBeInstanceOf(Int32Array);
    expect(Array.from(result as Int32Array)).toEqual([1, 2]);
  });

  it('returns BigInt64Array for BIGINT integer columns', async () => {
    harness.setRowProducer(async () => [{ val: 0 }, { val: 1 }, { val: 2 }]);
    const result = await actions.getColumnValues('big');
    expect(result).toBeInstanceOf(BigInt64Array);
    expect(Array.from(result as BigInt64Array)).toEqual([0n, 1n, 2n]);
  });

  it('returns BigInt64Array when the input already carries bigint values', async () => {
    harness.setRowProducer(async () => [{ val: 0n }, { val: 9_999_999_999n }]);
    const result = await actions.getColumnValues('big');
    expect(result).toBeInstanceOf(BigInt64Array);
    expect(Array.from(result as BigInt64Array)).toEqual([0n, 9_999_999_999n]);
  });

  it('preserves BIGINT values above Number.MAX_SAFE_INTEGER without precision loss', async () => {
    const aboveSafe = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
    harness.setRowProducer(async () => [{ val: aboveSafe }]);
    const result = await actions.getColumnValues('big');
    expect(result).toBeInstanceOf(BigInt64Array);
    expect((result as BigInt64Array)[0]).toBe(aboveSafe);
  });

  it('returns Float64Array for float columns', async () => {
    harness.setRowProducer(async () => [{ val: 1.5 }, { val: 2.25 }]);
    const result = await actions.getColumnValues('price');
    expect(result).toBeInstanceOf(Float64Array);
    expect(Array.from(result as Float64Array)).toEqual([1.5, 2.25]);
  });

  it('returns unknown[] for string columns', async () => {
    harness.setRowProducer(async () => [{ val: 'a' }, { val: 'b' }]);
    const result = await actions.getColumnValues('name');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['a', 'b']);
  });

  it('falls back to unknown[] when any row has a NULL value, preserving null in the output', async () => {
    harness.setRowProducer(async () => [{ val: 1 }, { val: null }, { val: 3 }]);
    const result = await actions.getColumnValues('qty');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, null, 3]);
  });

  // -------------------------------------------------------------------------
  // __rowid__ retrievability
  // -------------------------------------------------------------------------

  it('retrieves __rowid__ by name and returns a BigInt64Array', async () => {
    harness.setRowProducer(async () => [{ val: 0 }, { val: 1 }, { val: 2 }]);
    const result = await actions.getColumnValues('__rowid__');
    expect(result).toBeInstanceOf(BigInt64Array);
    expect(Array.from(result as BigInt64Array)).toEqual([0n, 1n, 2n]);
  });

  // -------------------------------------------------------------------------
  // Effective-table routing (derived VIEW)
  // -------------------------------------------------------------------------

  it('targets the current effective table name (including derived VIEW)', async () => {
    state.tableName.set('__dt_view_t');
    harness.setRowProducer(async () => [{ val: 1 }]);
    await actions.getColumnValues('id');
    expect(harness.queryCalls[0]).toContain('FROM "__dt_view_t"');
  });

  // -------------------------------------------------------------------------
  // AbortSignal is forwarded
  // -------------------------------------------------------------------------

  it('forwards the AbortSignal to bridge.query', async () => {
    const controller = new AbortController();
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { signal: controller.signal });
    expect(harness.bridge.query).toHaveBeenCalledWith(expect.any(String), controller.signal);
  });

  // -------------------------------------------------------------------------
  // Empty result preserves typed-array shape
  // -------------------------------------------------------------------------

  it('returns a zero-length Int32Array for an empty integer result', async () => {
    harness.setRowProducer(async () => []);
    const result = await actions.getColumnValues('id');
    expect(result).toBeInstanceOf(Int32Array);
    expect((result as Int32Array).length).toBe(0);
  });

  it('returns a zero-length Float64Array for an empty float result', async () => {
    harness.setRowProducer(async () => []);
    const result = await actions.getColumnValues('price');
    expect(result).toBeInstanceOf(Float64Array);
  });
});

/**
 * Columns whose values Arrow returns wrong are read in a form that crosses
 * intact: nested values as exact JSON text, some scalars as DuckDB's text,
 * wide integers as text parsed as bigints, DECIMALs as the nearest double.
 * The values themselves are read on real DuckDB in
 * nestedValueReads.duckdb.test.ts.
 */
describe('StateActions.getColumnValues: exact reads', () => {
  const exactSchema: ColumnSchema[] = [
    { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
    { name: 'tags', type: 'nested', nullable: true, originalType: 'DECIMAL(10,2)[]' },
    { name: 'attrs', type: 'nested', nullable: true, originalType: 'MAP(VARCHAR, INTEGER)' },
    { name: 'v', type: 'nested', nullable: true, originalType: 'VARIANT' },
    { name: 'wait', type: 'interval', nullable: true, originalType: 'INTERVAL' },
    { name: 'tier', type: 'string', nullable: true, originalType: "ENUM('a', 'b')" },
    { name: 'big', type: 'integer', nullable: true, originalType: 'BIGINT' },
    { name: 'huge', type: 'integer', nullable: true, originalType: 'HUGEINT' },
    { name: 'u32', type: 'integer', nullable: true, originalType: 'UINTEGER' },
    { name: 'amount', type: 'decimal', nullable: true, originalType: 'DECIMAL(18,4)' },
    { name: 'cents', type: 'decimal', nullable: true, originalType: 'DECIMAL(10,2)' },
    { name: 'blob', type: 'string', nullable: true, originalType: 'BLOB' },
  ];

  let state: TableState;
  let harness: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    harness = createMockBridge();
    actions = new StateActions(state, harness.bridge as any);
    initializeColumnsFromSchema(state, exactSchema);
    state.tableName.set('t');
  });

  it('reads a nested column as exact JSON text, past the query cache', async () => {
    harness.setRowProducer(async () => [{ val: '[1.25,2.50,3.75]' }, { val: null }, { val: '[]' }]);
    const values = await actions.getColumnValues('tags');
    expect(values).toEqual([[1.25, 2.5, 3.75], null, []]);
    expect(harness.queryCalls[0]).toBe('SELECT CAST(to_json("tags") AS VARCHAR) AS val FROM "t"');
    expect(harness.bridge.query).toHaveBeenCalledWith(expect.any(String), undefined, {
      cache: false,
    });
  });

  it('materializes a MAP as a Map and reads a VARIANT through CAST(… AS JSON)', async () => {
    harness.setRowProducer(async () => [{ val: '{"size":1,"toJSON":2}' }]);
    const [attrs] = (await actions.getColumnValues('attrs')) as Map<string, number>[];
    expect([...attrs!.entries()]).toEqual([
      ['size', 1],
      ['toJSON', 2],
    ]);

    harness.setRowProducer(async () => [{ val: '9007199254740993' }, { val: '"x"' }]);
    expect(await actions.getColumnValues('v', { scope: 'filtered' })).toEqual([
      9007199254740993n,
      'x',
    ]);
    expect(harness.queryCalls[1]).toBe(
      'SELECT CASE WHEN "v" IS NULL THEN NULL ELSE CAST(CAST("v" AS JSON) AS VARCHAR) END AS val' +
        ' FROM "t" ORDER BY "__rowid__"',
    );
  });

  it('reads the selected rows of a nested column through the selected-rows query', async () => {
    state.selectedRows.set(new Set([4, 1]));
    harness.setRowProducer(async () => [{ val: '[1]' }, { val: '[2]' }]);
    expect(
      await actions.getColumnValues('tags', { scope: 'selected', limit: 1, offset: 1 }),
    ).toEqual([[1], [2]]);
    const sql = harness.queryCalls[0]!;
    expect(sql).toMatch(
      /^SELECT CAST\(to_json\("tags"\) AS VARCHAR\) AS val FROM \(WITH numbered AS /,
    );
    expect(sql).toContain('WHERE __row_idx__ IN (4, 1) ORDER BY __row_idx__ ASC)');
    expect(sql).toMatch(/\) LIMIT 1 OFFSET 1$/);
  });

  it('returns an empty array for a nested column with nothing selected', async () => {
    expect(await actions.getColumnValues('tags', { scope: 'selected' })).toEqual([]);
    expect(harness.queryCalls).toHaveLength(0);
  });

  it('reads INTERVAL and ENUM values as DuckDB text', async () => {
    harness.setRowProducer(async () => [{ val: '1 year 2 months' }, { val: null }]);
    expect(await actions.getColumnValues('wait')).toEqual(['1 year 2 months', null]);
    expect(harness.queryCalls[0]).toBe('SELECT CAST("wait" AS VARCHAR) AS val FROM "t"');

    harness.setRowProducer(async () => [{ val: 'b' }]);
    expect(await actions.getColumnValues('tier')).toEqual(['b']);
    expect(harness.queryCalls[1]).toBe('SELECT CAST("tier" AS VARCHAR) AS val FROM "t"');
  });

  it('keeps a BLOB as it arrives', async () => {
    const bytes = new Uint8Array([0xaa, 0xbb]);
    harness.setRowProducer(async () => [{ val: bytes }]);
    expect(await actions.getColumnValues('blob')).toEqual([bytes]);
    expect(harness.queryCalls[0]).toBe('SELECT "blob" AS val FROM "t"');
  });

  it('reads wide integers as text and keeps every digit', async () => {
    harness.setRowProducer(async () => [
      { val: '9007199254740993' },
      { val: '-9223372036854775808' },
    ]);
    const big = await actions.getColumnValues('big');
    expect(harness.queryCalls[0]).toBe('SELECT CAST("big" AS VARCHAR) AS val FROM "t"');
    expect(big).toBeInstanceOf(BigInt64Array);
    expect(Array.from(big as BigInt64Array)).toEqual([9007199254740993n, -9223372036854775808n]);
  });

  it('falls back to an array, numbers when exact and bigints beyond, past what the typed array holds', async () => {
    // A HUGEINT beyond 64 bits.
    harness.setRowProducer(async () => [
      { val: '170141183460469231731687303715884105727' },
      { val: '12' },
    ]);
    expect(await actions.getColumnValues('huge')).toEqual([
      170141183460469231731687303715884105727n,
      12,
    ]);
    // A NULL among BIGINTs.
    harness.setRowProducer(async () => [{ val: '9007199254740993' }, { val: null }, { val: '5' }]);
    expect(await actions.getColumnValues('big')).toEqual([9007199254740993n, null, 5]);
    // A UINTEGER past 2^31 - 1.
    harness.setRowProducer(async () => [{ val: 4294967295 }, { val: 7 }]);
    expect(await actions.getColumnValues('u32')).toEqual([4294967295, 7]);
    harness.setRowProducer(async () => [{ val: 7 }]);
    expect(await actions.getColumnValues('u32')).toBeInstanceOf(Int32Array);
  });

  it('reads a DECIMAL as the nearest double: through text when it is wide', async () => {
    harness.setRowProducer(async () => [{ val: '1.2345' }, { val: '0.0001' }]);
    const amount = await actions.getColumnValues('amount');
    expect(harness.queryCalls[0]).toBe('SELECT CAST("amount" AS VARCHAR) AS val FROM "t"');
    expect(amount).toBeInstanceOf(Float64Array);
    expect(Array.from(amount as Float64Array)).toEqual([1.2345, 0.0001]);

    harness.setRowProducer(async () => [{ val: '1.2345' }, { val: null }]);
    expect(await actions.getColumnValues('amount')).toEqual([1.2345, null]);

    harness.setRowProducer(async () => [{ val: 1.25 }]);
    await actions.getColumnValues('cents');
    expect(harness.queryCalls[2]).toBe('SELECT CAST("cents" AS DOUBLE) AS val FROM "t"');
  });

  it('reads __rowid__ as it is', async () => {
    harness.setRowProducer(async () => [{ val: 0 }]);
    await actions.getColumnValues('__rowid__');
    expect(harness.queryCalls[0]).toBe('SELECT "__rowid__" AS val FROM "t"');
  });
});
