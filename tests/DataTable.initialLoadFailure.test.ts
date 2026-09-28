/**
 * @vitest-environment jsdom
 *
 * `createDataTable({ source })` mounts the table, and creates a worker and a
 * session store unless it is given them, before it loads `source`. When that
 * load fails the caller never gets the table, so nothing else can destroy it:
 * it tears itself down as `destroy()` would, then rejects with the load's
 * error, and the container is left ready for another table.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

import { createDataTable } from '@/index';
import { EventEmitter } from '@/core/EventEmitter';
import { LoadError } from '@/core/errors';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { SessionStore } from '@/persistence/SessionStore';

import { createMockWorker } from './helpers/mockWorker';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Multi-line, so the loader takes it as inline CSV. */
const CSV = 'a\n1\n2\n3';

const LOADED = {
  tableName: 'dt_loaded',
  rowCount: 3,
  columns: ['a'],
  schema: [{ name: 'a', type: 'INTEGER', nullable: true, originalType: 'INTEGER' }],
};

const baseOpts = {
  persistence: false,
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
} as const;

/** A bridge the host owns, as `createDataTable({ bridge })` takes one. */
function makeBridge(load: () => Promise<unknown>): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn(load),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
}

function makeSessionStore(overrides: Partial<Record<keyof SessionStore, unknown>> = {}) {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
    ...overrides,
  } as unknown as SessionStore;
}

/** A mock worker whose every load fails, as a bad file makes DuckDB's do. */
function makeFailingWorker() {
  return createMockWorker({
    onMessage: (msg) =>
      msg.type === 'load'
        ? {
            id: msg.id,
            type: 'error',
            payload: { message: 'bad file', code: 'LOAD_PARSE_FAILED' },
          }
        : undefined,
  });
}

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('createDataTable — a failed initial load cleans up', () => {
  it('removes what it mounted and rejects with the load error', async () => {
    const container = mount();
    const error = new LoadError('bad file', { code: 'LOAD_PARSE_FAILED' });
    const bridge = makeBridge(() => Promise.reject(error));

    await expect(createDataTable({ container, bridge, source: CSV, ...baseOpts })).rejects.toBe(
      error,
    );

    expect(container.querySelector('.dt-root')).toBeNull();
    expect(container.childElementCount).toBe(0);
    // Nothing left in the portal either: the container is all the page holds.
    expect(document.body.children.length).toBe(1);
  });

  it('terminates a worker it created', async () => {
    const container = mount();
    const worker = makeFailingWorker();
    const terminate = vi.spyOn(worker.worker, 'terminate');

    await expect(
      createDataTable({
        container,
        source: CSV,
        bridgeOptions: { workerFactory: () => worker.worker },
        ...baseOpts,
      }),
    ).rejects.toMatchObject({ name: 'LoadError', code: 'LOAD_PARSE_FAILED' });

    expect(terminate).toHaveBeenCalledTimes(1);
    expect(container.childElementCount).toBe(0);
  });

  it('leaves a bridge and a session store it was given open', async () => {
    const container = mount();
    const bridge = makeBridge(() => Promise.reject(new LoadError('bad file')));
    const sessionStore = makeSessionStore();

    await expect(
      createDataTable({
        container,
        bridge,
        source: CSV,
        ...baseOpts,
        persistence: { sessionStore },
      }),
    ).rejects.toThrow('bad file');

    expect(container.childElementCount).toBe(0);
    expect(bridge.terminate).not.toHaveBeenCalled();
    expect(sessionStore.close).not.toHaveBeenCalled();
  });

  it('closes a session store it opened', async () => {
    const container = mount();
    const close = vi.spyOn(SessionStore.prototype, 'close');
    const bridge = makeBridge(() => Promise.reject(new LoadError('bad file')));

    await expect(
      createDataTable({ container, bridge, source: CSV, ...baseOpts, persistence: true }),
    ).rejects.toThrow('bad file');

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('cleans up after a failed session restore, dropping the table it loaded', async () => {
    const container = mount();
    const bridge = makeBridge(() => Promise.resolve(LOADED));
    const sessionStore = makeSessionStore({
      load: vi.fn().mockRejectedValue(new Error('IndexedDB read failed')),
    });

    await expect(
      createDataTable({
        container,
        bridge,
        source: CSV,
        ...baseOpts,
        persistence: { sessionStore },
      }),
    ).rejects.toThrow('IndexedDB read failed');

    expect(container.childElementCount).toBe(0);
    // The load built a table in the host's worker; nothing refers to it now.
    expect(bridge.dropTable).toHaveBeenCalledWith('dt_loaded');
    expect(bridge.terminate).not.toHaveBeenCalled();
    // The saved session is left as it was, for a retry to restore.
    expect(sessionStore.save).not.toHaveBeenCalled();
    expect(sessionStore.saveSync).not.toHaveBeenCalled();
    expect(sessionStore.delete).not.toHaveBeenCalled();
  });

  it('leaves the saved session unwritten when a restore fails after its undo stacks', async () => {
    const container = mount();
    const bridge = makeBridge(() => Promise.resolve(LOADED));
    const entry = {
      filters: [],
      sortColumns: [],
      visibleColumns: ['a'],
      columnOrder: ['a'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
    };
    const sessionStore = makeSessionStore({
      load: vi.fn().mockResolvedValue({
        version: 5,
        tableName: 'dt_loaded',
        timestamp: Date.now(),
        ...entry,
        undoStack: [entry],
        redoStack: [],
        // Not an array: the restore throws here, after it has loaded the
        // undo stacks, which AutoSave saves as soon as it is enabled.
        filterPresets: 'broken',
      }),
    });

    await expect(
      createDataTable({
        container,
        bridge,
        source: CSV,
        ...baseOpts,
        persistence: { sessionStore },
        presets: true,
        undoRedo: true,
      }),
    ).rejects.toMatchObject({ name: 'LoadError' });
    // Past AutoSave's 1 s debounce, so a save it scheduled would have run.
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    expect(container.childElementCount).toBe(0);
    expect(sessionStore.saveSync).not.toHaveBeenCalled();
    expect(sessionStore.save).not.toHaveBeenCalled();
  });

  it('emits loadError and error before it tears down', async () => {
    const container = mount();
    const emitted: string[] = [];
    const emit = EventEmitter.prototype.emit;
    vi.spyOn(EventEmitter.prototype, 'emit').mockImplementation(function (
      this: EventEmitter<Record<string, unknown>>,
      event: string,
      payload: unknown,
    ) {
      emitted.push(event);
      return emit.call(this, event, payload);
    } as typeof emit);
    const bridge = makeBridge(() => Promise.reject(new LoadError('bad file')));

    await expect(createDataTable({ container, bridge, source: CSV, ...baseOpts })).rejects.toThrow(
      'bad file',
    );

    expect(emitted.filter((e) => e.startsWith('load') || e === 'error' || e === 'destroy')).toEqual(
      ['loadStart', 'loadError', 'error', 'destroy'],
    );
  });

  it('rejects with the load error when the teardown throws too', async () => {
    const container = mount();
    const worker = makeFailingWorker();
    vi.spyOn(worker.worker, 'terminate').mockImplementation(() => {
      throw new Error('terminate failed');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      createDataTable({
        container,
        source: CSV,
        bridgeOptions: { workerFactory: () => worker.worker },
        ...baseOpts,
      }),
    ).rejects.toMatchObject({ name: 'LoadError', code: 'LOAD_PARSE_FAILED' });
    expect(container.childElementCount).toBe(0);
  });
});

describe('createDataTable — the container after a failed initial load', () => {
  it('takes a new table', async () => {
    const container = mount();
    const failing = makeBridge(() => Promise.reject(new LoadError('bad file')));
    await expect(
      createDataTable({ container, bridge: failing, source: CSV, ...baseOpts }),
    ).rejects.toThrow('bad file');

    const table = await createDataTable({
      container,
      bridge: makeBridge(() => Promise.resolve(LOADED)),
      source: CSV,
      ...baseOpts,
    });

    expect(container.querySelectorAll('.dt-root')).toHaveLength(1);
    expect(table.state.totalRows.get()).toBe(3);
    await table.destroy();
    expect(container.childElementCount).toBe(0);
  });

  it('keeps the other table when two mount at once and one fails (React Strict Mode)', async () => {
    const container = mount();
    let failFirst!: (error: unknown) => void;
    const first = createDataTable({
      container,
      bridge: makeBridge(
        () =>
          new Promise((_, reject) => {
            failFirst = reject;
          }),
      ),
      source: CSV,
      ...baseOpts,
    });
    const second = await createDataTable({
      container,
      bridge: makeBridge(() => Promise.resolve(LOADED)),
      source: CSV,
      ...baseOpts,
    });
    // The first effect's load was still running while the second mounted.
    await vi.waitFor(() => expect(failFirst).toBeTypeOf('function'));
    expect(container.querySelectorAll('.dt-root')).toHaveLength(2);

    failFirst(new LoadError('bad file'));
    await expect(first).rejects.toThrow('bad file');

    const roots = container.querySelectorAll('.dt-root');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBe(second.container.getElement());
    await second.destroy();
  });
});

describe('createDataTable — a successful initial load', () => {
  it('still turns AutoSave back on', async () => {
    const container = mount();
    const sessionStore = makeSessionStore();
    const table = await createDataTable({
      container,
      bridge: makeBridge(() => Promise.resolve(LOADED)),
      source: CSV,
      ...baseOpts,
      persistence: { sessionStore },
    });

    table.actions.addFilter({ type: 'not-null', column: 'a' });
    // Past AutoSave's 1 s debounce.
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    expect(sessionStore.save).toHaveBeenCalled();
    await table.destroy();
  });
});
