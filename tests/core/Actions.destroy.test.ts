/**
 * StateActions destroy-guard tests.
 *
 * Phase 3 added a `destroyed` flag and `markDestroyed()` to StateActions.
 * Sync mutators throw DestroyedError after destroy. Async methods drop their
 * post-await state mutation: result-shaped methods (add/update/replace
 * DerivedColumn) return `{ success: false, error }`; everything else throws
 * DestroyedError.
 *
 * Pure getters (`getUndoManager`, `getRawSQLFilters`, `getFiltersSQL`,
 * `getColumnHeaderTooltip`, `getCompletionContext`) intentionally do not
 * guard, mirroring the `DataTable.getColorScheme` pattern — consumers may
 * still want to read the last-known state during teardown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { DestroyedError, DerivedColumnError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

const sampleSchema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

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

function createMockBridge(queryImpl?: (sql: string, signal?: AbortSignal) => Promise<unknown>) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(queryImpl ?? (async () => [])),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    clearQueryCache: vi.fn(),
  };
}

describe('StateActions destroy guards — sync mutators', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, createMockBridge() as never);
    initializeColumnsFromSchema(state, sampleSchema);
    state.totalRows.set(10);
    state.filteredRows.set(10);
    state.tableName.set('t');
  });

  it('markDestroyed is idempotent', () => {
    actions.markDestroyed();
    actions.markDestroyed();
    expect(actions.isDestroyed()).toBe(true);
  });

  it('addFilter throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.addFilter({ column: 'age', type: 'range', min: 18, max: 65 })).toThrow(
      DestroyedError,
    );
    // State must not be mutated.
    expect(state.filters.get()).toEqual([]);
  });

  it('removeFilter throws DestroyedError after markDestroyed', () => {
    actions.addFilter({ column: 'age', type: 'range', min: 18, max: 65 });
    actions.markDestroyed();
    expect(() => actions.removeFilter('age')).toThrow(DestroyedError);
    expect(state.filters.get()).toHaveLength(1);
  });

  it('clearFilters throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.clearFilters()).toThrow(DestroyedError);
  });

  it('toggleSort throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.toggleSort('age')).toThrow(DestroyedError);
    expect(state.sortColumns.get()).toEqual([]);
  });

  it('hideColumn throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.hideColumn('age')).toThrow(DestroyedError);
    expect(state.visibleColumns.get()).toContain('age');
  });

  it('showColumn throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.showColumn('hidden')).toThrow(DestroyedError);
  });

  it('setColumnOrder throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.setColumnOrder(['age', 'name'])).toThrow(DestroyedError);
  });

  it('toggleColumnPin throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.toggleColumnPin('age')).toThrow(DestroyedError);
    expect(state.pinnedColumns.get()).toEqual([]);
  });

  it('setColumnWidth throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.setColumnWidth('age', 200)).toThrow(DestroyedError);
    expect(state.columnWidths.get().has('age')).toBe(false);
  });

  it('setColumnHeaderTooltip throws DestroyedError after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.setColumnHeaderTooltip('age', 'tip')).toThrow(DestroyedError);
    expect(state.columnHeaderTooltips.get().has('age')).toBe(false);
  });

  it('selectRow / clearSelection / selectAll throw after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.selectRow(0)).toThrow(DestroyedError);
    expect(() => actions.clearSelection()).toThrow(DestroyedError);
    expect(() => actions.selectAll()).toThrow(DestroyedError);
  });

  it('setHoveredRow / setHoveredColumn / setFocusedCell throw after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.setHoveredRow(0)).toThrow(DestroyedError);
    expect(() => actions.setHoveredColumn('age')).toThrow(DestroyedError);
    expect(() => actions.setFocusedCell({ row: 0, column: 'age' })).toThrow(DestroyedError);
    expect(() => actions.clearFocusedCell()).toThrow(DestroyedError);
  });

  it('setOnFilterRemove / setOnDerivedChange throw after markDestroyed', () => {
    actions.markDestroyed();
    expect(() => actions.setOnFilterRemove(() => {})).toThrow(DestroyedError);
    expect(() =>
      actions.setOnDerivedChange(() => {
        /* noop */
      }),
    ).toThrow(DestroyedError);
  });

  it('addRawSQLFilter / updateRawSQLFilter / removeRawSQLFilter throw after markDestroyed', () => {
    const id = actions.addRawSQLFilter('age > 18');
    actions.markDestroyed();
    expect(() => actions.addRawSQLFilter('age > 21')).toThrow(DestroyedError);
    expect(() => actions.updateRawSQLFilter(id, 'age > 21')).toThrow(DestroyedError);
    expect(() => actions.removeRawSQLFilter(id)).toThrow(DestroyedError);
  });

  it('pure getters keep working after markDestroyed', () => {
    actions.addFilter({ column: 'age', type: 'range', min: 18, max: 65 });
    actions.markDestroyed();
    // None of these throw — getters mirror DataTable.getColorScheme.
    expect(actions.getRawSQLFilters()).toEqual([]);
    expect(actions.getFiltersSQL()).toContain('age');
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(actions.getUndoManager()).toBeUndefined();
  });
});

describe('StateActions destroy guards — async, pre-call destroyed', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, createMockBridge() as never);
    initializeColumnsFromSchema(state, sampleSchema);
    state.totalRows.set(10);
    state.tableName.set('t');
    state.baseTableName.set('t');
  });

  it('loadData throws DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.loadData('a,b\n1,2')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('undo / redo / resetToInitial throw DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.undo()).rejects.toBeInstanceOf(DestroyedError);
    await expect(actions.redo()).rejects.toBeInstanceOf(DestroyedError);
    await expect(actions.resetToInitial()).rejects.toBeInstanceOf(DestroyedError);
  });

  it('removeDerivedColumn throws DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.removeDerivedColumn('any')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('getColumnValues throws DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.getColumnValues('age')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('validateExpression throws DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.validateExpression('1 + 1')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('validateSQLFilter throws DestroyedError if called after markDestroyed', async () => {
    actions.markDestroyed();
    await expect(actions.validateSQLFilter('age > 18')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('addDerivedColumn returns { success: false, error } when called after markDestroyed', async () => {
    actions.markDestroyed();
    const result = await actions.addDerivedColumn({
      kind: 'expression',
      name: 'twice_age',
      expression: 'age * 2',
    });
    expect(result).toEqual({ success: false, error: 'DataTable is destroyed' });
  });

  it('updateDerivedColumn returns { success: false, error } when called after markDestroyed', async () => {
    actions.markDestroyed();
    const result = await actions.updateDerivedColumn('foo', {
      kind: 'expression',
      name: 'foo',
      expression: '1',
    });
    expect(result).toEqual({ success: false, error: 'DataTable is destroyed' });
  });

  it('replaceDerivedColumn returns { success: false, DerivedColumnError(DESTROYED) } after markDestroyed', async () => {
    actions.markDestroyed();
    const result = await actions.replaceDerivedColumn('foo', {
      kind: 'expression',
      name: 'foo',
      expression: '1',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toBeInstanceOf(DerivedColumnError);
      expect(result.error.code).toBe('DESTROYED');
    }
  });
});

describe('StateActions destroy guards — destroyed-during-await race', () => {
  let state: TableState;

  beforeEach(() => {
    state = createTableState();
    initializeColumnsFromSchema(state, sampleSchema);
    state.totalRows.set(10);
    state.filteredRows.set(10);
    state.tableName.set('t');
    state.baseTableName.set('t');
  });

  it('loadData rejects with DestroyedError when destroy fires during loader.load()', async () => {
    const dfd = deferred<{
      tableName: string;
      rowCount: number;
      schema: ColumnSchema[];
    }>();
    const bridge = {
      ...createMockBridge(),
      // DataLoader uses bridge.loadData (mocked inside DataLoader); here we
      // intercept the bridge's loadData call to return a deferred result.
      loadData: vi.fn(() => dfd.promise),
    };
    const actions = new StateActions(state, bridge as never);

    // Kick off loadData; it will block on dfd.
    const loadPromise = actions.loadData('a,b\n1,2', { format: 'csv' });

    // Mark destroyed mid-await.
    actions.markDestroyed();

    // Resolve the loader so loadData proceeds past the await.
    dfd.resolve({ tableName: 't', rowCount: 1, schema: sampleSchema });

    await expect(loadPromise).rejects.toBeInstanceOf(DestroyedError);
    // Schema should not have been initialized — loadData dropped its post-await
    // state mutation. (resetTableState fired before the await; that's expected
    // and harmless because it runs synchronously and the table is being torn
    // down.)
    expect(state.schema.get()).toEqual([]);
  });

  it('getColumnValues rejects with DestroyedError when destroy fires during bridge.query()', async () => {
    const dfd = deferred<unknown[]>();
    const bridge = {
      ...createMockBridge(),
      query: vi.fn(() => dfd.promise),
    };
    const actions = new StateActions(state, bridge as never);

    const valuesPromise = actions.getColumnValues('age');
    actions.markDestroyed();
    dfd.resolve([{ val: 1 }, { val: 2 }]);

    await expect(valuesPromise).rejects.toBeInstanceOf(DestroyedError);
  });

  it('validateSQLFilter rejects with DestroyedError when destroy fires during bridge.query()', async () => {
    const dfd = deferred<unknown[]>();
    const bridge = {
      ...createMockBridge(),
      query: vi.fn(() => dfd.promise),
    };
    const actions = new StateActions(state, bridge as never);

    const validatePromise = actions.validateSQLFilter('age > 18');
    actions.markDestroyed();
    dfd.resolve([{ cnt: 5 }]);

    await expect(validatePromise).rejects.toBeInstanceOf(DestroyedError);
  });

  it('addDerivedColumn returns destroyed result when destroy fires mid-await', async () => {
    // Stub the bridge.query to return a deferred — DerivedColumnManager's
    // addColumn invokes multiple queries; the first one suffices to suspend.
    const dfd = deferred<unknown[]>();
    const bridge = {
      ...createMockBridge(),
      // Keep first query pending; subsequent calls would never get sent.
      query: vi.fn(() => dfd.promise),
    };
    const actions = new StateActions(state, bridge as never);

    const addPromise = actions.addDerivedColumn({
      kind: 'expression',
      name: 'twice_age',
      expression: 'age * 2',
    });

    // Yield to the microtask queue so addDerivedColumn enters the await.
    await Promise.resolve();
    actions.markDestroyed();

    // Reject the in-flight query so the manager's promise settles. The
    // destroyed flag means the post-await branch never applies state.
    dfd.reject(new Error('aborted'));

    const result = await addPromise;
    expect(result.success).toBe(false);
    // State was NOT mutated.
    expect(state.derivedColumns.get()).toEqual([]);
    expect(state.schema.get().some((c) => c.name === 'twice_age')).toBe(false);
  });
});
