/**
 * @vitest-environment jsdom
 *
 * `clearSession()` clears the table's per-session state. The
 * `FilterPresetManager` is cleared only when this DataTable owns it.
 * User-supplied (shared) managers are left untouched — wiping them would
 * destroy the other tables' presets in a multi-table dashboard.
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

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({ tableName: 'A', rowCount: 0, schema }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

function makeSnapshotWithPreset(): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 'A',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name'],
    columnOrder: ['id', 'name'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    filterPresets: [
      { id: 'p1', name: 'restored-preset', filters: [], createdAt: 0, updatedAt: 0 },
    ],
  };
}

function makeSessionStore(snapshot: SessionSnapshot | null): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(snapshot),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function makeTableWithSharedManager(
  sharedManager: FilterPresetManager,
): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore(null) },
    presets: { manager: sharedManager },
    undoRedo: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
    source: new File([''], 'a.csv'),
    tableName: 'A',
  });
  return { table, container };
}

describe('clearSession — preset-manager ownership', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('clears an owned FilterPresetManager (snapshot-restored presets are wiped)', async () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const store = makeSessionStore(makeSnapshotWithPreset());
      const table = await createDataTable({
        container,
        bridge: makeBridge(),
        persistence: { sessionStore: store },
        presets: true, // owned
        undoRedo: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
        source: new File([''], 'a.csv'),
        tableName: 'A',
      });

      // Restored snapshot puts P1 into the internal manager. Trigger a save
      // to capture state into the SessionStore (so the spy records the
      // restored shape) and confirm it carries the preset.
      table.actions.setColumnWidth('id', 200);
      await vi.advanceTimersByTimeAsync(2000);

      const presetSavesBeforeClear = (
        store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }
      ).mock.calls.filter((call) => (call[0].filterPresets ?? []).length > 0);
      expect(presetSavesBeforeClear.length).toBeGreaterThan(0);

      // Now clear the session. After this, any subsequent save (triggered
      // by a state mutation) must NOT carry the preset, because the owned
      // manager was emptied.
      await table.clearSession();
      // clearSession resets state but tableName is null — no save will fire
      // until new data is loaded. So we re-load A with its (still-present)
      // snapshot and force a save to inspect.
      // Actually after clearSession, the snapshot for 'A' was deleted, so
      // load returns null and no preset is restored. A subsequent save must
      // therefore have no presets.
      (store.load as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await table.loadData(new File([''], 'a.csv'), { tableName: 'A' });
      table.actions.setColumnWidth('id', 300);
      await vi.advanceTimersByTimeAsync(2000);

      const savesAfterClear = (
        store.save as unknown as { mock: { calls: Array<[SessionSnapshot]> } }
      ).mock.calls.slice(presetSavesBeforeClear.length);
      const lastSave = savesAfterClear.at(-1);
      expect(lastSave).toBeDefined();
      expect(lastSave?.[0].filterPresets).toBeUndefined();
      await table.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a user-supplied (shared) FilterPresetManager', async () => {
    const sharedManager = new FilterPresetManager();
    const { table } = await makeTableWithSharedManager(sharedManager);

    sharedManager.save('keep-across-clear', [], []);
    expect(sharedManager.getPresets()).toHaveLength(1);

    await table.clearSession();

    // Shared manager outlives a single table's clearSession.
    expect(sharedManager.getPresets()).toHaveLength(1);
    expect(sharedManager.getPresets()[0].name).toBe('keep-across-clear');
    await table.destroy();
  });

  it('clears the AnnotationStore regardless of preset-manager ownership', async () => {
    const sharedManager = new FilterPresetManager();
    const { table } = await makeTableWithSharedManager(sharedManager);

    table.annotations.add({
      scope: 'row',
      rowId: 0,
      severity: 'warning',
      message: 'tied-to-this-table',
    });
    expect(table.annotations.count()).toBe(1);

    await table.clearSession();

    expect(table.annotations.count()).toBe(0);
    await table.destroy();
  });
});
