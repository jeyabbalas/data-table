import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { UndoManager } from '@/core/UndoManager';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { DerivedColumnDef } from '@/derived/types';

/**
 * Create a mock WorkerBridge that handles derived column SQL patterns.
 *
 * The mock inspects the SQL string to decide what to return:
 * - typeof() queries → returns a type string (configurable per expression)
 * - LIMIT 0 validation queries → succeeds by default
 * - CREATE/DROP/INSERT DDL → succeeds silently
 * - Everything else → returns []
 */
function createMockBridge(typeMap: Record<string, string> = {}) {
  const defaultType = 'DOUBLE';
  const queryCalls: string[] = [];

  const bridge = {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(async (sql: string) => {
      queryCalls.push(sql);

      // Type detection: SELECT typeof((...)) AS t FROM ...
      if (sql.includes('typeof(')) {
        // Extract the expression inside typeof((...)) — use greedy match anchored to ")) AS t"
        // so expressions with nested parens (e.g., CAST(x AS INTEGER)) are captured correctly
        const match = sql.match(/typeof\(\((.+)\)\) AS t/);
        const expr = match?.[1] ?? '';
        const duckdbType = typeMap[expr] ?? defaultType;
        return [{ t: duckdbType }];
      }

      // Validation: SELECT (...) AS ... FROM ... LIMIT 0
      if (sql.includes('LIMIT 0')) {
        // Check if the expression references a non-existent column
        if (sql.includes('nonexistent_column')) {
          throw new Error('Binder Error: Referenced column "nonexistent_column" not found');
        }
        return [];
      }

      // DDL (CREATE, DROP, INSERT, VIEW) — succeed silently
      if (/^(CREATE|DROP|INSERT)/i.test(sql.trim())) {
        return [];
      }

      return [];
    }),
    loadData: vi.fn().mockResolvedValue(undefined),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    getQueryCalls: () => queryCalls,
  };

  return bridge;
}

describe('Derived Columns — Actions Integration', () => {
  let state: TableState;
  let actions: StateActions;
  let mockBridge: ReturnType<typeof createMockBridge>;

  const sampleSchema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
    { name: 'quantity', type: 'integer', nullable: true, originalType: 'INTEGER' },
  ];

  let undoManager: UndoManager;

  beforeEach(() => {
    state = createTableState();
    mockBridge = createMockBridge({
      'price * quantity': 'DOUBLE',
      'UPPER(name)': 'VARCHAR',
      'quantity + 1': 'BIGINT',
    });
    undoManager = new UndoManager();
    actions = new StateActions(state, mockBridge as any, undoManager);

    // Simulate loaded data state
    initializeColumnsFromSchema(state, sampleSchema);
    state.tableName.set('test_table');
    state.baseTableName.set('test_table');
    state.totalRows.set(100);
    state.filteredRows.set(100);
  });

  // =========================================
  // addDerivedColumn — Expression
  // =========================================

  describe('addDerivedColumn (expression)', () => {
    it('adds an expression column and switches tableName to VIEW', async () => {
      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // tableName switched to VIEW
      expect(state.tableName.get()).toBe('__dt_view_test_table__');

      // derivedColumns updated
      expect(state.derivedColumns.get()).toHaveLength(1);
      expect(state.derivedColumns.get()[0]).toEqual({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      // schema updated with isDerived flag
      const schema = state.schema.get();
      const totalCol = schema.find(c => c.name === 'total');
      expect(totalCol).toBeDefined();
      expect(totalCol!.isDerived).toBe(true);
      expect(totalCol!.type).toBe('float'); // DOUBLE maps to float
      expect(totalCol!.expression).toBe('price * quantity');

      // visibleColumns and columnOrder updated
      expect(state.visibleColumns.get()).toContain('total');
      expect(state.columnOrder.get()).toContain('total');
    });

    it('appends derived column at end of column order', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const order = state.columnOrder.get();
      expect(order[order.length - 1]).toBe('total');

      const visible = state.visibleColumns.get();
      expect(visible[visible.length - 1]).toBe('total');
    });

    it('generates correct SQL for validation, type detection, and VIEW creation', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const calls = mockBridge.getQueryCalls();

      // Should have: validation (LIMIT 0), type detection (typeof), VIEW creation
      expect(calls.some(sql => sql.includes('LIMIT 0') && sql.includes('price * quantity'))).toBe(true);
      expect(calls.some(sql => sql.includes('typeof') && sql.includes('price * quantity'))).toBe(true);
      expect(calls.some(sql => sql.includes('CREATE OR REPLACE VIEW'))).toBe(true);

      // The VIEW SQL should reference the base table and the expression
      const viewSQL = calls.find(sql => sql.includes('CREATE OR REPLACE VIEW'))!;
      expect(viewSQL).toContain('"__dt_view_test_table__"');
      expect(viewSQL).toContain('price * quantity');
      expect(viewSQL).toContain('"total"');
      expect(viewSQL).toContain('"test_table"');
    });

    it('can add multiple expression columns', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'upper_name',
        expression: 'UPPER(name)',
      });

      expect(state.derivedColumns.get()).toHaveLength(2);
      expect(state.schema.get().filter(c => c.isDerived)).toHaveLength(2);

      // Both should be in visible/order
      expect(state.visibleColumns.get()).toContain('total');
      expect(state.visibleColumns.get()).toContain('upper_name');
    });
  });

  // =========================================
  // addDerivedColumn (expression) — type detection for all types
  // =========================================

  describe('addDerivedColumn (expression) — all result types', () => {
    // Uses a bridge with typeMap entries for expressions that produce each DuckDB type
    let allTypesActions: StateActions;
    let allTypesBridge: ReturnType<typeof createMockBridge>;
    let allTypesState: TableState;

    beforeEach(() => {
      allTypesState = createTableState();
      allTypesBridge = createMockBridge({
        'price * quantity': 'DOUBLE',
        'CAST(price AS INTEGER)': 'INTEGER',
        "CAST(price AS DECIMAL(10,2))": 'DECIMAL(10,2)',
        'CURRENT_DATE': 'DATE',
        'CURRENT_TIMESTAMP': 'TIMESTAMP',
        'CURRENT_TIME': 'TIME',
        "INTERVAL '1 day'": 'INTERVAL',
        'uuid()': 'UUID',
        'UPPER(name)': 'VARCHAR',
        'quantity > 50': 'BOOLEAN',
      });
      allTypesActions = new StateActions(allTypesState, allTypesBridge as any);
      initializeColumnsFromSchema(allTypesState, sampleSchema);
      allTypesState.tableName.set('test_table');
      allTypesState.baseTableName.set('test_table');
      allTypesState.totalRows.set(100);
      allTypesState.filteredRows.set(100);
    });

    it('detects integer type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'int_col', expression: 'CAST(price AS INTEGER)',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'int_col')!.type).toBe('integer');
    });

    it('detects float type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'float_col', expression: 'price * quantity',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'float_col')!.type).toBe('float');
    });

    it('detects decimal type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'dec_col', expression: 'CAST(price AS DECIMAL(10,2))',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'dec_col')!.type).toBe('decimal');
    });

    it('detects date type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'date_col', expression: 'CURRENT_DATE',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'date_col')!.type).toBe('date');
    });

    it('detects timestamp type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'ts_col', expression: 'CURRENT_TIMESTAMP',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'ts_col')!.type).toBe('timestamp');
    });

    it('detects time type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'time_col', expression: 'CURRENT_TIME',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'time_col')!.type).toBe('time');
    });

    it('detects interval type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'interval_col', expression: "INTERVAL '1 day'",
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'interval_col')!.type).toBe('interval');
    });

    it('detects uuid type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'uuid_col', expression: 'uuid()',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'uuid_col')!.type).toBe('uuid');
    });

    it('detects string type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'str_col', expression: 'UPPER(name)',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'str_col')!.type).toBe('string');
    });

    it('detects boolean type from expression', async () => {
      const result = await allTypesActions.addDerivedColumn({
        kind: 'expression', name: 'bool_col', expression: 'quantity > 50',
      });
      expect(result.success).toBe(true);
      expect(allTypesState.schema.get().find(c => c.name === 'bool_col')!.type).toBe('boolean');
    });
  });

  // =========================================
  // addDerivedColumn — Name Conflicts
  // =========================================

  describe('addDerivedColumn — name validation', () => {
    it('rejects duplicate name (conflicts with source column)', async () => {
      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: 'price', // already exists
        expression: 'quantity * 2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');

      // State unchanged
      expect(state.derivedColumns.get()).toHaveLength(0);
      expect(state.tableName.get()).toBe('test_table');
    });

    it('rejects duplicate name (conflicts with existing derived column)', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total', // already exists as derived
        expression: 'quantity + 1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
      expect(state.derivedColumns.get()).toHaveLength(1);
    });

    it('rejects empty name', async () => {
      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: '',
        expression: 'price * 2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('rejects whitespace-only name', async () => {
      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: '   ',
        expression: 'price * 2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  // =========================================
  // addDerivedColumn — Invalid Expression
  // =========================================

  describe('addDerivedColumn — invalid expression', () => {
    it('returns error for invalid SQL expression', async () => {
      const result = await actions.addDerivedColumn({
        kind: 'expression',
        name: 'bad_col',
        expression: 'nonexistent_column * 2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // State unchanged
      expect(state.derivedColumns.get()).toHaveLength(0);
      expect(state.tableName.get()).toBe('test_table');
    });
  });

  // =========================================
  // addDerivedColumn — Vector
  // =========================================

  describe('addDerivedColumn (vector)', () => {
    it('adds a numeric vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => i * 0.5);
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'scores',
        vectorType: 'float',
        values,
      });

      expect(result.success).toBe(true);

      // Schema updated
      const scoreCol = state.schema.get().find(c => c.name === 'scores');
      expect(scoreCol).toBeDefined();
      expect(scoreCol!.isDerived).toBe(true);
      expect(scoreCol!.type).toBe('float');
      expect(scoreCol!.expression).toBeUndefined(); // vector, not expression

      // tableName switched to VIEW
      expect(state.tableName.get()).toBe('__dt_view_test_table__');

      // Helper table created + VIEW created
      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('__dt_vec_scores_0__'))).toBe(true);
      expect(calls.some(sql => sql.includes('INSERT INTO') && sql.includes('__dt_vec_scores_0__'))).toBe(true);
      expect(calls.some(sql => sql.includes('CREATE OR REPLACE VIEW'))).toBe(true);

      // VIEW should have a LEFT JOIN for the vector column
      const viewSQL = calls.find(sql => sql.includes('CREATE OR REPLACE VIEW'))!;
      expect(viewSQL).toContain('LEFT JOIN');
      expect(viewSQL).toContain('__dt_vec_scores_0__');
      expect(viewSQL).toContain('rowid');
    });

    it('adds a string vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `label_${i}`);
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'labels',
        vectorType: 'string',
        values,
      });

      expect(result.success).toBe(true);
      const labelCol = state.schema.get().find(c => c.name === 'labels');
      expect(labelCol!.type).toBe('string');
    });

    it('adds a boolean vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => i % 2 === 0);
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'flags',
        vectorType: 'boolean',
        values,
      });

      expect(result.success).toBe(true);
      const flagCol = state.schema.get().find(c => c.name === 'flags');
      expect(flagCol!.type).toBe('boolean');
    });

    it('adds a date vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => {
        const d = new Date(2024, 0, 1 + (i % 28));
        return d.toISOString().split('T')[0];
      });
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'event_date',
        vectorType: 'date',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'event_date');
      expect(col).toBeDefined();
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('date');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('DATE'))).toBe(true);
      expect(calls.some(sql => sql.includes('INSERT INTO') && sql.includes('__dt_vec_event_date_0__'))).toBe(true);
      expect(calls.some(sql => sql.includes('CREATE OR REPLACE VIEW'))).toBe(true);
    });

    it('adds a timestamp vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => {
        const d = new Date(2024, 0, 1 + (i % 28), 10, 30, i % 60);
        return d.toISOString().replace('Z', '').replace('T', ' ');
      });
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'event_ts',
        vectorType: 'timestamp',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'event_ts');
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('timestamp');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('TIMESTAMP'))).toBe(true);
    });

    it('adds a time vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => {
        const h = String(i % 24).padStart(2, '0');
        const m = String(i % 60).padStart(2, '0');
        return `${h}:${m}:00`;
      });
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'event_time',
        vectorType: 'time',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'event_time');
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('time');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('TIME'))).toBe(true);
    });

    it('adds an interval vector column', async () => {
      const values = ['1 day', '2 hours 30 minutes', '3 months', '1 year 6 months'];
      // Pad to 100 values
      while (values.length < 100) values.push('1 day');
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'durations',
        vectorType: 'interval',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'durations');
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('interval');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('INTERVAL'))).toBe(true);
      // Verify string values are quoted in INSERT
      expect(calls.some(sql => sql.includes('INSERT INTO') && sql.includes("'1 day'"))).toBe(true);
    });

    it('adds a decimal vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => (i * 0.123456).toFixed(6));
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'precise_vals',
        vectorType: 'decimal',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'precise_vals');
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('decimal');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('DECIMAL(18,6)'))).toBe(true);
    });

    it('adds a uuid vector column', async () => {
      const values = Array.from({ length: 100 }, (_, i) => {
        const hex = i.toString(16).padStart(12, '0');
        return `550e8400-e29b-41d4-a716-${hex}`;
      });
      const result = await actions.addDerivedColumn({
        kind: 'vector',
        name: 'record_ids',
        vectorType: 'uuid',
        values,
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'record_ids');
      expect(col!.isDerived).toBe(true);
      expect(col!.type).toBe('uuid');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('CREATE TABLE') && sql.includes('UUID'))).toBe(true);
      // Verify UUID values are quoted in INSERT
      expect(calls.some(sql => sql.includes('INSERT INTO') && sql.includes("'550e8400-e29b-41d4-a716-"))).toBe(true);
    });
  });

  // =========================================
  // removeDerivedColumn
  // =========================================

  describe('removeDerivedColumn', () => {
    it('removes a derived column and updates all state', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      expect(state.derivedColumns.get()).toHaveLength(1);

      await actions.removeDerivedColumn('total');

      // derivedColumns cleared
      expect(state.derivedColumns.get()).toHaveLength(0);

      // Schema no longer has 'total'
      expect(state.schema.get().find(c => c.name === 'total')).toBeUndefined();

      // Column arrays no longer have 'total'
      expect(state.visibleColumns.get()).not.toContain('total');
      expect(state.columnOrder.get()).not.toContain('total');

      // tableName reverted to base (last derived column removed)
      expect(state.tableName.get()).toBe('test_table');
    });

    it('removes filters for the deleted column', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      // Add a filter on the derived column
      actions.addFilter({ column: 'total', type: 'range', min: 0, max: 100 });
      expect(state.filters.get()).toHaveLength(1);

      await actions.removeDerivedColumn('total');
      expect(state.filters.get()).toHaveLength(0);
    });

    it('removes sort for the deleted column', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      actions.toggleSort('total');
      expect(state.sortColumns.get()).toHaveLength(1);

      await actions.removeDerivedColumn('total');
      expect(state.sortColumns.get()).toHaveLength(0);
    });

    it('removes pin for the deleted column', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      actions.toggleColumnPin('total');
      expect(state.pinnedColumns.get()).toContain('total');

      await actions.removeDerivedColumn('total');
      expect(state.pinnedColumns.get()).not.toContain('total');
    });

    it('calls onFilterRemoveCallback when filters are removed', async () => {
      const callback = vi.fn();
      actions.setOnFilterRemove(callback);

      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      actions.addFilter({ column: 'total', type: 'range', min: 0, max: 100 });

      await actions.removeDerivedColumn('total');
      expect(callback).toHaveBeenCalledWith('total');
    });

    it('throws for non-derived column', async () => {
      await expect(actions.removeDerivedColumn('price')).rejects.toThrow('not a derived column');
    });

    it('removes second of two derived columns, keeps VIEW with first', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'upper_name',
        expression: 'UPPER(name)',
      });
      expect(state.derivedColumns.get()).toHaveLength(2);

      await actions.removeDerivedColumn('upper_name');

      // Still one derived column left
      expect(state.derivedColumns.get()).toHaveLength(1);
      expect(state.derivedColumns.get()[0].name).toBe('total');

      // tableName still points to VIEW (not reverted)
      expect(state.tableName.get()).toBe('__dt_view_test_table__');

      // 'total' still in schema, 'upper_name' gone
      expect(state.schema.get().find(c => c.name === 'total')).toBeDefined();
      expect(state.schema.get().find(c => c.name === 'upper_name')).toBeUndefined();
    });

    it('drops vector helper table on remove', async () => {
      const values = Array.from({ length: 100 }, (_, i) => i);
      await actions.addDerivedColumn({
        kind: 'vector',
        name: 'scores',
        vectorType: 'integer',
        values,
      });

      // Clear call history to track only remove-related queries
      mockBridge.getQueryCalls().length = 0;

      await actions.removeDerivedColumn('scores');

      const calls = mockBridge.getQueryCalls();
      expect(calls.some(sql => sql.includes('DROP TABLE IF EXISTS') && sql.includes('__dt_vec_scores_0__'))).toBe(true);
    });
  });

  // =========================================
  // updateDerivedColumn
  // =========================================

  describe('updateDerivedColumn', () => {
    it('updates expression without rename', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const result = await actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'total',
        expression: 'quantity + 1',
      });

      expect(result.success).toBe(true);
      const col = state.schema.get().find(c => c.name === 'total');
      expect(col!.expression).toBe('quantity + 1');
      expect(col!.type).toBe('integer'); // BIGINT maps to integer
    });

    it('renames derived column and updates all state references', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      // Add filter and sort on the derived column
      actions.addFilter({ column: 'total', type: 'range', min: 0, max: 100 });
      actions.toggleSort('total');

      const result = await actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'revenue',
        expression: 'price * quantity',
      });

      expect(result.success).toBe(true);

      // Old name gone from everywhere
      expect(state.schema.get().find(c => c.name === 'total')).toBeUndefined();
      expect(state.visibleColumns.get()).not.toContain('total');
      expect(state.columnOrder.get()).not.toContain('total');

      // New name present everywhere
      expect(state.schema.get().find(c => c.name === 'revenue')).toBeDefined();
      expect(state.visibleColumns.get()).toContain('revenue');
      expect(state.columnOrder.get()).toContain('revenue');

      // Filters and sorts renamed (type didn't change)
      expect(state.filters.get()[0].column).toBe('revenue');
      expect(state.sortColumns.get()[0].column).toBe('revenue');

      // derivedColumns updated
      expect(state.derivedColumns.get()[0].name).toBe('revenue');
    });

    it('removes stale filters when type changes', async () => {
      mockBridge.query.mockImplementation(async (sql: string) => {
        if (sql.includes('typeof(')) {
          // First call returns DOUBLE, we'll override for the update
          if (sql.includes('UPPER(name)')) return [{ t: 'VARCHAR' }];
          return [{ t: 'DOUBLE' }];
        }
        if (sql.includes('LIMIT 0') && sql.includes('nonexistent_column')) {
          throw new Error('Binder Error');
        }
        return [];
      });

      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'computed',
        expression: 'price * quantity',
      });

      // Add filter on computed column (type is float from DOUBLE)
      actions.addFilter({ column: 'computed', type: 'range', min: 0, max: 100 });
      expect(state.filters.get()).toHaveLength(1);

      // Update to a string expression — type changes from float to string
      await actions.updateDerivedColumn('computed', {
        kind: 'expression',
        name: 'computed',
        expression: 'UPPER(name)',
      });

      // Filter should be removed (type changed)
      expect(state.filters.get()).toHaveLength(0);
    });

    it('rejects rename to existing column name', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const result = await actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'price', // conflicts with source column
        expression: 'price * quantity',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('rejects update of non-derived column', async () => {
      const result = await actions.updateDerivedColumn('price', {
        kind: 'expression',
        name: 'price_new',
        expression: 'price * 2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a derived column');
    });
  });

  // =========================================
  // validateExpression
  // =========================================

  describe('validateExpression', () => {
    it('returns valid result with detected type for good expression', async () => {
      const result = await actions.validateExpression('price * quantity');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('float');
      expect(result.originalType).toBe('DOUBLE');
      expect(result.error).toBeUndefined();
    });

    it('returns error for invalid expression', async () => {
      const result = await actions.validateExpression('nonexistent_column * 2');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.type).toBeUndefined();
    });
  });

  // =========================================
  // getCompletionContext
  // =========================================

  describe('getCompletionContext', () => {
    it('lists base columns before any derived columns', () => {
      const ctx = actions.getCompletionContext();

      expect(ctx.columns).toHaveLength(4);
      expect(ctx.columns.every(c => !c.isDerived)).toBe(true);
      expect(ctx.columns.map(c => c.name)).toEqual(['id', 'name', 'price', 'quantity']);
    });

    it('includes derived columns after adding them', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const ctx = actions.getCompletionContext();
      expect(ctx.columns).toHaveLength(5);

      const derivedEntry = ctx.columns.find(c => c.name === 'total');
      expect(derivedEntry).toBeDefined();
      expect(derivedEntry!.isDerived).toBe(true);
    });
  });

  // =========================================
  // resetToInitial with derived columns
  // =========================================

  describe('resetToInitial with derived columns', () => {
    // To test resetToInitial, we must go through loadData() which sets
    // initialSnapshot (a private field). We use a mock bridge that handles
    // both DataLoader and DerivedColumnManager SQL patterns.
    function createLoadableBridge() {
      return createMockBridge({
        'price * quantity': 'DOUBLE',
        'UPPER(name)': 'VARCHAR',
      });
    }

    function createMockStore(
      snapshot: import('../../src/persistence/types').SessionSnapshot | null = null,
    ) {
      return {
        open: vi.fn().mockResolvedValue(true),
        save: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(snapshot),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        close: vi.fn(),
        saveSync: vi.fn(),
      };
    }

    it('strips derived column names from visibleColumns and columnOrder', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);

      // Load data with a session that has a derived column
      const sessionSnapshot = {
        version: 2, timestamp: Date.now(), tableName: 'test_table',
        filters: [], sortColumns: [],
        visibleColumns: ['id', 'name', 'price', 'quantity', 'total'],
        columnOrder: ['id', 'name', 'price', 'quantity', 'total'],
        columnWidths: {}, pinnedColumns: [], hiddenColumnInfo: {},
        derivedColumns: [{ kind: 'expression' as const, name: 'total', expression: 'price * quantity' }],
      };
      const store = createMockStore(sessionSnapshot as any);
      await act.loadData(new File([''], 'test.csv'), { tableName: 'test_table', sessionStore: store as any });

      // Verify initial state includes derived column
      expect(state.visibleColumns.get()).toContain('total');
      expect(state.columnOrder.get()).toContain('total');
      expect(state.derivedColumns.get()).toHaveLength(1);

      // Make a change so reset has something to undo
      act.addFilter({ column: 'price', type: 'range', min: 0, max: 50 });

      // Reset
      const result = await act.resetToInitial();
      expect(result).toBe(true);

      // Derived columns should be fully cleaned up
      expect(state.derivedColumns.get()).toHaveLength(0);
      expect(state.tableName.get()).toBe('test_table');
      expect(state.visibleColumns.get()).not.toContain('total');
      expect(state.columnOrder.get()).not.toContain('total');
      expect(state.schema.get().every(c => !c.isDerived)).toBe(true);
    });

    it('strips derived column names from pinnedColumns', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);

      // Load with a session that has a pinned derived column.
      // restoreStateFromSnapshot now preserves derived column pins.
      const sessionSnapshot = {
        version: 2, timestamp: Date.now(), tableName: 'test_table',
        filters: [], sortColumns: [],
        visibleColumns: ['id', 'name', 'price', 'quantity', 'total'],
        columnOrder: ['id', 'name', 'price', 'quantity', 'total'],
        columnWidths: {}, pinnedColumns: ['total'], hiddenColumnInfo: {},
        derivedColumns: [{ kind: 'expression' as const, name: 'total', expression: 'price * quantity' }],
      };
      const store = createMockStore(sessionSnapshot as any);
      await act.loadData(new File([''], 'test.csv'), { tableName: 'test_table', sessionStore: store as any });

      // Pin is now preserved from session restore
      expect(state.pinnedColumns.get()).toContain('total');

      await act.resetToInitial();

      // Derived column pin should be stripped on reset
      expect(state.pinnedColumns.get()).not.toContain('total');
      expect(state.derivedColumns.get()).toHaveLength(0);
    });

    it('resets filteredRows to totalRows when initial state has no filters', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);
      await act.loadData(new File([''], 'test.csv'), { tableName: 'test_table' });

      // Simulate stale filteredRows (e.g., from a filter that was applied)
      act.addFilter({ column: 'price', type: 'range', min: 0, max: 50 });
      state.filteredRows.set(42);

      await act.resetToInitial();

      expect(state.filteredRows.get()).toBe(100);
    });

    it('succeeds even when derivedManager.destroy() throws', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);

      const sessionSnapshot = {
        version: 2, timestamp: Date.now(), tableName: 'test_table',
        filters: [], sortColumns: [],
        visibleColumns: ['id', 'name', 'price', 'quantity', 'total'],
        columnOrder: ['id', 'name', 'price', 'quantity', 'total'],
        columnWidths: {}, pinnedColumns: [], hiddenColumnInfo: {},
        derivedColumns: [{ kind: 'expression' as const, name: 'total', expression: 'price * quantity' }],
      };
      const store = createMockStore(sessionSnapshot as any);
      await act.loadData(new File([''], 'test.csv'), { tableName: 'test_table', sessionStore: store as any });

      // Make destroy throw by making DROP VIEW fail
      let dropCount = 0;
      bridge.query.mockImplementation(async (sql: string) => {
        if (/^DROP/i.test(sql.trim())) {
          dropCount++;
          // Let the first drop calls from loadData succeed, but fail on reset
          if (dropCount > 5) throw new Error('Simulated DuckDB error');
        }
        if (sql.includes('typeof(')) return [{ t: 'DOUBLE' }];
        if (sql.includes('LIMIT 0')) return [];
        return [];
      });

      act.addFilter({ column: 'price', type: 'range', min: 0, max: 50 });

      // Should not throw
      const result = await act.resetToInitial();
      expect(result).toBe(true);
      expect(state.derivedColumns.get()).toHaveLength(0);
      expect(state.tableName.get()).toBe('test_table');
    });
    it('preserves derived column filters, sorts, pins, widths, and order position through session restore', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);

      const sessionSnapshot = {
        version: 2,
        timestamp: Date.now(),
        tableName: 'test_table',
        filters: [{ type: 'range', column: 'total', min: 0, max: 500 }],
        sortColumns: [{ column: 'total', direction: 'desc' as const }],
        visibleColumns: ['id', 'total', 'name', 'price', 'quantity'],
        columnOrder: ['id', 'total', 'name', 'price', 'quantity'],
        columnWidths: { total: 180 },
        pinnedColumns: ['total'],
        hiddenColumnInfo: {},
        derivedColumns: [
          {
            kind: 'expression' as const,
            name: 'total',
            expression: 'price * quantity',
          },
        ],
      };
      const store = createMockStore(sessionSnapshot as any);
      await act.loadData(new File([''], 'test.csv'), {
        tableName: 'test_table',
        sessionStore: store as any,
      });

      // All derived column state should be preserved
      expect(state.filters.get()).toHaveLength(1);
      expect(state.filters.get()[0].column).toBe('total');
      expect(state.sortColumns.get()).toEqual([
        { column: 'total', direction: 'desc' },
      ]);
      expect(state.pinnedColumns.get()).toContain('total');
      expect(state.columnWidths.get().get('total')).toBe(180);

      // Column order position preserved (total at index 1, not appended to end)
      expect(state.columnOrder.get().indexOf('total')).toBe(1);

      // Visible columns order preserved
      expect(state.visibleColumns.get().indexOf('total')).toBe(1);
    });

    it('preserves hidden state for derived columns through session restore', async () => {
      const bridge = createLoadableBridge();
      bridge.loadData.mockResolvedValue({
        tableName: 'test_table',
        rowCount: 100,
        schema: sampleSchema,
      });
      const um = new UndoManager();
      const act = new StateActions(state, bridge as any, um);

      const sessionSnapshot = {
        version: 2,
        timestamp: Date.now(),
        tableName: 'test_table',
        filters: [],
        sortColumns: [],
        visibleColumns: ['id', 'name', 'price', 'quantity'],
        columnOrder: ['id', 'total', 'name', 'price', 'quantity'],
        columnWidths: {},
        pinnedColumns: [],
        hiddenColumnInfo: {
          total: {
            column: 'total',
            leftNeighbor: 'id',
            rightNeighbor: 'name',
          },
        },
        derivedColumns: [
          {
            kind: 'expression' as const,
            name: 'total',
            expression: 'price * quantity',
          },
        ],
      };
      const store = createMockStore(sessionSnapshot as any);
      await act.loadData(new File([''], 'test.csv'), {
        tableName: 'test_table',
        sessionStore: store as any,
      });

      // Derived column should be hidden (NOT in visibleColumns)
      expect(state.visibleColumns.get()).not.toContain('total');

      // But present in columnOrder at correct position
      expect(state.columnOrder.get().indexOf('total')).toBe(1);

      // hiddenColumnInfo preserved
      const info = state.hiddenColumnInfo.get().get('total');
      expect(info).toBeDefined();
      expect(info!.leftNeighbor).toBe('id');
      expect(info!.rightNeighbor).toBe('name');
    });
  });

  // =========================================
  // Mixed expression + vector columns
  // =========================================

  describe('mixed expression and vector columns', () => {
    it('VIEW contains both expression inline and vector JOIN', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      const values = Array.from({ length: 100 }, (_, i) => i * 0.1);
      await actions.addDerivedColumn({
        kind: 'vector',
        name: 'scores',
        vectorType: 'float',
        values,
      });

      expect(state.derivedColumns.get()).toHaveLength(2);
      expect(state.schema.get().filter(c => c.isDerived)).toHaveLength(2);

      // Last VIEW creation should have both expression and JOIN
      const calls = mockBridge.getQueryCalls();
      const viewCalls = calls.filter(sql => sql.includes('CREATE OR REPLACE VIEW'));
      const lastView = viewCalls[viewCalls.length - 1];

      expect(lastView).toContain('price * quantity');
      expect(lastView).toContain('"total"');
      expect(lastView).toContain('LEFT JOIN');
      expect(lastView).toContain('__dt_vec_scores_0__');
    });
  });

  // =========================================
  // Derived column operations create undo points
  // =========================================

  describe('undo — derived column operations are undoable', () => {
    it('addDerivedColumn pushes to undo stack', async () => {
      expect(undoManager.canUndo).toBe(false);

      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      expect(undoManager.canUndo).toBe(true);
      expect(undoManager.undoDepth).toBe(1);
    });

    it('updateDerivedColumn pushes to undo stack', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      expect(undoManager.undoDepth).toBe(1);

      await actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'grand_total',
        expression: 'price * quantity * 1.1',
      });

      expect(undoManager.undoDepth).toBe(2);
    });

    it('removeDerivedColumn pushes to undo stack', async () => {
      await actions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      await actions.removeDerivedColumn('total');

      expect(undoManager.undoDepth).toBe(2); // add + remove
    });
  });

  // =========================================
  // Derived columns from derived columns
  // =========================================

  describe('derived from derived — expression referencing expression', () => {
    let dfdActions: StateActions;
    let dfdBridge: ReturnType<typeof createMockBridge>;
    let dfdState: TableState;

    beforeEach(() => {
      dfdState = createTableState();
      dfdBridge = createMockBridge({
        'price * quantity': 'DOUBLE',
        'total * 0.1': 'DOUBLE',
        'total + tax': 'DOUBLE',
        'UPPER(name)': 'VARCHAR',
        'quantity + 1': 'BIGINT',
      });
      dfdActions = new StateActions(dfdState, dfdBridge as any, new UndoManager());
      initializeColumnsFromSchema(dfdState, sampleSchema);
      dfdState.tableName.set('test_table');
      dfdState.baseTableName.set('test_table');
      dfdState.totalRows.set(100);
      dfdState.filteredRows.set(100);
    });

    it('creates an expression column referencing another expression column', async () => {
      const r1 = await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      expect(r1.success).toBe(true);

      const r2 = await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });
      expect(r2.success).toBe(true);

      expect(dfdState.derivedColumns.get()).toHaveLength(2);
      expect(dfdState.schema.get().filter(c => c.isDerived)).toHaveLength(2);

      const taxCol = dfdState.schema.get().find(c => c.name === 'tax');
      expect(taxCol).toBeDefined();
      expect(taxCol!.isDerived).toBe(true);
      expect(taxCol!.expression).toBe('total * 0.1');
    });

    it('creates a chain of 3 expression columns (A → B → C)', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });
      const r3 = await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'grand_total',
        expression: 'total + tax',
      });

      expect(r3.success).toBe(true);
      expect(dfdState.derivedColumns.get()).toHaveLength(3);
    });

    it('generates CTE-based VIEW SQL with layered expressions', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });

      const calls = dfdBridge.getQueryCalls();
      const viewCalls = calls.filter(sql => sql.includes('CREATE OR REPLACE VIEW'));
      const lastView = viewCalls[viewCalls.length - 1];

      // Should use CTE structure
      expect(lastView).toContain('WITH __dt_base AS');
      expect(lastView).toContain('__dt_layer_1');
      expect(lastView).toContain('__dt_layer_2');

      // Both expressions should be present
      expect(lastView).toContain('price * quantity');
      expect(lastView).toContain('total * 0.1');

      // total must be in layer 1, tax in layer 2 (dependency order)
      const layer1Idx = lastView.indexOf('__dt_layer_1');
      const layer2Idx = lastView.indexOf('__dt_layer_2');
      const totalExprIdx = lastView.indexOf('price * quantity');
      const taxExprIdx = lastView.indexOf('total * 0.1');
      expect(totalExprIdx).toBeGreaterThan(layer1Idx);
      expect(totalExprIdx).toBeLessThan(layer2Idx);
      expect(taxExprIdx).toBeGreaterThan(layer2Idx);
    });

    it('validates expressions against the VIEW (not base table) when derived columns exist', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });

      // Clear calls to see only the second column's queries
      dfdBridge.getQueryCalls().length = 0;

      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });

      const calls = dfdBridge.getQueryCalls();

      // Validation and typeof should query the VIEW, not the base table
      const validationSQL = calls.find(sql => sql.includes('LIMIT 0'));
      expect(validationSQL).toContain('__dt_view_test_table__');

      const typeofSQL = calls.find(sql => sql.includes('typeof'));
      expect(typeofSQL).toContain('__dt_view_test_table__');
    });
  });

  describe('derived from derived — cycle detection', () => {
    let dfdActions: StateActions;
    let dfdBridge: ReturnType<typeof createMockBridge>;
    let dfdState: TableState;

    beforeEach(() => {
      dfdState = createTableState();
      dfdBridge = createMockBridge({
        'price * quantity': 'DOUBLE',
        'total * 0.1': 'DOUBLE',
        'col_b + 1': 'DOUBLE',
        'col_a + 1': 'DOUBLE',
      });
      dfdActions = new StateActions(dfdState, dfdBridge as any, new UndoManager());
      initializeColumnsFromSchema(dfdState, sampleSchema);
      dfdState.tableName.set('test_table');
      dfdState.baseTableName.set('test_table');
      dfdState.totalRows.set(100);
      dfdState.filteredRows.set(100);
    });

    it('rejects circular dependency (A references B, B references A)', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'col_a',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'col_b',
        expression: 'col_a + 1',
      });

      // Now try to update col_a to reference col_b — creates a cycle
      const result = await dfdActions.updateDerivedColumn('col_a', {
        kind: 'expression',
        name: 'col_a',
        expression: 'col_b + 1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular dependency');

      // State should be unchanged
      const colA = dfdState.schema.get().find(c => c.name === 'col_a');
      expect(colA!.expression).toBe('price * quantity');
    });
  });

  describe('derived from derived — deletion protection', () => {
    let dfdActions: StateActions;
    let dfdBridge: ReturnType<typeof createMockBridge>;
    let dfdState: TableState;

    beforeEach(() => {
      dfdState = createTableState();
      dfdBridge = createMockBridge({
        'price * quantity': 'DOUBLE',
        'total * 0.1': 'DOUBLE',
      });
      dfdActions = new StateActions(dfdState, dfdBridge as any, new UndoManager());
      initializeColumnsFromSchema(dfdState, sampleSchema);
      dfdState.tableName.set('test_table');
      dfdState.baseTableName.set('test_table');
      dfdState.totalRows.set(100);
      dfdState.filteredRows.set(100);
    });

    it('blocks deletion of column that is referenced by another derived column', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });

      await expect(dfdActions.removeDerivedColumn('total')).rejects.toThrow(
        /Cannot delete "total".*referenced by.*"tax"/
      );

      // State unchanged — both columns still exist
      expect(dfdState.derivedColumns.get()).toHaveLength(2);
    });

    it('allows deletion after removing dependent column first', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });

      // Delete the dependent first
      await dfdActions.removeDerivedColumn('tax');
      expect(dfdState.derivedColumns.get()).toHaveLength(1);

      // Now the dependency is gone, deletion should succeed
      await dfdActions.removeDerivedColumn('total');
      expect(dfdState.derivedColumns.get()).toHaveLength(0);
      expect(dfdState.tableName.get()).toBe('test_table');
    });
  });

  describe('derived from derived — rename blocking', () => {
    let dfdActions: StateActions;
    let dfdBridge: ReturnType<typeof createMockBridge>;
    let dfdState: TableState;

    beforeEach(() => {
      dfdState = createTableState();
      dfdBridge = createMockBridge({
        'price * quantity': 'DOUBLE',
        'total * 0.1': 'DOUBLE',
      });
      dfdActions = new StateActions(dfdState, dfdBridge as any, new UndoManager());
      initializeColumnsFromSchema(dfdState, sampleSchema);
      dfdState.tableName.set('test_table');
      dfdState.baseTableName.set('test_table');
      dfdState.totalRows.set(100);
      dfdState.filteredRows.set(100);
    });

    it('blocks rename of column that is referenced by another derived column', async () => {
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'total',
        expression: 'price * quantity',
      });
      await dfdActions.addDerivedColumn({
        kind: 'expression',
        name: 'tax',
        expression: 'total * 0.1',
      });

      const result = await dfdActions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'revenue',
        expression: 'price * quantity',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot rename');
      expect(result.error).toContain('"tax"');

      // Name unchanged
      expect(dfdState.derivedColumns.get()[0].name).toBe('total');
    });
  });
});
