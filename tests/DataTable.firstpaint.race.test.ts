/**
 * @vitest-environment jsdom
 *
 * `await createDataTable({ source })` and `await table.loadData(source)` must
 * resolve only AFTER the surviving `TableBody`'s first SELECT lands. Before
 * the contract fix, the public promise resolved while the body's initial
 * unfiltered fetch was still queued at the worker — so an immediately-
 * following `addFilter` raced the unfiltered result and the user saw stale
 * rows. These tests pin that contract.
 *
 * Companion to `tests/DataTable.destroy.race.test.ts`; reuses the same
 * `deferred()` helper and mock-bridge shape.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import { DestroyedError } from '@/core/errors';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

// jsdom returns 0 for clientHeight (no layout engine), which short-circuits
// VirtualScroller.getVisibleRange to {start:0,end:0,offsetY:0} and the body
// skips its first SELECT entirely. That collapses the contract we're trying
// to test: with no fetch issued, whenBodyReady() resolves trivially and the
// "races first paint" assertion is meaningless. Patch clientHeight so a real
// visible range materializes — exactly what production browsers compute.
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
});

afterAll(() => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    // jsdom default — restore by deleting the override.
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
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

/**
 * Bridge mock pre-wired so `loadData` returns a populated schema and the
 * caller controls every `query` outcome via `mockResolvedValueOnce` /
 * `mockImplementation` on the returned reference.
 */
function makePopulatedBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({
      tableName: 'data',
      rowCount: 3,
      columns: ['a'],
      schema: [{ name: 'a', type: 'INTEGER', nullable: true, originalType: 'INTEGER' }],
    }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
}

const baseOpts = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
} as const;

/** Drain enough microtask turns that any chained awaits have settled. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('createDataTable awaits first body paint', () => {
  it('promise stays pending until bridge.query for the first row fetch resolves', async () => {
    const bridge = makePopulatedBridge();
    const queryDfd = deferred<Array<{ a: string }>>();
    (bridge.query as ReturnType<typeof vi.fn>).mockReset();
    (bridge.query as ReturnType<typeof vi.fn>).mockImplementation(() => queryDfd.promise);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    let state: 'pending' | 'resolved' | 'rejected' = 'pending';
    let table: DataTable | null = null;
    const tablePromise = createDataTable({
      container,
      source: file,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    }).then(
      (t) => {
        state = 'resolved';
        table = t;
        return t;
      },
      (e) => {
        state = 'rejected';
        throw e;
      },
    );

    await drainMicrotasks();
    expect(state).toBe('pending');
    expect(bridge.query).toHaveBeenCalled();

    queryDfd.resolve([
      { __rowid__: 0, a: 'sentinel-1' },
      { __rowid__: 1, a: 'sentinel-2' },
      { __rowid__: 2, a: 'sentinel-3' },
    ]);
    await tablePromise;
    expect(state).toBe('resolved');

    const cellText = Array.from(container.querySelectorAll('.dt-cell'))
      .map((c) => c.textContent ?? '')
      .join('|');
    expect(cellText).toContain('sentinel');

    await table!.destroy();
  });

  it('first body SELECT settles before the await resolves (rows in DOM)', async () => {
    const bridge = makePopulatedBridge();
    // Single query outcome; the contract guarantees the await won't resolve
    // until this lands.
    (bridge.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { __rowid__: 0, a: 'sentinel-A' },
      { __rowid__: 1, a: 'sentinel-B' },
      { __rowid__: 2, a: 'sentinel-C' },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    const table = await createDataTable({
      container,
      source: file,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    // Synchronously after the await, the DOM must contain rendered rows.
    // No microtask-drain, no setTimeout — that's the whole point of the
    // contract fix. Before this PR, this assertion failed.
    const cellText = Array.from(container.querySelectorAll('.dt-cell'))
      .map((c) => c.textContent ?? '')
      .join('|');
    expect(cellText).toContain('sentinel');

    await table.destroy();
  });
});

describe('table.loadData awaits first body paint', () => {
  it('destroy mid-paint rejects with DestroyedError instead of hanging', async () => {
    const bridge = makePopulatedBridge();
    const queryDfd = deferred<Array<{ a: string }>>();
    (bridge.query as ReturnType<typeof vi.fn>).mockImplementation(() => queryDfd.promise);

    const container = document.createElement('div');
    document.body.appendChild(container);

    // Construct without `source` so the constructor's `loadDataImpl` path
    // is not exercised — only the explicit `table.loadData(...)` below.
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });
    const loadPromise = table.loadData(file);
    await drainMicrotasks();

    // bridge.query is awaited inside `whenBodyReady`; loadPromise is pending.
    await table.destroy();

    // Resolving after destroy must not hang the load promise. The destroyed
    // check after `whenBodyReady()` rejects with DestroyedError; the seq-
    // guard inside fetchRows drops the late rows.
    queryDfd.resolve([{ a: 'late' }]);

    await expect(loadPromise).rejects.toBeInstanceOf(DestroyedError);
  });
});
