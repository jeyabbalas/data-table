/**
 * @vitest-environment jsdom
 *
 * Loads that overlap, and the saves around them. What belongs to the data a
 * load replaces (its annotations, the table's own presets) goes in the
 * load's turn, just before its restore, so a load superseded while it ran
 * restores nothing into the table that replaces it; AutoSave runs again only
 * once no load or clear is in flight, so no save lands over a session being
 * read; and a load turned away for its source options keeps the annotations
 * without ever emptying the store.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import { LoadError } from '@/core/errors';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { SessionStore } from '@/persistence/SessionStore';
import { deleteDatabase, plant, rawSession, sessionSnapshot } from '../helpers/sessionDatabases';

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
    loadData: vi.fn(async (_source: unknown, options?: { tableName?: string }) => ({
      tableName: options?.tableName ?? 'A',
      rowCount: 0,
      schema,
    })),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    dropTable: vi.fn().mockResolvedValue(undefined),
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

const tables: DataTable[] = [];

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

async function mount(options: Parameters<typeof createDataTable>[0]): Promise<DataTable> {
  const table = await createDataTable(options);
  tables.push(table);
  return table;
}

/** Save a session for `tableName`, as a table of it shows it, on a page of its own. */
async function savedSession(
  tableName: string,
  edit: (table: DataTable) => void,
  options: Partial<Parameters<typeof createDataTable>[0]> = {},
): Promise<void> {
  const sessionStore = new SessionStore();
  await sessionStore.open();
  const table = await createDataTable({
    container: container(),
    bridge: makeBridge(),
    persistence: { sessionStore },
    source: new File([''], `${tableName}.csv`),
    tableName,
    ...BARE,
    ...options,
  });
  edit(table);
  // destroy() flushes the pending save.
  await table.destroy();
  sessionStore.close();
}

/**
 * Load A, held at the worker until B's load is asked for: A's load is
 * superseded by B's, and its turn runs first.
 */
async function loadAThenB(table: DataTable, bridge: WorkerBridge): Promise<void> {
  let releaseA!: () => void;
  const gate = new Promise<void>((resolve) => (releaseA = resolve));
  vi.mocked(bridge.loadData).mockImplementationOnce(async () => {
    await gate;
    return { tableName: 'A', rowCount: 0, schema };
  });
  const loadA = table.loadData(new File([''], 'a.csv'), { tableName: 'A' }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  const loadB = table.loadData(new File([''], 'b.csv'), { tableName: 'B' });
  releaseA();
  await loadA;
  await loadB;
}

beforeEach(async () => {
  await deleteDatabase('dt-sessions');
  await deleteDatabase('dt-annotations');
});

afterEach(async () => {
  for (const table of tables.splice(0)) if (!table.isDestroyed()) await table.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('a load superseded while it runs', () => {
  it('restores nothing into the table that replaces it, which saves none of it', async () => {
    await savedSession('A', (a) =>
      a.annotations.add({ id: 'from-A', scope: 'row', rowId: 0, severity: 'error', message: 'A' }),
    );
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const bridge = makeBridge();
    const table = await mount({
      container: container(),
      bridge,
      persistence: { sessionStore },
      ...BARE,
    });
    const load = vi.spyOn(sessionStore, 'load');

    // The user picks another file before A finishes loading. B has no saved session.
    await loadAThenB(table, bridge);
    expect(table.state.tableName.get()).toBe('B');
    expect(table.annotations.count()).toBe(0);
    // A's session was not even read.
    expect(load.mock.calls.map(([name]) => name)).toEqual(['B']);

    await table.destroy();
    const reader = new SessionStore();
    expect((await reader.load('B'))?.annotations).toBeUndefined();
    expect((await reader.load('A'))?.annotations?.annotations.map((a) => a.id)).toEqual(['from-A']);
    reader.close();
    sessionStore.close();
  });

  it('leaves the table’s own presets to the table that replaces it', async () => {
    await plant('dt-sessions', {
      ...sessionSnapshot({ tableName: 'A', columnOrder: ['id', 'name'] }),
      filterPresets: [{ id: 'p1', name: 'from A', filters: [], createdAt: 0, updatedAt: 0 }],
    });
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const bridge = makeBridge();
    const table = await mount({
      container: container(),
      bridge,
      persistence: { sessionStore },
      ...BARE,
      presets: true,
    });
    await loadAThenB(table, bridge);
    expect(table.state.tableName.get()).toBe('B');
    table.actions.toggleSort('id');
    await table.destroy();
    const reader = new SessionStore();
    const savedB = await reader.load('B');
    expect(savedB?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(savedB?.filterPresets).toBeUndefined();
    reader.close();
    sessionStore.close();
  });

  it('does not run AutoSave while the next load reads its session', async () => {
    await savedSession('B', (b) => {
      b.actions.toggleSort('id');
      b.annotations.add({ id: 'from-B', scope: 'row', rowId: 0, severity: 'error', message: 'B' });
    });
    const sessionStore = new SessionStore();
    await sessionStore.open();
    // Reading B's session takes a while, as a large annotations record does.
    const realLoad = sessionStore.load.bind(sessionStore);
    vi.spyOn(sessionStore, 'load').mockImplementation(async (name: string) => {
      if (name === 'B') await new Promise((resolve) => setTimeout(resolve, 1500));
      return realLoad(name);
    });
    const save = vi.spyOn(sessionStore, 'save');
    const bridge = makeBridge();
    const table = await mount({
      container: container(),
      bridge,
      persistence: { sessionStore },
      ...BARE,
    });
    await loadAThenB(table, bridge);
    expect(table.state.tableName.get()).toBe('B');
    expect(save).not.toHaveBeenCalled();
    expect(table.state.sortColumns.get()).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(table.annotations.getAll().map((a) => a.id)).toEqual(['from-B']);
    sessionStore.close();
  }, 10_000);

  it('saves nothing over the record the next load reads, which later saves keep naming', async () => {
    await savedSession('B', (b) =>
      b.annotations.add({ id: 'from-B', scope: 'row', rowId: 0, severity: 'error', message: 'B' }),
    );
    const sessionStore = new SessionStore();
    await sessionStore.open();
    // The chunks of a large record take a while to come back.
    const getAll = IDBObjectStore.prototype.getAll;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['getAll']>
    ) {
      const request = getAll.apply(this, args);
      if (this.name !== 'chunks') return request;
      let handler: ((ev: Event) => void) | null = null;
      request.addEventListener('success', (ev) => {
        setTimeout(() => handler?.(ev), 1500);
      });
      Object.defineProperty(request, 'onsuccess', {
        configurable: true,
        get: () => null,
        set: (fn) => {
          handler = fn;
        },
      });
      return request;
    });
    const bridge = makeBridge();
    const table = await mount({
      container: container(),
      bridge,
      persistence: { sessionStore },
      ...BARE,
    });
    await loadAThenB(table, bridge);
    vi.mocked(IDBObjectStore.prototype.getAll).mockRestore();
    expect(table.annotations.getAll().map((a) => a.id)).toEqual(['from-B']);

    // A later change saves the session; the annotations are those it read.
    table.actions.toggleSort('id');
    await table.destroy();
    sessionStore.close();

    const warnings: unknown[] = [];
    const reload = new SessionStore({ onLoadIssue: (issue) => warnings.push(issue) });
    const saved = await reload.load('B');
    expect(saved?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(saved?.annotations?.annotations.map((a) => a.id)).toEqual(['from-B']);
    expect(warnings).toEqual([]);
    reload.close();
  }, 10_000);
});

describe('the save a load or a clear finds pending', () => {
  it('is written by a load through the asynchronous save', async () => {
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
    const save = vi.spyOn(sessionStore, 'save');
    const saveSync = vi.spyOn(sessionStore, 'saveSync');
    table.annotations.add({
      id: 'pending',
      scope: 'row',
      rowId: 0,
      severity: 'error',
      message: 'm',
    });
    table.actions.toggleSort('id');

    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });
    expect(saveSync).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].tableName).toBe('A');
    await save.mock.results[0]!.value;
    const reader = new SessionStore();
    const savedA = await reader.load('A');
    expect(savedA?.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
    expect(savedA?.annotations?.annotations.map((a) => a.id)).toEqual(['pending']);
    reader.close();
    sessionStore.close();
  });

  it('keeps the annotations it was asked with, though the load empties the store before it writes them', async () => {
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
    // The table's saves wait for a slow one under way.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const realSave = sessionStore.save.bind(sessionStore);
    vi.spyOn(sessionStore, 'save').mockImplementation(async (snapshot) => {
      await held;
      return realSave(snapshot);
    });
    table.annotations.add({ id: 'kept', scope: 'row', rowId: 0, severity: 'error', message: 'm' });
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });
    expect(table.annotations.count()).toBe(0);
    release();
    await vi.waitFor(async () =>
      expect((await rawSession('A'))?.['__annotations']).toMatchObject({ count: 1 }),
    );
    const reader = new SessionStore();
    expect((await reader.load('A'))?.annotations?.annotations.map((a) => a.id)).toEqual(['kept']);
    reader.close();
    sessionStore.close();
  });

  it('is dropped by clearSession', async () => {
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
    const save = vi.spyOn(sessionStore, 'save');
    const saveSync = vi.spyOn(sessionStore, 'saveSync');
    table.annotations.add({ scope: 'row', rowId: 0, severity: 'error', message: 'm' });
    await table.clearSession();
    expect(save).not.toHaveBeenCalled();
    expect(saveSync).not.toHaveBeenCalled();
    expect(table.annotations.count()).toBe(0);
    expect(await rawSession('A')).toBeUndefined();
    sessionStore.close();
  });
});

describe('a load turned away for its source options, under the annotated filter', () => {
  it('never empties the store, so no sync reads it empty', async () => {
    const HELPER = '__dt_annot_data__';
    const log: string[] = [];
    const bridge = makeBridge();
    vi.mocked(bridge.query).mockImplementation(async (sql: string) => {
      log.push(sql);
      if (/^SELECT COUNT\(\*\) as cnt/.test(sql)) return [{ cnt: 1 }];
      return [];
    });
    vi.mocked(bridge.loadData).mockResolvedValue({ tableName: 'data', rowCount: 1000, schema });
    const table = await mount({
      container: container(),
      bridge,
      source: new File(['a\n1'], 'data.csv'),
      tableName: 'data',
      ...BARE,
      persistence: false,
    });
    table.annotations.add({ scope: 'row', rowId: 3, severity: 'error', message: 'row' });
    const shown = new Promise<void>((resolve) => {
      const off = table.on('filterChange', () => {
        off();
        resolve();
      });
    });
    table.actions.showAnnotatedRows();
    await shown;
    await table.container.whenBodyReady();
    log.length = 0;
    const counts: number[] = [];
    table.annotations.on('change', () => counts.push(table.annotations.count()));

    vi.mocked(bridge.loadData).mockRejectedValueOnce(
      new LoadError('bad delimiter', { code: 'LOAD_INVALID_OPTIONS' }),
    );
    await expect(table.loadData('a\n1\n', { tableName: 'data' })).rejects.toMatchObject({
      code: 'LOAD_INVALID_OPTIONS',
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(table.annotations.count()).toBe(1);
    expect(counts).toEqual([]);
    const syncs = log.filter((sql) => sql.startsWith(`CREATE OR REPLACE TEMP TABLE "${HELPER}"`));
    expect(syncs.length).toBeGreaterThan(0);
    // Every rebuild of the annotated rows has row 3 (`3 * 8 + 1`: an error).
    for (const sql of syncs) expect(sql).toContain("string_split('25'");
  });
});
