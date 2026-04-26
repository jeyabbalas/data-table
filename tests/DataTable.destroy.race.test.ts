/**
 * @vitest-environment jsdom
 *
 * Phase 3 integration tests: end-to-end destroy race conditions.
 *
 * - `actions.markDestroyed()` is called by `DataTable.destroy()`, so any
 *   in-flight async action that resolves after destroy drops its post-await
 *   state mutation.
 * - `loadData` rejects with `DestroyedError` when destroy fires mid-load and
 *   does not emit `loadComplete` / `error` on the dying emitter.
 * - `ready` event's sticky replay checks `destroyed` inside the queued
 *   microtask — late subscribers added immediately before destroy do not
 *   receive the replay.
 * - Direct `table.actions.*` calls are guarded post-destroy (the `StateActions`
 *   layer is marked first thing inside `destroy()`).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
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

async function createTable(
  bridge?: WorkerBridge,
): Promise<{ table: DataTable; container: HTMLElement; bridge: WorkerBridge }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const b = bridge ?? makeBridge();
  const table = await createDataTable({
    container,
    bridge: b,
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
  });
  return { table, container, bridge: b };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('DataTable destroy race — actions guards (Phase 3)', () => {
  it('table.actions.addFilter throws DestroyedError after destroy', async () => {
    const { table } = await createTable();
    await table.destroy();
    expect(() =>
      table.actions.addFilter({ type: 'range', column: 'age', min: 18, max: 65 }),
    ).toThrow(DestroyedError);
  });

  it('table.actions.toggleSort throws DestroyedError after destroy', async () => {
    const { table } = await createTable();
    await table.destroy();
    expect(() => table.actions.toggleSort('age')).toThrow(DestroyedError);
  });

  it('table.actions.addDerivedColumn returns destroyed result after destroy', async () => {
    const { table } = await createTable();
    await table.destroy();
    const result = await table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'twice',
      expression: 'age * 2',
    });
    expect(result).toEqual({ success: false, error: 'DataTable is destroyed' });
  });

  it('table.actions.getColumnValues rejects with DestroyedError after destroy', async () => {
    const { table } = await createTable();
    await table.destroy();
    await expect(table.actions.getColumnValues('age')).rejects.toBeInstanceOf(DestroyedError);
  });

  it('table.actions.validateSQLFilter rejects with DestroyedError after destroy', async () => {
    const { table } = await createTable();
    await table.destroy();
    await expect(table.actions.validateSQLFilter('age > 18')).rejects.toBeInstanceOf(
      DestroyedError,
    );
  });
});

describe('DataTable destroy race — loadData mid-flight (Phase 3)', () => {
  it('destroy during loader.loadData drops state mutation and rejects with DestroyedError', async () => {
    const dfd = deferred<{ schema: never[]; rowCount: number }>();
    const bridge = makeBridge();
    (bridge.loadData as ReturnType<typeof vi.fn>).mockImplementation(() => dfd.promise);
    const { table } = await createTable(bridge);

    // Subscribe to load events; verify what fires.
    const loadComplete = vi.fn();
    const loadError = vi.fn();
    const errorEvent = vi.fn();
    table.on('loadComplete', loadComplete);
    table.on('loadError', loadError);
    table.on('error', errorEvent);

    // Kick off loadData. The first await inside loadDataImpl is normalizeSource
    // (sync for File/string), so we yield once before destroy to ensure the
    // bridge.loadData call is in flight.
    const file = new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' });
    const loadPromise = table.loadData(file);
    await Promise.resolve();
    await Promise.resolve();

    // Now destroy. The bridge.loadData promise is still pending.
    await table.destroy();

    // Resolve the bridge so actions.loadData proceeds past the await; it
    // should observe destroyed and throw DestroyedError, which propagates
    // up through loadDataImpl and back out to the caller.
    dfd.resolve({ schema: [], rowCount: 0 });

    await expect(loadPromise).rejects.toBeInstanceOf(DestroyedError);

    // No loadComplete / loadError / error fires after destroy: emitter is
    // already torn down OR loadDataImpl skips the emit when destroyed.
    expect(loadComplete).not.toHaveBeenCalled();
    expect(loadError).not.toHaveBeenCalled();
    expect(errorEvent).not.toHaveBeenCalled();
  });
});

describe('DataTable destroy race — ready replay (Phase 3)', () => {
  it('subscribe to ready then destroy synchronously: handler does NOT fire', async () => {
    const { table } = await createTable();

    const spy = vi.fn();
    // Subscribe AFTER createDataTable resolves — sticky replay would normally
    // fire on the next microtask. But destroy lands first.
    table.on('ready', spy);

    // Same task: destroy. The microtask checks `destroyed` before invoking
    // the handler.
    await table.destroy();

    // Even after multiple microtask flushes, the handler must not fire.
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it('subscribe to ready then await one microtask DOES fire (control case)', async () => {
    const { table } = await createTable();
    const spy = vi.fn();
    table.on('ready', spy);
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ bridgeReady: true });
    await table.destroy();
  });
});
