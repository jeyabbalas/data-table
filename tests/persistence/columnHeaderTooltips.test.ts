import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTableState,
  initializeColumnsFromSchema,
} from '@/core/State';
import type { TableState } from '@/core/State';
import type {
  ColumnSchema,
  ColumnHeaderTooltipContent,
} from '@/core/types';
import {
  snapshotFromState,
  restoreStateFromSnapshot,
} from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';
import { AutoSave } from '@/persistence/AutoSave';
import type { SessionStore } from '@/persistence/SessionStore';

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function setupState(schema: ColumnSchema[] = sampleSchema): TableState {
  const state = createTableState();
  state.tableName.set('test_table');
  state.totalRows.set(100);
  state.filteredRows.set(100);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function createMockStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

function bareSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'test_table',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name', 'age'],
    columnOrder: ['id', 'name', 'age'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

describe('snapshotFromState — columnHeaderTooltips', () => {
  it('writes tooltips as a Record of structured content when at least one is set', () => {
    const state = setupState();
    state.columnHeaderTooltips.set(
      new Map<string, ColumnHeaderTooltipContent>([
        ['age', { description: 'Age in years' }],
        ['name', { title: 'Full name', items: [{ label: 'Type', value: 'string' }] }],
      ]),
    );

    const snapshot = snapshotFromState(state);
    expect(snapshot.columnHeaderTooltips).toEqual({
      age: { description: 'Age in years' },
      name: { title: 'Full name', items: [{ label: 'Type', value: 'string' }] },
    });
  });

  it('omits the field entirely when no tooltips are set', () => {
    const state = setupState();
    const snapshot = snapshotFromState(state);
    expect(snapshot.columnHeaderTooltips).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(snapshot, 'columnHeaderTooltips'),
    ).toBe(false);
  });
});

describe('restoreStateFromSnapshot — columnHeaderTooltips', () => {
  it('restores structured tooltips from a Record into a Map', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: { description: 'Age in years' },
        name: { title: 'Full name' },
      },
    });

    restoreStateFromSnapshot(state, snapshot);

    const tooltips = state.columnHeaderTooltips.get();
    expect(tooltips.get('age')).toEqual({ description: 'Age in years' });
    expect(tooltips.get('name')).toEqual({ title: 'Full name' });
    expect(tooltips.size).toBe(2);
  });

  it('back-compat: legacy string entry restores as { description: string }', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: 'Age in years',
      } as unknown as Record<string, ColumnHeaderTooltipContent>,
    });

    restoreStateFromSnapshot(state, snapshot);

    expect(state.columnHeaderTooltips.get().get('age')).toEqual({
      description: 'Age in years',
    });
  });

  it('mixed: restores both legacy string and structured object entries', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: 'legacy',
        name: { title: 'New', description: 'D' },
      } as unknown as Record<string, ColumnHeaderTooltipContent>,
    });

    restoreStateFromSnapshot(state, snapshot);

    const tooltips = state.columnHeaderTooltips.get();
    expect(tooltips.get('age')).toEqual({ description: 'legacy' });
    expect(tooltips.get('name')).toEqual({ title: 'New', description: 'D' });
    expect(tooltips.size).toBe(2);
  });

  it('drops tooltips for columns absent from the schema', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: { description: 'kept' },
        ghost: { description: 'dropped' },
      },
    });

    restoreStateFromSnapshot(state, snapshot);

    const tooltips = state.columnHeaderTooltips.get();
    expect(tooltips.has('age')).toBe(true);
    expect(tooltips.has('ghost')).toBe(false);
  });

  it('drops malformed object entries defensively', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: { description: 'kept' },
        // @ts-expect-error — corrupted snapshot
        name: { items: 'not an array' },
        // @ts-expect-error — corrupted snapshot
        id: 42,
      } as Record<string, ColumnHeaderTooltipContent>,
    });

    restoreStateFromSnapshot(state, snapshot);

    const tooltips = state.columnHeaderTooltips.get();
    expect(tooltips.get('age')).toEqual({ description: 'kept' });
    expect(tooltips.has('name')).toBe(false);
    expect(tooltips.has('id')).toBe(false);
  });

  it('drops entries that normalize to null (all-empty fields)', () => {
    const state = setupState();
    const snapshot = bareSnapshot({
      columnHeaderTooltips: {
        age: { title: '', description: '', items: [] },
        name: { description: 'kept' },
      },
    });

    restoreStateFromSnapshot(state, snapshot);

    const tooltips = state.columnHeaderTooltips.get();
    expect(tooltips.has('age')).toBe(false);
    expect(tooltips.has('name')).toBe(true);
  });

  it('pre-Phase-5 snapshot (no columnHeaderTooltips field) restores cleanly with empty map', () => {
    const state = setupState();
    state.columnHeaderTooltips.set(
      new Map([['age', { description: 'should be wiped' }]]),
    );

    const snapshot = bareSnapshot();
    restoreStateFromSnapshot(state, snapshot);

    expect(state.columnHeaderTooltips.get().size).toBe(0);
  });

  it('round-trips structured content through snapshot → restore', () => {
    const original = setupState();
    const content: Map<string, ColumnHeaderTooltipContent> = new Map([
      [
        'age',
        {
          title: 'Age',
          description: 'Age in years',
          items: [
            { label: 'Type', value: 'integer' },
            { label: 'Range', value: ['0', '120'] },
          ],
        },
      ],
      ['name', { title: 'Full name' }],
    ]);
    original.columnHeaderTooltips.set(content);

    const snapshot = snapshotFromState(original);

    const restored = setupState();
    restoreStateFromSnapshot(restored, snapshot);

    const tooltips = restored.columnHeaderTooltips.get();
    expect(tooltips.size).toBe(2);
    expect(tooltips.get('age')).toEqual(content.get('age'));
    expect(tooltips.get('name')).toEqual(content.get('name'));
  });
});

describe('AutoSave — columnHeaderTooltips subscription', () => {
  let state: TableState;
  let store: SessionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    state = setupState();
    store = createMockStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a save when columnHeaderTooltips changes', () => {
    const autoSave = new AutoSave(state, store);
    autoSave.enable();

    state.columnHeaderTooltips.set(
      new Map([['age', { description: 'Age in years' }]]),
    );
    expect(store.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(store.save).toHaveBeenCalledTimes(1);

    const savedSnapshot = (store.save as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as SessionSnapshot;
    expect(savedSnapshot.columnHeaderTooltips).toEqual({
      age: { description: 'Age in years' },
    });

    autoSave.destroy();
  });

  it('a structured-content set persists the object form', () => {
    const autoSave = new AutoSave(state, store);
    autoSave.enable();

    state.columnHeaderTooltips.set(
      new Map<string, ColumnHeaderTooltipContent>([
        [
          'age',
          {
            title: 'Age',
            items: [{ label: 'Range', value: ['0', '120'] }],
          },
        ],
      ]),
    );

    vi.advanceTimersByTime(1000);
    expect(store.save).toHaveBeenCalledTimes(1);

    const savedSnapshot = (store.save as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as SessionSnapshot;
    expect(savedSnapshot.columnHeaderTooltips).toEqual({
      age: { title: 'Age', items: [{ label: 'Range', value: ['0', '120'] }] },
    });

    autoSave.destroy();
  });
});
