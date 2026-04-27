import { describe, it, expect } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { RangeFilter, SetFilter } from '@/filters/FilterTypes';
import {
  snapshotFromState,
  restoreStateFromSnapshot,
  serializeStateSnapshot,
  deserializeStateSnapshot,
} from '@/persistence/serialization';
import { SNAPSHOT_VERSION, isPooledVectorRef } from '@/persistence/types';
import type { SessionSnapshot, SerializedStateSnapshot } from '@/persistence/types';
import { UndoManager, captureSnapshot } from '@/core/UndoManager';
import type { StateSnapshot } from '@/core/UndoManager';

// --- Test helpers ---

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
  {
    name: 'created',
    type: 'timestamp',
    nullable: true,
    originalType: 'TIMESTAMP',
  },
];

function setupState(schema: ColumnSchema[] = sampleSchema): TableState {
  const state = createTableState();
  state.tableName.set('test_table');
  state.totalRows.set(1000);
  state.filteredRows.set(1000);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function createTestSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'test_table',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name', 'age', 'created'],
    columnOrder: ['id', 'name', 'age', 'created'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

// =========================================
// snapshotFromState
// =========================================

describe('snapshotFromState', () => {
  it('produces a snapshot with correct version and timestamp', () => {
    const state = setupState();
    const before = Date.now();
    const snapshot = snapshotFromState(state);
    const after = Date.now();

    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.timestamp).toBeGreaterThanOrEqual(before);
    expect(snapshot.timestamp).toBeLessThanOrEqual(after);
    expect(snapshot.tableName).toBe('test_table');
  });

  it('serializes filters with Date values as DateWrapper', () => {
    const state = setupState();
    const d1 = new Date('2024-01-15T00:00:00.000Z');
    const d2 = new Date('2024-06-30T23:59:59.999Z');
    state.filters.set([{ type: 'range', column: 'created', min: d1, max: d2 }]);

    const snapshot = snapshotFromState(state);
    expect(snapshot.filters).toHaveLength(1);
    const f = snapshot.filters[0] as { min: unknown; max: unknown };
    expect(f.min).toEqual({ __date__: '2024-01-15T00:00:00.000Z' });
    expect(f.max).toEqual({ __date__: '2024-06-30T23:59:59.999Z' });
  });

  it('converts columnWidths Map to Record', () => {
    const state = setupState();
    state.columnWidths.set(
      new Map([
        ['id', 120],
        ['name', 250],
      ]),
    );

    const snapshot = snapshotFromState(state);
    expect(snapshot.columnWidths).toEqual({ id: 120, name: 250 });
  });

  it('converts hiddenColumnInfo Map to Record', () => {
    const state = setupState();
    state.hiddenColumnInfo.set(
      new Map([['age', { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' }]]),
    );

    const snapshot = snapshotFromState(state);
    expect(snapshot.hiddenColumnInfo).toEqual({
      age: { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' },
    });
  });

  it('copies array signals as independent arrays', () => {
    const state = setupState();
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);

    const snapshot = snapshotFromState(state);
    state.sortColumns.set([]);

    expect(snapshot.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
  });

  it('serializes empty derivedColumns when none exist', () => {
    const state = setupState();
    const snapshot = snapshotFromState(state);
    expect(snapshot.derivedColumns).toEqual([]);
  });

  it('serializes expression derived columns from state', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'expression', name: 'total', expression: 'price * quantity' },
    ]);

    const snapshot = snapshotFromState(state);
    expect(snapshot.derivedColumns).toHaveLength(1);
    expect(snapshot.derivedColumns[0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'price * quantity',
    });
  });

  it('deep-copies vector derived column values', () => {
    const state = setupState();
    const values = [1, 2, 3];
    state.derivedColumns.set([{ kind: 'vector', name: 'scores', vectorType: 'float', values }]);

    const snapshot = snapshotFromState(state);
    expect(snapshot.derivedColumns).toHaveLength(1);

    const vec = snapshot.derivedColumns[0];
    expect(vec.kind).toBe('vector');
    if (vec.kind === 'vector') {
      expect(vec.values).toEqual([1, 2, 3]);
      // Must be a deep copy — mutating original should not affect snapshot
      values.push(4);
      expect(vec.values).toHaveLength(3);
    }
  });

  it('uses baseTableName for tableName when available', () => {
    const state = setupState();
    state.baseTableName.set('base_table');
    state.tableName.set('__dt_view_base_table__');

    const snapshot = snapshotFromState(state);
    expect(snapshot.tableName).toBe('base_table');
  });

  it('falls back to tableName when baseTableName is null', () => {
    const state = setupState();
    // baseTableName defaults to null
    const snapshot = snapshotFromState(state);
    expect(snapshot.tableName).toBe('test_table');
  });
});

// =========================================
// restoreStateFromSnapshot — round-trip
// =========================================

describe('restoreStateFromSnapshot — round-trip', () => {
  it('round-trips all signal types', () => {
    const stateA = setupState();
    stateA.filters.set([{ type: 'range', column: 'age', min: 18, max: 65, maxInclusive: true }]);
    stateA.sortColumns.set([{ column: 'name', direction: 'desc' }]);
    stateA.visibleColumns.set(['id', 'name', 'age']);
    stateA.columnOrder.set(['name', 'id', 'age', 'created']);
    stateA.columnWidths.set(
      new Map([
        ['id', 80],
        ['name', 200],
      ]),
    );
    stateA.pinnedColumns.set(['id']);
    stateA.hiddenColumnInfo.set(
      new Map([
        [
          'created',
          {
            column: 'created',
            leftNeighbor: 'age',
            rightNeighbor: null,
          },
        ],
      ]),
    );

    const snapshot = snapshotFromState(stateA);

    const stateB = setupState();
    restoreStateFromSnapshot(stateB, snapshot);

    expect(stateB.filters.get()).toEqual(stateA.filters.get());
    expect(stateB.sortColumns.get()).toEqual(stateA.sortColumns.get());
    expect(stateB.visibleColumns.get()).toEqual(stateA.visibleColumns.get());
    expect(stateB.columnOrder.get()).toEqual(stateA.columnOrder.get());
    expect(stateB.columnWidths.get()).toEqual(stateA.columnWidths.get());
    expect(stateB.pinnedColumns.get()).toEqual(stateA.pinnedColumns.get());
    expect(stateB.hiddenColumnInfo.get()).toEqual(stateA.hiddenColumnInfo.get());
  });

  it('round-trips Date-containing filters', () => {
    const state = setupState();
    const d1 = new Date('2024-01-15T00:00:00.000Z');
    const d2 = new Date('2024-12-31T23:59:59.999Z');
    state.filters.set([{ type: 'range', column: 'created', min: d1, max: d2 }]);

    const snapshot = snapshotFromState(state);

    const restored = setupState();
    restoreStateFromSnapshot(restored, snapshot);

    const filter = restored.filters.get()[0] as RangeFilter;
    expect(filter.min).toBeInstanceOf(Date);
    expect(filter.max).toBeInstanceOf(Date);
    expect((filter.min as Date).getTime()).toBe(d1.getTime());
    expect((filter.max as Date).getTime()).toBe(d2.getTime());
  });

  it('round-trips Map-based signals', () => {
    const state = setupState();
    state.columnWidths.set(new Map([['id', 150]]));
    state.hiddenColumnInfo.set(
      new Map([['age', { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' }]]),
    );

    const snapshot = snapshotFromState(state);
    const restored = setupState();
    restoreStateFromSnapshot(restored, snapshot);

    expect(restored.columnWidths.get()).toBeInstanceOf(Map);
    expect(restored.columnWidths.get().get('id')).toBe(150);
    expect(restored.hiddenColumnInfo.get()).toBeInstanceOf(Map);
    expect(restored.hiddenColumnInfo.get().get('age')).toEqual({
      column: 'age',
      leftNeighbor: 'name',
      rightNeighbor: 'created',
    });
  });
});

// =========================================
// restoreStateFromSnapshot — schema validation
// =========================================

describe('restoreStateFromSnapshot — schema validation', () => {
  it('drops filters referencing columns not in schema', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [
        { type: 'range', column: 'id', min: 1, max: 100 },
        { type: 'pattern', column: 'removed_col', pattern: 'x', mode: 'contains' },
        { type: 'null', column: 'name' },
      ],
    });

    restoreStateFromSnapshot(state, snapshot);
    const filters = state.filters.get();
    expect(filters).toHaveLength(2);
    expect(filters[0].column).toBe('id');
    expect(filters[1].column).toBe('name');
  });

  it('sets empty filters when all filter columns are removed', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [
        { type: 'pattern', column: 'removed_a', pattern: 'x', mode: 'contains' },
        { type: 'null', column: 'removed_b' },
      ],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.filters.get()).toEqual([]);
  });

  it('drops sort columns referencing missing columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      sortColumns: [
        { column: 'id', direction: 'asc' },
        { column: 'removed_col', direction: 'desc' },
      ],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.sortColumns.get()).toEqual([{ column: 'id', direction: 'asc' }]);
  });

  it('filters visibleColumns to only schema columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      visibleColumns: ['id', 'removed_col', 'name'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.visibleColumns.get()).toEqual(['id', 'name']);
  });

  it('falls back to all schema columns when visibleColumns becomes empty', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      visibleColumns: ['removed_a', 'removed_b'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age', 'created']);
  });

  it('appends new schema columns to columnOrder', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      columnOrder: ['id', 'name'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.columnOrder.get()).toEqual(['id', 'name', 'age', 'created']);
  });

  it('filters columnOrder and appends missing schema columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      columnOrder: ['removed_col', 'name', 'id'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.columnOrder.get()).toEqual(['name', 'id', 'age', 'created']);
  });

  it('drops columnWidths for columns not in schema', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      columnWidths: { id: 100, removed_col: 200, name: 150 },
    });

    restoreStateFromSnapshot(state, snapshot);
    const widths = state.columnWidths.get();
    expect(widths.size).toBe(2);
    expect(widths.get('id')).toBe(100);
    expect(widths.get('name')).toBe(150);
    expect(widths.has('removed_col')).toBe(false);
  });

  it('filters pinnedColumns to only schema columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      pinnedColumns: ['id', 'removed_col'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.pinnedColumns.get()).toEqual(['id']);
  });

  it('drops hiddenColumnInfo for columns not in schema', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      hiddenColumnInfo: {
        age: { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' },
        removed_col: {
          column: 'removed_col',
          leftNeighbor: 'id',
          rightNeighbor: 'name',
        },
      },
    });

    restoreStateFromSnapshot(state, snapshot);
    const info = state.hiddenColumnInfo.get();
    expect(info.size).toBe(1);
    expect(info.has('age')).toBe(true);
    expect(info.has('removed_col')).toBe(false);
  });

  it('nullifies hiddenColumnInfo neighbor references to removed columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      hiddenColumnInfo: {
        age: {
          column: 'age',
          leftNeighbor: 'removed_col',
          rightNeighbor: 'name',
        },
      },
    });

    restoreStateFromSnapshot(state, snapshot);
    const info = state.hiddenColumnInfo.get().get('age')!;
    expect(info.leftNeighbor).toBeNull();
    expect(info.rightNeighbor).toBe('name');
  });
});

// =========================================
// restoreStateFromSnapshot — edge cases
// =========================================

describe('restoreStateFromSnapshot — edge cases', () => {
  it('does not restore when schema is empty', () => {
    const state = createTableState();
    // schema is empty by default
    const snapshot = createTestSnapshot({
      sortColumns: [{ column: 'id', direction: 'asc' }],
      pinnedColumns: ['id'],
    });

    restoreStateFromSnapshot(state, snapshot);
    expect(state.sortColumns.get()).toEqual([]);
    expect(state.pinnedColumns.get()).toEqual([]);
  });

  it('handles snapshot with all empty arrays gracefully', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [],
      sortColumns: [],
      visibleColumns: [],
      columnOrder: [],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
    });

    restoreStateFromSnapshot(state, snapshot);
    // visibleColumns should fall back to all schema columns
    expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age', 'created']);
    // columnOrder should contain all schema columns (appended)
    expect(state.columnOrder.get()).toEqual(['id', 'name', 'age', 'created']);
    expect(state.filters.get()).toEqual([]);
    expect(state.sortColumns.get()).toEqual([]);
    expect(state.pinnedColumns.get()).toEqual([]);
  });

  it('deserializes SetFilter with Date values in round-trip', () => {
    const state = setupState();
    const d = new Date('2024-05-01T00:00:00.000Z');
    state.filters.set([
      {
        type: 'set',
        column: 'created',
        values: [d, 'text', 42],
        includeNull: true,
      } as SetFilter,
    ]);

    const snapshot = snapshotFromState(state);
    const restored = setupState();
    restoreStateFromSnapshot(restored, snapshot);

    const filter = restored.filters.get()[0] as SetFilter;
    expect(filter.values[0]).toBeInstanceOf(Date);
    expect((filter.values[0] as Date).getTime()).toBe(d.getTime());
    expect(filter.values[1]).toBe('text');
    expect(filter.values[2]).toBe(42);
    expect(filter.includeNull).toBe(true);
  });
});

// =========================================
// restoreStateFromSnapshot — derivedColumns
// =========================================

describe('restoreStateFromSnapshot — derivedColumns', () => {
  it('restores expression derived columns to state signal', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    });

    restoreStateFromSnapshot(state, snapshot);
    const derived = state.derivedColumns.get();
    expect(derived).toHaveLength(1);
    expect(derived[0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'id * 2',
    });
  });

  it('restores vector derived columns with deep-copied values', () => {
    const values = [10, 20, 30];
    const state = setupState();
    const snapshot = createTestSnapshot({
      derivedColumns: [{ kind: 'vector', name: 'scores', vectorType: 'float', values }],
    });

    restoreStateFromSnapshot(state, snapshot);
    const derived = state.derivedColumns.get();
    expect(derived).toHaveLength(1);
    if (derived[0].kind === 'vector') {
      expect(derived[0].values).toEqual([10, 20, 30]);
      // Must be a deep copy
      values.push(40);
      expect(derived[0].values).toHaveLength(3);
    }
  });

  it('leaves derivedColumns empty when snapshot has none', () => {
    const state = setupState();
    state.derivedColumns.set([{ kind: 'expression', name: 'old', expression: 'id + 1' }]);

    const snapshot = createTestSnapshot({ derivedColumns: [] });
    restoreStateFromSnapshot(state, snapshot);

    // derivedColumns should NOT be cleared — empty array means "no derived columns in snapshot"
    // but the signal is only set when snapshot has entries
    // This verifies the guard: if (snapshot.derivedColumns.length > 0)
    expect(state.derivedColumns.get()).toHaveLength(1);
  });
});

// =========================================
// restoreStateFromSnapshot — derived column state preservation
// =========================================

describe('restoreStateFromSnapshot — derived column state preservation', () => {
  it('preserves filters, sorts, pins, widths, hiddenInfo, and order for derived columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [
        { type: 'range', column: 'age', min: 18, max: 65 },
        { type: 'range', column: 'total', min: 0, max: 1000 },
      ],
      sortColumns: [{ column: 'total', direction: 'desc' }],
      visibleColumns: ['id', 'total', 'name', 'age', 'created'],
      columnOrder: ['id', 'total', 'name', 'age', 'created'],
      columnWidths: { total: 200, id: 100 },
      pinnedColumns: ['id', 'total'],
      hiddenColumnInfo: {},
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    });

    restoreStateFromSnapshot(state, snapshot);

    // Derived column filter preserved
    expect(state.filters.get()).toHaveLength(2);
    expect(state.filters.get().find((f) => f.column === 'total')).toBeDefined();

    // Derived column sort preserved
    expect(state.sortColumns.get()).toEqual([{ column: 'total', direction: 'desc' }]);

    // Derived column in visibleColumns at correct position
    expect(state.visibleColumns.get()).toEqual(['id', 'total', 'name', 'age', 'created']);

    // Derived column in columnOrder at correct position (not appended to end)
    expect(state.columnOrder.get().indexOf('total')).toBe(1);

    // Derived column width preserved
    expect(state.columnWidths.get().get('total')).toBe(200);

    // Derived column pin preserved
    expect(state.pinnedColumns.get()).toEqual(['id', 'total']);
  });

  it('preserves hidden state for derived columns', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      visibleColumns: ['id', 'name', 'age', 'created'],
      columnOrder: ['id', 'total', 'name', 'age', 'created'],
      hiddenColumnInfo: {
        total: {
          column: 'total',
          leftNeighbor: 'id',
          rightNeighbor: 'name',
        },
      },
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    });

    restoreStateFromSnapshot(state, snapshot);

    // 'total' NOT in visibleColumns (it's hidden)
    expect(state.visibleColumns.get()).not.toContain('total');

    // 'total' IS in columnOrder (preserves position)
    expect(state.columnOrder.get()).toContain('total');
    expect(state.columnOrder.get().indexOf('total')).toBe(1);

    // hiddenColumnInfo for 'total' preserved
    const info = state.hiddenColumnInfo.get().get('total');
    expect(info).toBeDefined();
    expect(info!.leftNeighbor).toBe('id');
    expect(info!.rightNeighbor).toBe('name');
  });

  it('still drops truly stale columns even with derived columns present', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [
        { type: 'range', column: 'total', min: 0, max: 100 },
        { type: 'range', column: 'nonexistent', min: 0, max: 50 },
      ],
      pinnedColumns: ['total', 'nonexistent'],
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    });

    restoreStateFromSnapshot(state, snapshot);

    // 'total' is kept (derived column), 'nonexistent' is dropped (truly stale)
    expect(state.filters.get()).toHaveLength(1);
    expect(state.filters.get()[0].column).toBe('total');
    expect(state.pinnedColumns.get()).toEqual(['total']);
  });
});

// =========================================
// serializeStateSnapshot / deserializeStateSnapshot — derivedColumns
// =========================================

describe('serializeStateSnapshot — derivedColumns', () => {
  function createRuntimeSnapshot(overrides?: Partial<StateSnapshot>): StateSnapshot {
    return {
      filters: [],
      sortColumns: [],
      visibleColumns: ['id', 'name'],
      columnOrder: ['id', 'name'],
      columnWidths: new Map(),
      pinnedColumns: [],
      hiddenColumnInfo: new Map(),
      derivedColumns: [],
      ...overrides,
    };
  }

  it('serializes empty derivedColumns', () => {
    const snap = createRuntimeSnapshot();
    const serialized = serializeStateSnapshot(snap);
    expect(serialized.derivedColumns).toEqual([]);
  });

  it('serializes expression derived columns', () => {
    const snap = createRuntimeSnapshot({
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'a * b' }],
    });
    const serialized = serializeStateSnapshot(snap);
    expect(serialized.derivedColumns).toHaveLength(1);
    expect(serialized.derivedColumns![0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'a * b',
    });
  });

  it('deep-copies vector values for IndexedDB independence', () => {
    const values = [1, 2, 3];
    const snap = createRuntimeSnapshot({
      derivedColumns: [{ kind: 'vector', name: 'v', vectorType: 'float', values }],
    });
    const serialized = serializeStateSnapshot(snap);
    // Mutating original should not affect serialized
    values.push(4);
    expect(serialized.derivedColumns![0].kind).toBe('vector');
    if (serialized.derivedColumns![0].kind === 'vector') {
      expect(serialized.derivedColumns![0].values).toEqual([1, 2, 3]);
    }
  });
});

describe('deserializeStateSnapshot — derivedColumns', () => {
  it('restores derivedColumns from serialized entry', () => {
    const serialized: SerializedStateSnapshot = {
      filters: [],
      sortColumns: [],
      visibleColumns: ['id', 'name', 'total'],
      columnOrder: ['id', 'name', 'total'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    };
    const validColumns = new Set(['id', 'name']);
    const result = deserializeStateSnapshot(serialized, validColumns);

    expect(result.derivedColumns).toHaveLength(1);
    expect(result.derivedColumns[0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'id * 2',
    });
  });

  it('expands validColumns with derived column names', () => {
    const serialized: SerializedStateSnapshot = {
      filters: [{ type: 'range', column: 'total', min: 0, max: 100 }],
      sortColumns: [{ column: 'total', direction: 'asc' }],
      visibleColumns: ['id', 'total'],
      columnOrder: ['id', 'total'],
      columnWidths: { total: 200 },
      pinnedColumns: ['total'],
      hiddenColumnInfo: {},
      derivedColumns: [{ kind: 'expression', name: 'total', expression: 'id * 2' }],
    };
    const validColumns = new Set(['id', 'name']);
    const result = deserializeStateSnapshot(serialized, validColumns);

    // 'total' is a derived column — it should NOT be stripped as stale
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].column).toBe('total');
    expect(result.sortColumns).toEqual([{ column: 'total', direction: 'asc' }]);
    expect(result.visibleColumns).toContain('total');
    expect(result.columnOrder).toContain('total');
    expect(result.columnWidths.get('total')).toBe(200);
    expect(result.pinnedColumns).toContain('total');
  });

  it('defaults to empty array when derivedColumns is absent', () => {
    const serialized: SerializedStateSnapshot = {
      filters: [],
      sortColumns: [],
      visibleColumns: ['id', 'name'],
      columnOrder: ['id', 'name'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      // No derivedColumns field — simulates pre-feature data
    };
    const validColumns = new Set(['id', 'name']);
    const result = deserializeStateSnapshot(serialized, validColumns);

    expect(result.derivedColumns).toEqual([]);
  });

  it('round-trips derivedColumns through serialize/deserialize', () => {
    const original: StateSnapshot = {
      filters: [],
      sortColumns: [],
      visibleColumns: ['id', 'name', 'total'],
      columnOrder: ['id', 'name', 'total'],
      columnWidths: new Map([['total', 150]]),
      pinnedColumns: [],
      hiddenColumnInfo: new Map(),
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
        { kind: 'vector', name: 'scores', vectorType: 'float', values: [1.0, 2.0, 3.0] },
      ],
    };

    const serialized = serializeStateSnapshot(original);
    const validColumns = new Set(['id', 'name']);
    const deserialized = deserializeStateSnapshot(serialized, validColumns);

    expect(deserialized.derivedColumns).toHaveLength(2);
    expect(deserialized.derivedColumns[0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'id * 2',
    });
    expect(deserialized.derivedColumns[1].kind).toBe('vector');
    if (deserialized.derivedColumns[1].kind === 'vector') {
      expect(deserialized.derivedColumns[1].values).toEqual([1.0, 2.0, 3.0]);
    }
    // Derived column references preserved in other fields
    expect(deserialized.visibleColumns).toContain('total');
    expect(deserialized.columnWidths.get('total')).toBe(150);
  });

  it('should preserve raw-sql filters through column validation (synthetic keys bypass)', () => {
    const original: StateSnapshot = {
      filters: [
        { type: 'range', column: 'id', min: 1, max: 100 },
        { type: 'raw-sql', column: '__raw_sql_abc__', sql: 'age > 30', id: 'abc', label: 'Adults' },
        { type: 'raw-sql', column: '__raw_sql_def__', sql: 'status = 1', id: 'def' },
      ],
      sortColumns: [],
      visibleColumns: ['id', 'name'],
      columnOrder: ['id', 'name'],
      columnWidths: new Map(),
      pinnedColumns: [],
      hiddenColumnInfo: new Map(),
      derivedColumns: [],
    };

    const serialized = serializeStateSnapshot(original);
    const validColumns = new Set(['id', 'name']);
    const deserialized = deserializeStateSnapshot(serialized, validColumns);

    // All 3 filters should survive: range (valid column) + 2 raw-sql (bypass validation)
    expect(deserialized.filters).toHaveLength(3);
    expect(deserialized.filters[0].type).toBe('range');
    expect(deserialized.filters[1].type).toBe('raw-sql');
    expect(deserialized.filters[2].type).toBe('raw-sql');

    // Verify raw-sql filter properties are intact
    const sqlFilter = deserialized.filters[1] as import('@/filters/FilterTypes').RawSQLFilter;
    expect(sqlFilter.sql).toBe('age > 30');
    expect(sqlFilter.id).toBe('abc');
    expect(sqlFilter.label).toBe('Adults');
  });

  it('should drop stale column filters but keep raw-sql filters', () => {
    const original: StateSnapshot = {
      filters: [
        { type: 'range', column: 'deleted_column', min: 1, max: 100 },
        { type: 'raw-sql', column: '__raw_sql_abc__', sql: 'age > 30', id: 'abc' },
      ],
      sortColumns: [],
      visibleColumns: ['id', 'name'],
      columnOrder: ['id', 'name'],
      columnWidths: new Map(),
      pinnedColumns: [],
      hiddenColumnInfo: new Map(),
      derivedColumns: [],
    };

    const serialized = serializeStateSnapshot(original);
    const validColumns = new Set(['id', 'name']);
    const deserialized = deserializeStateSnapshot(serialized, validColumns);

    // Only raw-sql filter survives (range filter's column doesn't exist)
    expect(deserialized.filters).toHaveLength(1);
    expect(deserialized.filters[0].type).toBe('raw-sql');
  });
});

// =========================================
// Vector value pool deduplication (v4+)
// =========================================

describe('snapshotFromState — vector value pool deduplication', () => {
  it('SNAPSHOT_VERSION is 5', () => {
    expect(SNAPSHOT_VERSION).toBe(5);
  });

  it('creates pool when vector columns exist in undo stacks', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'scores', vectorType: 'float', values: [1, 2, 3] },
    ]);

    const undoManager = new UndoManager();
    // Push a snapshot with the vector column
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);
    expect(snapshot.vectorValuePool).toBeDefined();
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(1);
  });

  it('deduplicates shared vector values across undo entries by reference', () => {
    const state = setupState();
    const values = [10, 20, 30, 40, 50];
    state.derivedColumns.set([{ kind: 'vector', name: 'v', vectorType: 'integer', values }]);

    const undoManager = new UndoManager();

    // Push 5 snapshots — vector column unchanged, so all share the same values ref
    for (let i = 0; i < 5; i++) {
      undoManager.push(captureSnapshot(state));
      // Mutate something else so each snapshot is captured
      state.filters.set([{ type: 'range', column: 'age', min: i, max: 100 }]);
    }

    const snapshot = snapshotFromState(state, undoManager);

    // Only 1 pool entry despite 5 stack entries
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(1);

    // All undo stack entries use _poolRef
    for (const entry of snapshot.undoStack!) {
      expect(entry.derivedColumns).toHaveLength(1);
      const d = entry.derivedColumns![0];
      expect(isPooledVectorRef(d)).toBe(true);
    }
  });

  it('creates separate pool entries when vector values change', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ]);

    const undoManager = new UndoManager();

    // Push 2 snapshots with original values
    undoManager.push(captureSnapshot(state));
    state.filters.set([{ type: 'null', column: 'name' }]);
    undoManager.push(captureSnapshot(state));

    // Change vector values (new reference)
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'float', values: [4, 5, 6] },
    ]);

    // Push 2 more snapshots with new values
    undoManager.push(captureSnapshot(state));
    state.filters.set([]);
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);

    // 2 distinct pool entries: one for [1,2,3], one for [4,5,6]
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(2);
  });

  it('does not create pool when no vector columns exist', () => {
    const state = setupState();
    state.derivedColumns.set([{ kind: 'expression', name: 'total', expression: 'id * 2' }]);

    const undoManager = new UndoManager();
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);
    expect(snapshot.vectorValuePool).toBeUndefined();
  });

  it('does not create pool when undo stacks are empty', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ]);

    const undoManager = new UndoManager();
    // No pushes — stacks are empty

    const snapshot = snapshotFromState(state, undoManager);
    expect(snapshot.undoStack).toEqual([]);
    expect(snapshot.vectorValuePool).toBeUndefined();
  });

  it('handles multiple vector columns with independent dedup', () => {
    const state = setupState();
    const valuesA = [1, 2, 3];
    const valuesB = ['a', 'b', 'c'];
    state.derivedColumns.set([
      { kind: 'vector', name: 'nums', vectorType: 'integer', values: valuesA },
      { kind: 'vector', name: 'strs', vectorType: 'string', values: valuesB },
    ]);

    const undoManager = new UndoManager();
    // Push 3 snapshots — both columns unchanged
    for (let i = 0; i < 3; i++) {
      undoManager.push(captureSnapshot(state));
      state.filters.set([{ type: 'range', column: 'age', min: i, max: 100 }]);
    }

    const snapshot = snapshotFromState(state, undoManager);

    // 2 pool entries (one per column), not 6 (3 entries × 2 columns)
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(2);
  });

  it('pool values are independent copies (mutating original does not affect pool)', () => {
    const state = setupState();
    const values = [1, 2, 3];
    state.derivedColumns.set([{ kind: 'vector', name: 'v', vectorType: 'float', values }]);

    const undoManager = new UndoManager();
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);

    // Mutate original
    values.push(4);

    // Pool should have the original 3 elements
    const poolEntry = Object.values(snapshot.vectorValuePool!)[0];
    expect(poolEntry.values).toEqual([1, 2, 3]);
  });

  // Phase 7: lock the documented reference-identity (NOT content-hash) semantic.
  // Two structurally-identical-but-distinct arrays produce TWO pool entries —
  // dedup is by JS reference identity, the cheap O(n) path that covers the
  // captureSnapshot-shares-refs common case.
  it('two structurally-identical-but-distinct arrays produce TWO pool entries (ref-id dedup)', () => {
    const state = setupState();
    // Distinct array objects with identical contents.
    const valuesA = [1, 2, 3];
    const valuesB = [1, 2, 3];
    expect(valuesA).not.toBe(valuesB);
    expect(valuesA).toEqual(valuesB);

    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: valuesA },
    ]);

    const undoManager = new UndoManager();
    undoManager.push(captureSnapshot(state));
    state.filters.set([{ type: 'null', column: 'name' }]);

    // Swap the column to a structurally-identical NEW array reference.
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: valuesB },
    ]);
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);

    // Documents reference-identity dedup: TWO entries, not one. A content-hash
    // implementation would emit only one entry — this test fails first if the
    // dedup strategy is ever changed (and the JSDoc on
    // PooledVectorColumnRef / VectorValuePoolEntry needs updating in lockstep).
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(2);
    const [keyA, keyB] = Object.keys(snapshot.vectorValuePool!);
    expect(snapshot.vectorValuePool![keyA].values).toEqual([1, 2, 3]);
    expect(snapshot.vectorValuePool![keyB].values).toEqual([1, 2, 3]);
  });

  // Sanity check: the same array reference reused across an explicit undo
  // boundary still dedupes — confirms the "common case" the dedup is sized for.
  it('same array reference across distinct stack entries shares one pool entry', () => {
    const state = setupState();
    const sharedRef = [42, 43, 44];

    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: sharedRef },
    ]);

    const undoManager = new UndoManager();
    undoManager.push(captureSnapshot(state));
    state.filters.set([{ type: 'null', column: 'name' }]);

    // Re-set with the SAME ref (consumer re-supplies the same array literal,
    // e.g. an idempotent re-import). Dedup should fire.
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: sharedRef },
    ]);
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);
    expect(Object.keys(snapshot.vectorValuePool!)).toHaveLength(1);
  });
});

// =========================================
// Vector value pool — round-trip (serialize → restore)
// =========================================

describe('vector value pool — round-trip', () => {
  it('round-trips undo/redo stacks with pooled vector values', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'scores', vectorType: 'float', values: [10, 20, 30] },
    ]);

    const undoManager = new UndoManager();

    // Simulate: push initial state, change filter, push again
    undoManager.push(captureSnapshot(state));
    state.filters.set([{ type: 'null', column: 'name' }]);
    undoManager.push(captureSnapshot(state));

    const snapshot = snapshotFromState(state, undoManager);

    // Restore into fresh state + undoManager
    const restored = setupState();
    restored.derivedColumns.set([
      { kind: 'vector', name: 'scores', vectorType: 'float', values: [10, 20, 30] },
    ]);
    const restoredUndo = new UndoManager();
    restoreStateFromSnapshot(restored, snapshot, restoredUndo);

    // Undo stacks should be restored
    expect(restoredUndo.canUndo).toBe(true);
    expect(restoredUndo.undoDepth).toBe(2);

    // Undo to first entry and check vector values
    const current = captureSnapshot(restored);
    const prev = restoredUndo.undo(current);
    expect(prev).not.toBeNull();
    expect(prev!.derivedColumns).toHaveLength(1);
    expect(prev!.derivedColumns[0].kind).toBe('vector');
    if (prev!.derivedColumns[0].kind === 'vector') {
      expect(prev!.derivedColumns[0].values).toEqual([10, 20, 30]);
    }
  });

  it('deserialized pool entries share array references across stack entries', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: [1, 2, 3] },
    ]);

    const undoManager = new UndoManager();
    // Push 3 snapshots with same vector values
    for (let i = 0; i < 3; i++) {
      undoManager.push(captureSnapshot(state));
      state.filters.set([{ type: 'range', column: 'age', min: i, max: 100 }]);
    }

    const snapshot = snapshotFromState(state, undoManager);

    // Restore
    const restoredState = setupState();
    restoredState.derivedColumns.set([
      { kind: 'vector', name: 'v', vectorType: 'integer', values: [1, 2, 3] },
    ]);
    const restoredUndo = new UndoManager();
    restoreStateFromSnapshot(restoredState, snapshot, restoredUndo);

    // Get deserialized stacks and verify reference sharing
    const stacks = restoredUndo.getStacks();
    expect(stacks.undoStack.length).toBe(3);

    const vec0 = stacks.undoStack[0].derivedColumns[0];
    const vec1 = stacks.undoStack[1].derivedColumns[0];
    const vec2 = stacks.undoStack[2].derivedColumns[0];

    if (vec0.kind === 'vector' && vec1.kind === 'vector' && vec2.kind === 'vector') {
      // All three should share the same array reference (from the hydrated pool)
      expect(vec0.values).toBe(vec1.values);
      expect(vec1.values).toBe(vec2.values);
      expect(vec0.values).toEqual([1, 2, 3]);
    }
  });

  it('backward compat: deserializes pre-v4 inline values without pool', () => {
    const state = setupState();
    const undoManager = new UndoManager();

    // Simulate a pre-v4 snapshot with inline values and no pool
    const preV4Snapshot = createTestSnapshot({
      derivedColumns: [{ kind: 'vector', name: 'v', vectorType: 'float', values: [7, 8, 9] }],
      // These have inline values (no _poolRef) — pre-v4 format
      undoStack: [
        {
          filters: [],
          sortColumns: [],
          visibleColumns: ['id', 'name', 'v'],
          columnOrder: ['id', 'name', 'v'],
          columnWidths: {},
          pinnedColumns: [],
          hiddenColumnInfo: {},
          derivedColumns: [{ kind: 'vector', name: 'v', vectorType: 'float', values: [7, 8, 9] }],
        },
      ],
      // No vectorValuePool — pre-v4
    }) as SessionSnapshot;

    restoreStateFromSnapshot(state, preV4Snapshot, undoManager);

    expect(undoManager.canUndo).toBe(true);
    const stacks = undoManager.getStacks();
    const vec = stacks.undoStack[0].derivedColumns[0];
    expect(vec.kind).toBe('vector');
    if (vec.kind === 'vector') {
      expect(vec.values).toEqual([7, 8, 9]);
    }
  });

  it('gracefully handles missing pool reference', () => {
    const state = setupState();
    const undoManager = new UndoManager();

    // Snapshot with a _poolRef that doesn't exist in the pool
    const snapshot = createTestSnapshot({
      derivedColumns: [],
      undoStack: [
        {
          filters: [],
          sortColumns: [],
          visibleColumns: ['id', 'name'],
          columnOrder: ['id', 'name'],
          columnWidths: {},
          pinnedColumns: [],
          hiddenColumnInfo: {},
          derivedColumns: [
            { kind: 'vector', name: 'v', vectorType: 'float', _poolRef: 'nonexistent' } as any,
          ],
        },
      ],
      vectorValuePool: {}, // empty pool — ref won't resolve
    }) as SessionSnapshot;

    // Should not throw — graceful degradation
    restoreStateFromSnapshot(state, snapshot, undoManager);

    const stacks = undoManager.getStacks();
    const vec = stacks.undoStack[0].derivedColumns[0];
    expect(vec.kind).toBe('vector');
    if (vec.kind === 'vector') {
      // Graceful fallback to empty array
      expect(vec.values).toEqual([]);
    }
  });
});
