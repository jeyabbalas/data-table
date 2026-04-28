/**
 * @vitest-environment jsdom
 *
 * `loadData` resets per-dataset state so a previous dataset's filter presets,
 * annotations, and cached query plans never leak into a newly-loaded
 * dataset's snapshot. User-supplied (shared) `FilterPresetManager`s are
 * left untouched — sharing across tables is opt-in.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createDataTable, FilterPresetManager, type DataTable } from '@/index';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const schemaA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

const schemaB: ColumnSchema[] = [
  { name: 'sku', type: 'string', nullable: false, originalType: 'VARCHAR' },
  { name: 'qty', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({ tableName: 'A', rowCount: 0, schema: schemaA }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

function emptySnapshot(tableName: string, overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName,
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name'],
    columnOrder: ['id', 'name'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

function makeSessionStore(snapshots: Record<string, SessionSnapshot | null> = {}): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockImplementation((name: string) => {
      return Promise.resolve(snapshots[name] ?? null);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function makeTable(
  overrides: {
    bridge?: WorkerBridge;
    store?: SessionStore;
    presets?: boolean | { manager: FilterPresetManager };
    tableName?: string;
  } = {},
): Promise<{ table: DataTable; container: HTMLElement; bridge: WorkerBridge; store: SessionStore }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = overrides.bridge ?? makeBridge();
  const store = overrides.store ?? makeSessionStore();
  const tableName = overrides.tableName ?? 'A';
  // Wire bridge.loadData to honor the requested tableName so the snapshot
  // key matches the test scenario.
  (bridge.loadData as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    tableName,
    rowCount: 0,
    schema: schemaA,
  });

  const table = await createDataTable({
    container,
    bridge,
    persistence: { sessionStore: store },
    presets: overrides.presets ?? true,
    undoRedo: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
    source: new File([''], `${tableName}.csv`),
    tableName,
  });
  return { table, container, bridge, store };
}

describe('loadData — resets per-dataset state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('clears the owned FilterPresetManager when switching datasets', async () => {
    vi.useFakeTimers();
    try {
      // Snapshot for A carries one preset; B has none.
      const snapshots: Record<string, SessionSnapshot | null> = {
        A: emptySnapshot('A', {
          filterPresets: [
            {
              id: 'p1',
              name: 'preset-from-A',
              filters: [],
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        }),
      };
      const store = makeSessionStore(snapshots);
      const bridge = makeBridge();
      const { table } = await makeTable({ bridge, store, tableName: 'A' });

      // Ensure A's snapshot was restored — the AutoSave path is downstream.
      // (We can't read the internal preset manager directly when it's owned,
      // so we verify behaviorally below via the saved snapshot for B.)

      // Flush any pending debounced save from the initial restore.
      await vi.advanceTimersByTimeAsync(2000);

      // Switch to B (no snapshot exists for B in `snapshots`).
      (bridge.loadData as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
        tableName: 'B',
        rowCount: 0,
        schema: schemaB,
      });
      await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });

      // Trigger a state mutation so AutoSave schedules a save under B's
      // tableName. resetTableState alone may leave most signals at their
      // default values (no notification fires), so we force one here.
      table.actions.setColumnWidth('sku', 250);
      await vi.advanceTimersByTimeAsync(2000);

      const savesForB = (
        store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }
      ).mock.calls.filter((call) => call[0].tableName === 'B');
      expect(savesForB.length).toBeGreaterThan(0);
      // Every save for B must NOT carry A's preset.
      for (const [snap] of savesForB) {
        expect(snap.filterPresets).toBeUndefined();
      }
      await table.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a user-supplied (shared) FilterPresetManager when switching datasets', async () => {
    const sharedManager = new FilterPresetManager();
    const { table, bridge } = await makeTable({
      presets: { manager: sharedManager },
      tableName: 'A',
    });

    sharedManager.save('keep-me', [], []);
    expect(sharedManager.getPresets()).toHaveLength(1);

    (bridge.loadData as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      tableName: 'B',
      rowCount: 0,
      schema: schemaB,
    });
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });

    // Shared manager outlives any single table's load — the preset stays.
    expect(sharedManager.getPresets()).toHaveLength(1);
    expect(sharedManager.getPresets()[0].name).toBe('keep-me');
    await table.destroy();
  });

  it('clears the AnnotationStore when switching datasets', async () => {
    const { table, bridge } = await makeTable({ tableName: 'A' });

    table.annotations.add({
      scope: 'row',
      rowId: 0,
      severity: 'info',
      message: 'note-on-A',
    });
    expect(table.annotations.count()).toBe(1);

    (bridge.loadData as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      tableName: 'B',
      rowCount: 0,
      schema: schemaB,
    });
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });

    expect(table.annotations.count()).toBe(0);
    await table.destroy();
  });

  it('invalidates the bridge query cache when switching datasets', async () => {
    const bridge = makeBridge();
    const { table } = await makeTable({ bridge, tableName: 'A' });

    // The initial createDataTable load may have called clearQueryCache as part
    // of its own setup — reset the spy so we observe only the next loadData.
    (bridge.clearQueryCache as ReturnType<typeof vi.fn>).mockClear();

    (bridge.loadData as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      tableName: 'B',
      rowCount: 0,
      schema: schemaB,
    });
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });

    expect(bridge.clearQueryCache).toHaveBeenCalled();
    await table.destroy();
  });
});
