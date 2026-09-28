/**
 * @vitest-environment jsdom
 *
 * Phase 2 lifecycle & resource-safety contract:
 *   - Post-destroy public methods throw DestroyedError.
 *   - isDestroyed() / isPersistenceActive() report correctly.
 *   - `ready` event replays to late subscribers (sticky pattern).
 *   - Double-destroy is a no-op (no duplicate destroy events).
 *   - Listener errors surface as `error` events with source: 'listener'.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import { DestroyedError } from '@/core/errors';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

function makeSessionStore(): SessionStore {
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

function makeFailingSessionStore(): SessionStore {
  return {
    open: vi.fn().mockRejectedValue(new Error('idb blocked')),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function createTable(
  overrides: {
    persistence?: boolean | { sessionStore?: SessionStore };
  } = {},
): Promise<{ table: DataTable; container: HTMLElement; bridge: WorkerBridge }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  const table = await createDataTable({
    container,
    bridge,
    persistence:
      overrides.persistence === undefined
        ? { sessionStore: makeSessionStore() }
        : overrides.persistence,
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
  });
  return { table, container, bridge };
}

describe('DataTable — lifecycle (Phase 2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('sticky ready replay', () => {
    it('fires ready for a subscriber registered AFTER await createDataTable(...)', async () => {
      const { table } = await createTable();
      const spy = vi.fn();
      table.on('ready', spy);

      // Flush one microtask so the sticky replay runs.
      await Promise.resolve();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ bridgeReady: true });
      await table.destroy();
    });

    it('replays only once per subscriber', async () => {
      const { table } = await createTable();
      const spy = vi.fn();
      table.on('ready', spy);
      await Promise.resolve();
      await Promise.resolve();
      expect(spy).toHaveBeenCalledTimes(1);
      await table.destroy();
    });
  });

  describe('isDestroyed() / isPersistenceActive()', () => {
    it('isDestroyed() is false before destroy, true after', async () => {
      const { table } = await createTable();
      expect(table.isDestroyed()).toBe(false);
      await table.destroy();
      expect(table.isDestroyed()).toBe(true);
    });

    it('isPersistenceActive() is true on happy path', async () => {
      const { table } = await createTable();
      expect(table.isPersistenceActive()).toBe(true);
      await table.destroy();
    });

    it('isPersistenceActive() is false when IDB open() rejects', async () => {
      const { table } = await createTable({
        persistence: { sessionStore: makeFailingSessionStore() },
      });
      expect(table.isPersistenceActive()).toBe(false);
      await table.destroy();
    });

    it('isPersistenceActive() is false when persistence is disabled', async () => {
      const { table } = await createTable({ persistence: false });
      expect(table.isPersistenceActive()).toBe(false);
      await table.destroy();
    });
  });

  describe('post-destroy guards', () => {
    it('loadData throws DestroyedError', async () => {
      const { table } = await createTable();
      await table.destroy();
      await expect(table.loadData(new File([''], 'x.csv'))).rejects.toBeInstanceOf(DestroyedError);
    });

    it('on throws DestroyedError', async () => {
      const { table } = await createTable();
      await table.destroy();
      expect(() => table.on('ready', () => {})).toThrow(DestroyedError);
    });

    it('off throws DestroyedError', async () => {
      const { table } = await createTable();
      await table.destroy();
      expect(() => table.off('ready', () => {})).toThrow(DestroyedError);
    });

    it('openExportDialog throws DestroyedError', async () => {
      const { table } = await createTable();
      await table.destroy();
      expect(() => table.openExportDialog()).toThrow(DestroyedError);
    });

    it('clearSession throws DestroyedError', async () => {
      const { table } = await createTable();
      await table.destroy();
      await expect(table.clearSession()).rejects.toBeInstanceOf(DestroyedError);
    });
  });

  describe('clearSession', () => {
    it('empties the table in its turn, after a derived-column change running then', async () => {
      const { table, bridge } = await createTable();
      table.state.tableName.set('t');
      table.state.baseTableName.set('t');
      table.state.totalRows.set(3);
      table.state.schema.set([
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      ]);
      table.state.visibleColumns.set(['id']);
      table.state.columnOrder.set(['id']);
      // Hold the add's first query, its validation, until released.
      let release!: () => void;
      vi.mocked(bridge.query).mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve([]))),
      );
      const add = table.actions.addDerivedColumn({
        kind: 'expression',
        name: 'x2',
        expression: 'id * 2',
      });
      await Promise.resolve();
      const clearing = table.clearSession();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      release();
      await expect(add).resolves.toMatchObject({ success: false });
      await clearing;

      expect(table.state.tableName.get()).toBeNull();
      expect(table.state.schema.get()).toEqual([]);
      expect(table.state.derivedColumns.get()).toEqual([]);
      expect(table.state.visibleColumns.get()).toEqual([]);
      await table.destroy();
    });

    it('reports a superseded load that fails only through its promise', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const bridge = makeBridge();
      let fail!: () => void;
      vi.mocked(bridge.loadData)
        .mockImplementationOnce(
          () => new Promise((_, reject) => (fail = () => reject(new Error('boom')))),
        )
        .mockResolvedValueOnce({
          tableName: 'b',
          rowCount: 3,
          columns: ['id'],
          schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
        } as never);
      const table = await createDataTable({
        container,
        bridge,
        persistence: false,
        presets: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
      });
      const events: string[] = [];
      table.on('loadStart', () => events.push('loadStart'));
      table.on('loadComplete', ({ tableName }) => events.push(`loadComplete ${tableName}`));
      table.on('loadError', () => events.push('loadError'));
      table.on('error', () => events.push('error'));

      const first = table.loadData('id\n1', { tableName: 'a' });
      const second = table.loadData('id\n1', { tableName: 'b' });
      await Promise.resolve();
      fail();
      await expect(first).rejects.toThrow('boom');
      await second;
      expect(events).toEqual(['loadStart', 'loadStart', 'loadComplete b']);
      await table.destroy();
    });

    it('empties the table a load in flight lands, and drops it and its snapshot', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const bridge = makeBridge();
      const dropTable = vi.fn().mockResolvedValue(undefined);
      (bridge as unknown as { dropTable: unknown }).dropTable = dropTable;
      const schema = (name: string) => [
        { name, type: 'integer', nullable: false, originalType: 'INTEGER' },
      ];
      let finish!: () => void;
      vi.mocked(bridge.loadData)
        .mockResolvedValueOnce({
          tableName: 'old',
          rowCount: 3,
          columns: ['id'],
          schema: schema('id'),
        } as never)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () =>
                resolve({
                  tableName: 'new',
                  rowCount: 5,
                  columns: ['n'],
                  schema: schema('n'),
                } as never);
            }),
        );
      const store = makeSessionStore();
      const table = await createDataTable({
        container,
        bridge,
        persistence: { sessionStore: store },
        presets: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
      });
      await table.loadData('id\n1\n2', { tableName: 'old' });
      const events: string[] = [];
      table.on('loadComplete', ({ tableName }) => events.push(`loadComplete ${tableName}`));
      table.on('loadError', () => events.push('loadError'));

      // Neither awaited: the clear waits for the load, which lands first.
      const loading = table.loadData('n\n1\n2', { tableName: 'new' });
      const clearing = table.clearSession();
      await new Promise((resolve) => setTimeout(resolve, 0));
      finish();
      await Promise.all([loading, clearing]);

      // The load was superseded: no loadComplete for the data the clear took.
      expect(events).toEqual([]);
      expect(table.state.tableName.get()).toBeNull();
      expect(vi.mocked(store.delete)).toHaveBeenCalledWith('new');
      // Nothing names the table the load replaced, nor the one it made:
      // both are dropped, the latter by the load or on destroy at the
      // latest, and each once.
      expect(dropTable.mock.calls.map(([name]) => name)).toContain('old');
      await table.destroy();
      expect(dropTable.mock.calls.map(([name]) => name).sort()).toEqual(['new', 'old']);
    });
  });

  describe('destroy idempotency', () => {
    it('double destroy emits `destroy` only once', async () => {
      const { table } = await createTable();
      const spy = vi.fn();
      table.on('destroy', spy);
      await table.destroy();
      await table.destroy();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('listener safety — throwing listener routes to error event', () => {
    it('listener throw surfaces via error event with source: listener', async () => {
      const { table } = await createTable();
      const errSpy = vi.fn();
      table.on('error', errSpy);
      table.on('sortChange', () => {
        throw new Error('listener boom');
      });

      // Trigger a sortChange via state signal (bypasses action validation).
      table.state.sortColumns.set([{ column: 'x', direction: 'asc' }]);

      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy.mock.calls[0][0].source).toBe('listener');
      expect(errSpy.mock.calls[0][0].error).toBeInstanceOf(Error);

      await table.destroy();
    });

    it('throwing `error` listener does not recurse (console.error fallback)', async () => {
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { table } = await createTable();
      table.on('error', () => {
        throw new Error('error handler boom');
      });
      table.on('sortChange', () => {
        throw new Error('listener boom');
      });

      // Should not throw synchronously; should not recurse.
      table.state.sortColumns.set([{ column: 'x', direction: 'asc' }]);

      // Expect at least one console.error from the error-inside-error guard.
      expect(consoleErr).toHaveBeenCalled();
      consoleErr.mockRestore();
      await table.destroy();
    });
  });
});
