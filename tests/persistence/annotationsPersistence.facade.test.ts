/**
 * @vitest-environment jsdom
 *
 * The facade's side of annotations kept in a record of their own: a restore
 * that leaves them out says so with a `warning` (never silently), whoever
 * owns the session store, a load turned away for its source options puts
 * them back without a write, and `clearSession` / `destroy` cover both
 * databases.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import { LoadError } from '@/core/errors';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { SessionStore } from '@/persistence/SessionStore';
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

const BARE = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
} as const;

function session(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: 0,
    tableName: 'A',
    filters: [],
    sortColumns: [{ column: 'name', direction: 'desc' }],
    visibleColumns: ['id', 'name'],
    columnOrder: ['id', 'name'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function readRaw(dbName: string, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
    };
  });
}

function plantSession(value: unknown): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.open('dt-sessions', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('sessions', { keyPath: 'tableName' });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(value);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

function countPuts(): (store: string) => number {
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  return (store) =>
    put.mock.contexts.filter((ctx) => (ctx as IDBObjectStore).name === store).length;
}

const tables: DataTable[] = [];

async function mount(options: Parameters<typeof createDataTable>[0]): Promise<DataTable> {
  const table = await createDataTable(options);
  tables.push(table);
  return table;
}

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('annotations persistence — facade', () => {
  beforeEach(async () => {
    await deleteDatabase('dt-sessions');
    await deleteDatabase('dt-annotations');
  });

  afterEach(async () => {
    for (const table of tables.splice(0)) {
      if (!table.isDestroyed()) await table.destroy();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('warns when the saved annotations record cannot be attached, and restores the rest', async () => {
    await plantSession({ ...session(), __annotations: { format: 1, count: 2, owner: 'gone' } });
    const table = await mount({ container: container(), bridge: makeBridge(), ...BARE });
    const warning = vi.fn();
    table.on('warning', warning);

    await table.loadData(new File([''], 'a.csv'), { tableName: 'A' });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith({
      code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
      message: expect.stringContaining('"A"'),
      details: { tableName: 'A', reason: 'missing', count: 2 },
    });
    expect(table.state.sortColumns.get()).toEqual([{ column: 'name', direction: 'desc' }]);
    expect(table.annotations.count()).toBe(0);
  });

  it('warns, once, when the annotations record of a shared store cannot be attached', async () => {
    await plantSession({ ...session(), __annotations: { format: 1, count: 2, owner: 'gone' } });
    const onLoadIssue = vi.fn();
    const sessionStore = new SessionStore({ onLoadIssue });
    await sessionStore.open();
    const table = await mount({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore },
      ...BARE,
    });
    const warning = vi.fn();
    table.on('warning', warning);

    await table.loadData(new File([''], 'a.csv'), { tableName: 'A' });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith({
      code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
      message: expect.stringContaining('"A"'),
      details: { tableName: 'A', reason: 'missing', count: 2 },
    });
    // The app's own handler is told as well.
    expect(onLoadIssue).toHaveBeenCalledTimes(1);
    expect(table.state.sortColumns.get()).toEqual([{ column: 'name', direction: 'desc' }]);
    sessionStore.close();
  });

  it('warns when loadJSON refuses the saved annotations, and restores the rest', async () => {
    const snapshot = session({
      annotations: {
        version: 1,
        tableName: 'A',
        annotations: [{ id: 'x', scope: 'cell', rowId: 0, severity: 'fatal', message: 'm' }],
      } as unknown as SessionSnapshot['annotations'],
    });
    const store = {
      open: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(undefined),
      saveSync: vi.fn(),
      load: vi.fn().mockResolvedValue(snapshot),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    } as unknown as SessionStore;
    const table = await mount({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore: store },
      ...BARE,
    });
    const warning = vi.fn();
    table.on('warning', warning);

    await table.loadData(new File([''], 'a.csv'), { tableName: 'A' });

    expect(warning).toHaveBeenCalledWith({
      code: 'PERSISTENCE_ANNOTATIONS_DROPPED',
      message: expect.any(String),
      details: {
        tableName: 'A',
        reason: 'invalid',
        count: 1,
        errorCode: 'ANNOTATION_INVALID_SHAPE',
        errorMessage: expect.any(String),
      },
    });
    expect(table.state.sortColumns.get()).toEqual([{ column: 'name', direction: 'desc' }]);
  });

  it('puts the annotations back after a load turned away for its source options, without writing them again', async () => {
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const bridge = makeBridge();
    const table = await mount({
      container: container(),
      bridge,
      persistence: { sessionStore },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    table.annotations.addMany([
      { scope: 'row', rowId: 0, severity: 'error', message: 'kept' },
      { scope: 'cell', rowId: 1, column: 'name', severity: 'info', message: 'kept too' },
    ]);
    const puts = countPuts();
    vi.mocked(bridge.loadData).mockRejectedValueOnce(
      new LoadError('bad delimiter', { code: 'LOAD_INVALID_OPTIONS' }),
    );

    // The load flushes the pending save first: both records.
    await expect(table.loadData('a\n1\n', { tableName: 'A' })).rejects.toMatchObject({
      code: 'LOAD_INVALID_OPTIONS',
    });
    expect(puts('sessions')).toBe(1);
    expect(puts('annotations')).toBe(1);
    expect(table.annotations.count()).toBe(2);

    // A sort after the put-back saves the session record alone.
    table.actions.toggleSort('id');
    await table.destroy();
    expect(puts('sessions')).toBe(2);
    expect(puts('annotations')).toBe(1);
    const reader = new SessionStore();
    expect((await reader.load('A'))?.annotations?.annotations).toHaveLength(2);
    reader.close();
    sessionStore.close();
  });

  it('a reload restores the annotations and does not write them again', async () => {
    const first = new SessionStore();
    await first.open();
    const before = await mount({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore: first },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    before.annotations.addMany([
      { scope: 'row', rowId: 0, severity: 'error', message: 'one' },
      { scope: 'column', column: 'name', severity: 'warning', message: 'two' },
    ]);
    // destroy() flushes the pending save: both records.
    await before.destroy();
    first.close();

    // The next page: a session store of its own.
    const second = new SessionStore();
    await second.open();
    const puts = countPuts();
    const after = await mount({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore: second },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    expect(after.annotations.count()).toBe(2);
    after.actions.toggleSort('id');
    after.annotations.setSeverityFilter({ warning: false });
    await after.destroy();
    expect(puts('sessions')).toBe(1);
    expect(puts('annotations')).toBe(0);
    second.close();
  });

  it('clearSession deletes both records', async () => {
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const table = await mount({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    table.annotations.add({ scope: 'row', rowId: 0, severity: 'error', message: 'x' });
    // Written by the flush clearSession runs first, then deleted.
    await table.clearSession();
    expect(await readRaw('dt-sessions', 'sessions', 'A')).toBeUndefined();
    expect(await readRaw('dt-annotations', 'annotations', 'A')).toBeUndefined();
    sessionStore.close();
  });

  it('destroy closes both of its own connections', async () => {
    const close = vi.spyOn(IDBDatabase.prototype, 'close');
    const table = await mount({ container: container(), bridge: makeBridge(), ...BARE });
    await table.destroy();
    expect(close.mock.contexts.map((db) => (db as IDBDatabase).name).sort()).toEqual([
      'dt-annotations',
      'dt-sessions',
    ]);
  });
});
