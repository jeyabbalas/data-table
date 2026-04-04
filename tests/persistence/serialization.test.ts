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
} from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';

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

  it('sets derivedColumns to empty array', () => {
    const state = setupState();
    const snapshot = snapshotFromState(state);
    expect(snapshot.derivedColumns).toEqual([]);
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
