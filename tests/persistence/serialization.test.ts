import { describe, it, expect } from 'vitest';
import {
  createTableState,
  initializeColumnsFromSchema,
} from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { RangeFilter, SetFilter } from '@/filters/FilterTypes';
import {
  snapshotFromState,
  restoreStateFromSnapshot,
  serializeStateSnapshot,
  deserializeStateSnapshot,
} from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot, SerializedStateSnapshot } from '@/persistence/types';
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

function createTestSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
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
    state.filters.set([
      { type: 'range', column: 'created', min: d1, max: d2 },
    ]);

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
      new Map([
        [
          'age',
          { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' },
        ],
      ]),
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
    state.derivedColumns.set([
      { kind: 'vector', name: 'scores', vectorType: 'float', values },
    ]);

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
    stateA.filters.set([
      { type: 'range', column: 'age', min: 18, max: 65, maxInclusive: true },
    ]);
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
    expect(stateB.hiddenColumnInfo.get()).toEqual(
      stateA.hiddenColumnInfo.get(),
    );
  });

  it('round-trips Date-containing filters', () => {
    const state = setupState();
    const d1 = new Date('2024-01-15T00:00:00.000Z');
    const d2 = new Date('2024-12-31T23:59:59.999Z');
    state.filters.set([
      { type: 'range', column: 'created', min: d1, max: d2 },
    ]);

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
      new Map([
        ['age', { column: 'age', leftNeighbor: 'name', rightNeighbor: 'created' }],
      ]),
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
    expect(state.sortColumns.get()).toEqual([
      { column: 'id', direction: 'asc' },
    ]);
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
    expect(state.visibleColumns.get()).toEqual([
      'id',
      'name',
      'age',
      'created',
    ]);
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
    expect(state.columnOrder.get()).toEqual([
      'name',
      'id',
      'age',
      'created',
    ]);
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
    expect(state.visibleColumns.get()).toEqual([
      'id',
      'name',
      'age',
      'created',
    ]);
    // columnOrder should contain all schema columns (appended)
    expect(state.columnOrder.get()).toEqual([
      'id',
      'name',
      'age',
      'created',
    ]);
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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
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
      derivedColumns: [
        { kind: 'vector', name: 'scores', vectorType: 'float', values },
      ],
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
    state.derivedColumns.set([
      { kind: 'expression', name: 'old', expression: 'id + 1' },
    ]);

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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
    });

    restoreStateFromSnapshot(state, snapshot);

    // Derived column filter preserved
    expect(state.filters.get()).toHaveLength(2);
    expect(state.filters.get().find(f => f.column === 'total')).toBeDefined();

    // Derived column sort preserved
    expect(state.sortColumns.get()).toEqual([
      { column: 'total', direction: 'desc' },
    ]);

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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'a * b' },
      ],
    });
    const serialized = serializeStateSnapshot(snap);
    expect(serialized.derivedColumns).toHaveLength(1);
    expect(serialized.derivedColumns![0]).toEqual({
      kind: 'expression', name: 'total', expression: 'a * b',
    });
  });

  it('deep-copies vector values for IndexedDB independence', () => {
    const values = [1, 2, 3];
    const snap = createRuntimeSnapshot({
      derivedColumns: [
        { kind: 'vector', name: 'v', vectorType: 'float', values },
      ],
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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
    };
    const validColumns = new Set(['id', 'name']);
    const result = deserializeStateSnapshot(serialized, validColumns);

    expect(result.derivedColumns).toHaveLength(1);
    expect(result.derivedColumns[0]).toEqual({
      kind: 'expression', name: 'total', expression: 'id * 2',
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
      derivedColumns: [
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ],
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
      kind: 'expression', name: 'total', expression: 'id * 2',
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
