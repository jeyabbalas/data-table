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

  it('throws NO_TABLE when called before a table is loaded', async () => {
    state.tableName.set(null);
    await expect(actions.getColumnValues('id')).rejects.toMatchObject({
      code: 'NO_TABLE',
    });
  });

  // -------------------------------------------------------------------------
  // SQL construction — scope 'all' (default)
  // -------------------------------------------------------------------------

  it("emits no WHERE for scope 'all' and skips redundant ORDER BY when there is no filter or sort", async () => {
    harness.setRowProducer(async () => [
      { val: 1 }, { val: 2 }, { val: 3 },
    ]);
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

  it("appends LIMIT and OFFSET when provided", async () => {
    harness.setRowProducer(async () => []);
    await actions.getColumnValues('id', { limit: 10, offset: 5 });
    const sql = harness.queryCalls[0];
    expect(sql).toMatch(/LIMIT 10/);
    expect(sql).toMatch(/OFFSET 5/);
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

  it("returns an empty typed array without querying when selection is empty", async () => {
    const result = await actions.getColumnValues('price', { scope: 'selected' });
    expect(harness.queryCalls).toHaveLength(0);
    expect(result).toBeInstanceOf(Float64Array);
    expect((result as Float64Array).length).toBe(0);
  });

  it("returns an empty typed array of the right shape for each type", async () => {
    expect(await actions.getColumnValues('id', { scope: 'selected' })).toBeInstanceOf(Int32Array);
    expect(await actions.getColumnValues('big', { scope: 'selected' })).toBeInstanceOf(BigInt64Array);
    expect(await actions.getColumnValues('price', { scope: 'selected' })).toBeInstanceOf(Float64Array);
    expect(await actions.getColumnValues('name', { scope: 'selected' })).toEqual([]);
  });

  it("delegates to buildSelectedRowsQuery when selection is non-empty", async () => {
    state.selectedRows.set(new Set([0, 2]));
    harness.setRowProducer(async () => [
      { id: 10 }, { id: 30 },
    ]);
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
    await expect(
      actions.getColumnValues('id', { scope: 'selected' }),
    ).rejects.toMatchObject({ name: 'QueryError', code: 'INVALID_ROWID' });
    expect(harness.queryCalls).toHaveLength(0);
  });

  it("throws INVALID_ROWID when scope='selected' and a rowId is non-integer", async () => {
    state.selectedRows.set(new Set([1.5]));
    await expect(
      actions.getColumnValues('id', { scope: 'selected' }),
    ).rejects.toMatchObject({ name: 'QueryError', code: 'INVALID_ROWID' });
    expect(harness.queryCalls).toHaveLength(0);
  });

  it("throws INVALID_ROWID when scope='selected' and a rowId is NaN", async () => {
    state.selectedRows.set(new Set([Number.NaN]));
    await expect(
      actions.getColumnValues('id', { scope: 'selected' }),
    ).rejects.toMatchObject({ name: 'QueryError', code: 'INVALID_ROWID' });
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
