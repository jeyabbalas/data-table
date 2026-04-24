/**
 * replaceDerivedColumn — Actions-level tests.
 *
 * Covers: type-compatible and type-incompatible chain replacement, cycle
 * induction, unknown column, vector length match/mismatch, atomicity under a
 * VIEW-recreate failure, and the `derivedChange` event payload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { UndoManager } from '@/core/UndoManager';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { DerivedColumnError } from '@/core/errors';

/**
 * Build a mock WorkerBridge for the replace-column flow.
 *
 * Options:
 * - typeMap: maps expression text (as it appears inside `typeof((...))`) to
 *   its DuckDB type. Controls what detectType returns.
 * - preflightBreaks: when the pre-flight query contains every token in this
 *   array, throw a Binder-Error-like failure. Used to simulate dependents
 *   that break under the proposed replacement.
 * - viewFailOnNth: throw on the Nth `CREATE OR REPLACE VIEW` call (1-indexed).
 *   Used to exercise rollback.
 */
function createMockBridge(options: {
  typeMap?: Record<string, string>;
  preflightBreaks?: { needles: string[]; error: string };
  viewFailOnNth?: number;
} = {}) {
  const typeMap = options.typeMap ?? {};
  const queryCalls: string[] = [];
  let viewCreateCount = 0;

  const query = vi.fn().mockImplementation(async (sql: string) => {
    queryCalls.push(sql);
    const trimmed = sql.trim();

    // Type detection: SELECT typeof((<expr>)) AS t FROM ...
    if (sql.includes('typeof(')) {
      const m = sql.match(/typeof\(\((.+)\)\) AS t/);
      const expr = m?.[1] ?? '';
      const duckdbType = typeMap[expr] ?? 'DOUBLE';
      return [{ t: duckdbType }];
    }

    // Pre-flight simulation: throw when all needles are present.
    if (options.preflightBreaks) {
      const { needles, error } = options.preflightBreaks;
      if (needles.every(n => sql.includes(n))) {
        throw new Error(error);
      }
    }

    // Inject VIEW-recreate failure on the Nth call.
    if (/^CREATE OR REPLACE VIEW/i.test(trimmed)) {
      viewCreateCount++;
      if (options.viewFailOnNth && viewCreateCount === options.viewFailOnNth) {
        throw new Error('Simulated DuckDB failure on VIEW recreate');
      }
      return [];
    }

    // LIMIT 0 validation: succeed by default.
    if (sql.includes('LIMIT 0')) {
      return [];
    }

    // DDL: succeed silently.
    if (/^(CREATE|DROP|INSERT)/i.test(trimmed)) {
      return [];
    }

    return [];
  });

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query,
    loadData: vi.fn().mockResolvedValue(undefined),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    clearQueryCache: vi.fn(),
    getQueryCalls: () => queryCalls,
    getViewCreateCount: () => viewCreateCount,
  };
}

describe('replaceDerivedColumn', () => {
  let state: TableState;
  let actions: StateActions;
  let mockBridge: ReturnType<typeof createMockBridge>;

  const baseSchema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'x', type: 'integer', nullable: true, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  ];

  function setup(mock: ReturnType<typeof createMockBridge>): void {
    state = createTableState();
    mockBridge = mock;
    actions = new StateActions(state, mockBridge as any, new UndoManager());
    initializeColumnsFromSchema(state, baseSchema);
    state.tableName.set('test_table');
    state.baseTableName.set('test_table');
    state.totalRows.set(100);
    state.filteredRows.set(100);
  }

  beforeEach(() => {
    setup(createMockBridge());
  });

  // 1. Chain replace, type-compatible
  it('replaces an expression column when dependents remain compatible', async () => {
    setup(createMockBridge({
      typeMap: {
        'x * 2': 'INTEGER',
        'x * 3': 'INTEGER',
        'a + 1': 'INTEGER',
      },
    }));

    const added = await actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'x * 2' });
    expect(added.success).toBe(true);
    const addedB = await actions.addDerivedColumn({ kind: 'expression', name: 'b', expression: 'a + 1' });
    expect(addedB.success).toBe(true);

    const result = await actions.replaceDerivedColumn('a', {
      kind: 'expression',
      name: 'a',
      expression: 'x * 3',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.detectedOriginalType).toBe('INTEGER');
    }

    // State reflects the replacement.
    const a = state.derivedColumns.get().find(d => d.name === 'a');
    expect(a).toMatchObject({ kind: 'expression', name: 'a', expression: 'x * 3' });

    // B is still present and unchanged.
    const b = state.derivedColumns.get().find(d => d.name === 'b');
    expect(b).toMatchObject({ kind: 'expression', name: 'b', expression: 'a + 1' });
  });

  // 2. Chain replace, type-incompatible
  it('rejects replacement that breaks a dependent with DEPENDENTS_INCOMPATIBLE', async () => {
    setup(createMockBridge({
      typeMap: {
        'CAST(x AS INTEGER)': 'INTEGER',
        'UPPER(a)': 'VARCHAR',
        'CAST(x AS DOUBLE)': 'DOUBLE',
      },
      preflightBreaks: {
        // Pre-flight substitutes the new expr for `a`, then validates UPPER(a)
        // against the CTE. The CTE contains both the new expression and UPPER.
        needles: ['CAST(x AS DOUBLE)', 'UPPER(a)'],
        error: 'Binder Error: No function matches the given name UPPER(DOUBLE)',
      },
    }));

    await actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'CAST(x AS INTEGER)' });
    await actions.addDerivedColumn({ kind: 'expression', name: 'b', expression: 'UPPER(a)' });

    const before = state.derivedColumns.get();

    const result = await actions.replaceDerivedColumn('a', {
      kind: 'expression',
      name: 'a',
      expression: 'CAST(x AS DOUBLE)',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
      expect(result.error.code).toBe('DEPENDENTS_INCOMPATIBLE');
      const details = result.error.details as {
        dependentsAffected: string[];
        reasons: Record<string, string>;
      };
      expect(details.dependentsAffected).toEqual(['b']);
      expect(details.reasons.b).toMatch(/UPPER/);
    }

    // State untouched — original expression still in place.
    expect(state.derivedColumns.get()).toEqual(before);
  });

  // 3. Cycle induction
  it('rejects replacement that introduces a circular dependency', async () => {
    setup(createMockBridge({
      typeMap: {
        'x + 1': 'INTEGER',
        'a * 2': 'INTEGER',
        'b / 2': 'INTEGER',
      },
    }));

    await actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'x + 1' });
    await actions.addDerivedColumn({ kind: 'expression', name: 'b', expression: 'a * 2' });

    const viewCallsBefore = mockBridge.getQueryCalls().filter(sql => sql.includes('CREATE OR REPLACE VIEW')).length;

    const result = await actions.replaceDerivedColumn('a', {
      kind: 'expression',
      name: 'a',
      expression: 'b / 2', // would create a→b→a cycle
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
      expect(result.error.code).toBe('CIRCULAR_DEPENDENCY');
    }

    // No new VIEW created after the cycle was detected.
    const viewCallsAfter = mockBridge.getQueryCalls().filter(sql => sql.includes('CREATE OR REPLACE VIEW')).length;
    expect(viewCallsAfter).toBe(viewCallsBefore);
  });

  // 4. Unknown column
  it('rejects when target column does not exist with NOT_FOUND', async () => {
    const result = await actions.replaceDerivedColumn('does_not_exist', {
      kind: 'expression',
      name: 'does_not_exist',
      expression: 'x * 2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  // 5. Vector replace — length match
  it('replaces a vector column when the new array length matches totalRows', async () => {
    state = createTableState();
    mockBridge = createMockBridge();
    actions = new StateActions(state, mockBridge as any, new UndoManager());
    initializeColumnsFromSchema(state, baseSchema);
    state.tableName.set('test_table');
    state.baseTableName.set('test_table');
    state.totalRows.set(5);
    state.filteredRows.set(5);

    const addRes = await actions.addDerivedColumn({
      kind: 'vector',
      name: 'v',
      vectorType: 'integer',
      values: new Uint8Array([0, 1, 0, 1, 0]),
    });
    expect(addRes.success).toBe(true);

    const result = await actions.replaceDerivedColumn('v', {
      kind: 'vector',
      name: 'v',
      vectorType: 'integer',
      values: new Uint8Array([1, 1, 1, 1, 1]),
    });

    expect(result.success).toBe(true);
  });

  // 6. Vector replace — length mismatch
  it('rejects vector replacement with mismatched length with VECTOR_LENGTH_MISMATCH', async () => {
    state = createTableState();
    mockBridge = createMockBridge();
    actions = new StateActions(state, mockBridge as any, new UndoManager());
    initializeColumnsFromSchema(state, baseSchema);
    state.tableName.set('test_table');
    state.baseTableName.set('test_table');
    state.totalRows.set(5);
    state.filteredRows.set(5);

    await actions.addDerivedColumn({
      kind: 'vector',
      name: 'v',
      vectorType: 'integer',
      values: new Uint8Array([0, 0, 0, 0, 0]),
    });

    const result = await actions.replaceDerivedColumn('v', {
      kind: 'vector',
      name: 'v',
      vectorType: 'integer',
      values: new Uint8Array([0, 0, 0]), // wrong length
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
      expect(result.error.code).toBe('VECTOR_LENGTH_MISMATCH');
      const details = result.error.details as { expected: number; actual: number };
      expect(details.expected).toBe(5);
      expect(details.actual).toBe(3);
    }
  });

  // 7. Atomicity — VIEW recreate failure rolls state back
  it('rolls back when VIEW recreate fails during replacement', async () => {
    // Pre-add the column; the replace call will be the 2nd VIEW recreate.
    const addMock = createMockBridge({
      typeMap: { 'x + 1': 'INTEGER', 'x + 2': 'INTEGER' },
    });
    setup(addMock);

    await actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'x + 1' });

    // Swap in a bridge that fails on the next VIEW recreate. Replace the
    // query fn in-place so subsequent calls use the new implementation.
    let viewCount = 0;
    mockBridge.query.mockImplementation(async (sql: string) => {
      const trimmed = sql.trim();
      if (sql.includes('typeof(')) {
        const m = sql.match(/typeof\(\((.+)\)\) AS t/);
        const expr = m?.[1] ?? '';
        return [{ t: expr === 'x + 2' ? 'INTEGER' : 'DOUBLE' }];
      }
      if (/^CREATE OR REPLACE VIEW/i.test(trimmed)) {
        viewCount++;
        if (viewCount === 1) throw new Error('Simulated DuckDB failure on VIEW recreate');
        return [];
      }
      if (sql.includes('LIMIT 0')) return [];
      if (/^(CREATE|DROP|INSERT)/i.test(trimmed)) return [];
      return [];
    });

    const before = state.derivedColumns.get();

    const result = await actions.replaceDerivedColumn('a', {
      kind: 'expression',
      name: 'a',
      expression: 'x + 2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
    }

    // State rolled back to the pre-replace definition.
    expect(state.derivedColumns.get()).toEqual(before);
  });

  // 8. Event payload — derivedChange fires with kind='replaced'
  it('invokes the derivedChange callback with kind="replaced" on success', async () => {
    setup(createMockBridge({
      typeMap: { 'x + 1': 'INTEGER', 'x + 2': 'INTEGER' },
    }));

    const spy = vi.fn();
    actions.setOnDerivedChange(spy);

    await actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'x + 1' });

    // Clear the 'added' call to isolate the replace event.
    spy.mockClear();

    const result = await actions.replaceDerivedColumn('a', {
      kind: 'expression',
      name: 'a',
      expression: 'x + 2',
    });

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0];
    expect(payload.kind).toBe('replaced');
    expect(payload.columnName).toBe('a');
    expect(payload.derivedColumns).toHaveLength(1);
    expect(payload.derivedColumns[0]).toMatchObject({ name: 'a', expression: 'x + 2' });
  });
});
