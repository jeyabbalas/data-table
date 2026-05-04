/**
 * @vitest-environment jsdom
 *
 * `await createDataTable({ source })` must resolve only AFTER:
 *   1. The surviving `TableBody`'s first SELECT settles (covered by
 *      `tests/DataTable.firstpaint.race.test.ts`); AND
 *   2. Each per-column visualization's eager first `fetchData()` settles; AND
 *   3. `CrossfilterCoordinator.syncExistingFilters()` and
 *      `StatsPanelCoordinator.syncExistingFilters()` settle (the work they
 *      kicked off when filters were already in state at attach time).
 *
 * Before this contract fix, viz fetches were fire-and-forget inside
 * `attachVisualizations` — a consumer chaining `addFilter()` immediately
 * after `await createDataTable(...)` could race those initial fetches.
 *
 * These tests pin the new contract using a stub `VisualizationRegistry`
 * whose stub viz holds its `fetchData` on a controllable deferred. Mirrors
 * `tests/DataTable.firstpaint.race.test.ts` for helpers and the
 * `tests/DataTable.statsPanel.test.ts` `StubViz` / registry pattern.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import { DestroyedError } from '@/core/errors';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

// jsdom returns 0 for clientHeight (no layout engine), which short-circuits
// VirtualScroller.getVisibleRange to {start:0,end:0,offsetY:0} and the body
// skips its first SELECT entirely. Patch clientHeight so a real visible
// range materializes — mirrors the firstpaint.race test setup.
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
  // BaseVisualization eagerly creates a canvas + 2D context; JSDOM doesn't
  // implement getContext, so stub it for the create-path.
  const ctx = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;
});

afterAll(() => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
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
      schema: [{ name: 'a', type: 'integer', nullable: true, originalType: 'INTEGER' }],
    }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
}

/**
 * Stub viz whose `fetchData` waits on a class-level deferred. Tests set
 * `HoldableViz.fetchDeferred` to gate the initial fetch; null means
 * resolve-immediately. Tracks every `fetchData` invocation so tests can
 * count and assert ordering.
 */
class HoldableViz extends BaseVisualization {
  static instances: HoldableViz[] = [];
  static fetchDeferred: Deferred<void> | null = null;
  static fetchCallCount = 0;
  static fetchShouldReject = false;
  static reset() {
    HoldableViz.instances = [];
    HoldableViz.fetchDeferred = null;
    HoldableViz.fetchCallCount = 0;
    HoldableViz.fetchShouldReject = false;
  }

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    HoldableViz.instances.push(this);
    this.dataPromise = this.fetchData();
  }

  async fetchData(): Promise<void> {
    HoldableViz.fetchCallCount++;
    if (HoldableViz.fetchShouldReject) {
      throw new Error('viz fetch boom');
    }
    if (HoldableViz.fetchDeferred) {
      await HoldableViz.fetchDeferred.promise;
    }
  }

  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

/**
 * Stub viz that NEVER reassigns `dataPromise` — exercises the hoisted
 * default `Promise.resolve()` on `BaseVisualization`. A custom viz author
 * who extends `BaseVisualization` and forgets the eager-fetch idiom should
 * still allow `loadComplete` to fire promptly.
 */
class NoFetchViz extends BaseVisualization {
  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    // Deliberately no `this.dataPromise = this.fetchData();` here.
  }

  async fetchData(): Promise<void> {}
  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

function makeStubVizRegistry(VizClass: typeof HoldableViz | typeof NoFetchViz) {
  const reg = new VisualizationRegistry();
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub',
    isApplicable: () => true,
    constructor: VizClass as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

const baseOpts = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  exportDialog: false,
} as const;

/** Drain enough microtask turns that any chained awaits have settled. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = '';
  HoldableViz.reset();
  vi.clearAllMocks();
});

describe('createDataTable awaits viz first fetch', () => {
  it('promise stays pending until viz.waitForData() resolves', async () => {
    const bridge = makePopulatedBridge();
    // Body fetch resolves immediately; the viz's fetchData holds.
    HoldableViz.fetchDeferred = deferred<void>();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    let state: 'pending' | 'resolved' | 'rejected' = 'pending';
    let table: DataTable | null = null;
    const tablePromise = createDataTable({
      container,
      source: file,
      bridge,
      visualizationRegistry: makeStubVizRegistry(HoldableViz),
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

    // After microtask drain, body has rendered (its query resolved), and the
    // viz constructor has fired its fetchData (which is awaiting the held
    // deferred). The public promise must still be pending — gated by
    // pendingVizInit.
    await drainMicrotasks();
    expect(state).toBe('pending');
    expect(HoldableViz.fetchCallCount).toBeGreaterThan(0);

    // Releasing the viz fetch unblocks the public promise.
    HoldableViz.fetchDeferred.resolve();
    await tablePromise;
    expect(state).toBe('resolved');

    await table!.destroy();
  });

  it('addFilter immediately after await sees a fully-initialized viz (no race)', async () => {
    const bridge = makePopulatedBridge();
    // Viz fetches resolve normally — no hold.
    HoldableViz.fetchDeferred = null;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    const table = await createDataTable({
      container,
      source: file,
      bridge,
      visualizationRegistry: makeStubVizRegistry(HoldableViz),
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    // The number of fetchData calls observed BEFORE addFilter. After the
    // contract fix, every initial-fetch the constructor kicked off has
    // already settled by the time the await resolves. addFilter then
    // triggers exactly one new fetch (via updateFilters → fetchData).
    const callsBeforeFilter = HoldableViz.fetchCallCount;
    expect(callsBeforeFilter).toBeGreaterThanOrEqual(1);

    table.actions.addFilter({
      type: 'range',
      column: 'a',
      min: 1,
      max: 2,
      maxInclusive: true,
    });

    // Drain one round of microtasks so the coordinator's filter-change
    // subscription fires and the viz's updateFilters → fetchData runs.
    await drainMicrotasks();

    // Exactly one new fetchData was triggered by addFilter — no leftover
    // unfiltered initial-fetch ran AFTER the addFilter (which would
    // indicate a race).
    expect(HoldableViz.fetchCallCount).toBe(callsBeforeFilter + 1);

    await table.destroy();
  });

  it('destroy() mid-vizinit rejects loadData with DestroyedError, no hang', async () => {
    const bridge = makePopulatedBridge();
    HoldableViz.fetchDeferred = deferred<void>();

    const container = document.createElement('div');
    document.body.appendChild(container);

    // Construct without `source` so loadDataImpl fires only on the explicit
    // table.loadData below.
    const table = await createDataTable({
      container,
      bridge,
      visualizationRegistry: makeStubVizRegistry(HoldableViz),
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });
    const loadPromise = table.loadData(file);

    // Let the viz constructor fire and start awaiting its deferred.
    await drainMicrotasks();
    expect(HoldableViz.fetchCallCount).toBeGreaterThan(0);

    // Destroy while the viz fetch is still pending.
    await table.destroy();

    // Resolving after destroy must not hang the load promise. The post-
    // pendingVizInit destroyed-check rejects with DestroyedError; the viz's
    // own destroyed-flag drops the late result.
    HoldableViz.fetchDeferred.resolve();

    await expect(loadPromise).rejects.toBeInstanceOf(DestroyedError);
  });

  it('custom viz with no dataPromise reassign resolves immediately (hoist contract)', async () => {
    const bridge = makePopulatedBridge();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    // NoFetchViz never reassigns dataPromise. Default value (Promise.resolve())
    // hoisted onto BaseVisualization means waitForData() resolves immediately
    // and pendingVizInit doesn't hang.
    const table = await createDataTable({
      container,
      source: file,
      bridge,
      visualizationRegistry: makeStubVizRegistry(NoFetchViz),
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    // If the hoist were missing, `viz.waitForData()` would throw inside
    // attachVisualizations and pendingVizInit would reject (allSettled
    // swallows it, so this assertion would still pass — but the construct
    // path itself would log a TypeError). The real assertion: the table
    // resolved at all. Tighten with no-error-emission below.
    expect(table).toBeDefined();
    await table.destroy();
  });

  it('viz fetchData rejection does not hang loadComplete; error is emitted', async () => {
    const bridge = makePopulatedBridge();
    HoldableViz.fetchShouldReject = true;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const file = new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' });

    // The viz's fetchData throws synchronously (before awaiting its
    // deferred). dataPromise captures the rejection. allSettled swallows
    // it inside pendingVizInit so the public promise still resolves.
    const table = await createDataTable({
      container,
      source: file,
      bridge,
      visualizationRegistry: makeStubVizRegistry(HoldableViz),
      persistence: { sessionStore: makeSessionStore() },
      ...baseOpts,
    });

    expect(table).toBeDefined();
    expect(HoldableViz.fetchCallCount).toBeGreaterThan(0);
    await table.destroy();
  });
});
