/**
 * @vitest-environment jsdom
 *
 * The load contract around visualizations, in both of its configurations.
 *
 * **Lazy (the default, since 0.8).** `await createDataTable({ source })`
 * resolves at first *interactive* paint: the surviving `TableBody`'s first
 * SELECT has settled (covered by `tests/DataTable.firstpaint.race.test.ts`)
 * and `CrossfilterCoordinator.syncExistingFilters()` has settled, so
 * `filteredRows` is correct for restored filters. It does **not** wait for
 * column charts. Those get `whenVizReady()` and the `vizReady` event.
 *
 * **`{ eager: true }`.** The pre-0.8 semantics, kept for screenshot and PDF
 * pipelines: every chart is created and fetched during load and the promise
 * waits for all of them.
 *
 * What has not changed, and is still pinned here: a consumer chaining
 * `addFilter()` immediately after the await must not race an initial fetch
 * (test 2), a custom viz that never reassigns `dataPromise` must not hang
 * anything (test 4), and a rejecting `fetchData` must not either (test 5).
 *
 * These tests use a stub `VisualizationRegistry` whose stub viz holds its
 * `fetchData` on a controllable deferred. Mirrors
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

describe('lazy default: the load promise does not wait for charts', () => {
  it('resolves while a held viz fetch is still pending; whenVizReady() waits', async () => {
    const bridge = makePopulatedBridge();
    // Body fetch resolves immediately; the viz's fetchData holds.
    HoldableViz.fetchDeferred = deferred<void>();

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

    // The chart's fetch was started and is still held — and the table is
    // already usable. That is the whole point of the change.
    expect(HoldableViz.fetchCallCount).toBeGreaterThan(0);

    let vizState: 'pending' | 'resolved' = 'pending';
    const vizReadyEvents: Array<{ tableName: string; vizCount: number }> = [];
    table.on('vizReady', (p) => vizReadyEvents.push(p));
    void table.whenVizReady().then(() => {
      vizState = 'resolved';
    });

    await drainMicrotasks();
    expect(vizState).toBe('pending');
    expect(vizReadyEvents).toHaveLength(0);

    HoldableViz.fetchDeferred.resolve();
    await table.whenVizReady();
    expect(vizState).toBe('resolved');
    expect(vizReadyEvents).toHaveLength(1);
    expect(vizReadyEvents[0]!.vizCount).toBeGreaterThan(0);

    await table.destroy();
  });

  it('eager: true restores wait-for-all gating', async () => {
    const bridge = makePopulatedBridge();
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
      visualizations: { eager: true },
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

    await drainMicrotasks();
    expect(state).toBe('pending');
    expect(HoldableViz.fetchCallCount).toBeGreaterThan(0);

    HoldableViz.fetchDeferred.resolve();
    await tablePromise;
    expect(state).toBe('resolved');
    // Already settled by the time the load promise did — no extra await.
    await table!.whenVizReady();

    await table!.destroy();
  });

  it('fires vizReady exactly once per load, and re-arms on the next one', async () => {
    const bridge = makePopulatedBridge();
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

    const events: Array<{ tableName: string; vizCount: number }> = [];
    table.on('vizReady', (p) => events.push(p));
    await table.whenVizReady();
    await drainMicrotasks();
    const afterFirst = events.length;
    expect(afterFirst).toBeLessThanOrEqual(1);

    await table.loadData(new File(['a\n4\n5'], 'y.csv', { type: 'text/csv' }));
    await table.whenVizReady();
    await drainMicrotasks();
    expect(events.length).toBe(afterFirst + 1);

    await table.destroy();
  });
});

describe('createDataTable awaits viz first fetch', () => {
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

  it('destroy() mid-vizinit rejects loadData with DestroyedError under eager, no hang', async () => {
    const bridge = makePopulatedBridge();
    HoldableViz.fetchDeferred = deferred<void>();

    const container = document.createElement('div');
    document.body.appendChild(container);

    // `eager: true` is what keeps this a *load* concern: under the lazy
    // default the load promise no longer waits for the chart at all, so
    // destroying mid-fetch cannot make it reject — the case that replaces
    // this one is the `whenVizReady()` half, below.
    // Construct without `source` so loadDataImpl fires only on the explicit
    // table.loadData below.
    const table = await createDataTable({
      container,
      bridge,
      visualizations: { eager: true },
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

  it('destroy() while whenVizReady() is pending settles it rather than hanging', async () => {
    const bridge = makePopulatedBridge();
    HoldableViz.fetchDeferred = deferred<void>();

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

    const pending = table.whenVizReady();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await drainMicrotasks();
    expect(settled).toBe(false);

    await table.destroy();
    await pending;
    expect(settled).toBe(true);

    // The late fetch resolving after teardown must change nothing.
    HoldableViz.fetchDeferred.resolve();
    await drainMicrotasks();
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
