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
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
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

async function createTable(overrides: {
  persistence?: boolean | { sessionStore?: SessionStore };
} = {}): Promise<{ table: DataTable; container: HTMLElement; bridge: WorkerBridge }> {
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
      await expect(
        table.loadData(new File([''], 'x.csv')),
      ).rejects.toBeInstanceOf(DestroyedError);
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
