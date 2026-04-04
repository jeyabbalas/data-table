import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { SessionStore } from '@/persistence/SessionStore';
import { snapshotFromState } from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';

// --- Mocks ---

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function createMockBridge() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  };
}

function createMockStore(
  snapshot: SessionSnapshot | null = null,
): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(snapshot),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

function createTestSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'test_table',
    filters: [{ type: 'range', column: 'age', min: 18, max: 65 }],
    sortColumns: [{ column: 'name', direction: 'desc' as const }],
    visibleColumns: ['id', 'name'],
    columnOrder: ['name', 'id', 'age'],
    columnWidths: { id: 120, name: 250 },
    pinnedColumns: ['id'],
    hiddenColumnInfo: {
      age: { column: 'age', leftNeighbor: 'name', rightNeighbor: null },
    },
    derivedColumns: [],
    ...overrides,
  };
}

// --- Tests ---

describe('Session Restore on Load', () => {
  let state: TableState;
  let mockBridge: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    mockBridge = createMockBridge();
    actions = new StateActions(state, mockBridge as never);
  });

  // Mock the DataLoader's load method via the bridge
  function mockDataLoad() {
    // The DataLoader calls bridge.loadData, which returns schema and metadata
    // We need to mock at the right level. Since StateActions creates a DataLoader
    // internally, we mock the bridge methods that DataLoader uses.
    mockBridge.loadData.mockResolvedValue({
      tableName: 'test_table',
      rowCount: 1000,
      schema: sampleSchema,
    });
  }

  it('restores saved session state when sessionStore has a snapshot', async () => {
    mockDataLoad();
    const snapshot = createTestSnapshot();
    const store = createMockStore(snapshot);

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    expect(store.load).toHaveBeenCalledWith('test_table');
    expect(state.sortColumns.get()).toEqual([
      { column: 'name', direction: 'desc' },
    ]);
    expect(state.visibleColumns.get()).toEqual(['id', 'name']);
    expect(state.columnOrder.get()).toEqual(['name', 'id', 'age']);
    expect(state.pinnedColumns.get()).toEqual(['id']);
    expect(state.columnWidths.get().get('id')).toBe(120);
    expect(state.columnWidths.get().get('name')).toBe(250);
  });

  it('restores filters from saved session', async () => {
    mockDataLoad();
    const snapshot = createTestSnapshot();
    const store = createMockStore(snapshot);

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    const filters = state.filters.get();
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({
      type: 'range',
      column: 'age',
      min: 18,
      max: 65,
    });
  });

  it('restores hiddenColumnInfo from saved session', async () => {
    mockDataLoad();
    const snapshot = createTestSnapshot();
    const store = createMockStore(snapshot);

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    const info = state.hiddenColumnInfo.get();
    expect(info.size).toBe(1);
    expect(info.get('age')).toEqual({
      column: 'age',
      leftNeighbor: 'name',
      rightNeighbor: null,
    });
  });

  it('uses default state when sessionStore has no saved snapshot', async () => {
    mockDataLoad();
    const store = createMockStore(null);

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    expect(store.load).toHaveBeenCalledWith('test_table');
    // Default state: all columns visible, default order, no filters/sort/pins
    expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age']);
    expect(state.columnOrder.get()).toEqual(['id', 'name', 'age']);
    expect(state.filters.get()).toEqual([]);
    expect(state.sortColumns.get()).toEqual([]);
    expect(state.pinnedColumns.get()).toEqual([]);
  });

  it('works normally without sessionStore option', async () => {
    mockDataLoad();

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
    });

    expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age']);
    expect(state.filters.get()).toEqual([]);
  });

  it('drops filters referencing columns not in schema', async () => {
    mockDataLoad();
    const snapshot = createTestSnapshot({
      filters: [
        { type: 'range', column: 'age', min: 18, max: 65 },
        { type: 'null', column: 'removed_col' },
      ],
    });
    const store = createMockStore(snapshot);

    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    const filters = state.filters.get();
    expect(filters).toHaveLength(1);
    expect(filters[0].column).toBe('age');
  });

  it('round-trips state through snapshot and restore', async () => {
    mockDataLoad();

    // Load data and set up state
    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
    });
    state.filters.set([{ type: 'range', column: 'age', min: 10, max: 50 }]);
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    state.pinnedColumns.set(['id']);
    state.columnWidths.set(new Map([['name', 300]]));

    // Take snapshot
    const snapshot = snapshotFromState(state);

    // Load again with the snapshot in the store
    const store = createMockStore(snapshot);
    await actions.loadData(new File([''], 'test.csv'), {
      tableName: 'test_table',
      sessionStore: store,
    });

    // Verify restored state
    expect(state.filters.get()).toEqual([
      { type: 'range', column: 'age', min: 10, max: 50 },
    ]);
    expect(state.sortColumns.get()).toEqual([
      { column: 'id', direction: 'asc' },
    ]);
    expect(state.pinnedColumns.get()).toEqual(['id']);
    expect(state.columnWidths.get().get('name')).toBe(300);
  });
});
