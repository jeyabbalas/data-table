/**
 * @vitest-environment jsdom
 *
 * `VizDataController` — the per-column state machine that decides *when* a
 * column gets a visualization instance and *when* its data is refetched.
 *
 * Driven by a `FakeIntersectionObserver` so visibility is scripted rather
 * than laid out: jsdom has no `IntersectionObserver` and no layout engine, so
 * the real one could not be exercised here at all. The geometry the fake
 * feeds in mirrors what Chromium reports — `rootBounds` already expanded by
 * `rootMargin`, `boundingClientRect` in the same coordinate space — which is
 * what makes the create/keep hysteresis assertions meaningful.
 *
 * The visualization stubs are structural rather than `BaseVisualization`
 * subclasses: the controller only ever calls `waitForData`, `updateFilters`,
 * `exportDataSnapshot` and `destroy`, and a real subclass would drag in a
 * canvas + 2D context stub that proves nothing about scheduling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ColumnSchema, Filter } from '@/core/types';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';
import type { FilterFanOutRequest } from '@/visualizations/CrossfilterCoordinator';
import {
  VizDataController,
  VIZ_CREATE_MARGIN_PX,
  VIZ_KEEP_MARGIN_PX,
  type VizControllerHost,
} from '@/visualizations/VizDataController';

// =========================================
// Fakes
// =========================================

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Where a target sits relative to the root, in the observer's terms. */
type Band = 'create' | 'hysteresis' | 'outside';

/**
 * Root box as Chromium would report it: already widened by `rootMargin`, so
 * `[0, 1000]` here corresponds to an unexpanded root of
 * `[KEEP, 1000 - KEEP]`.
 */
const ROOT_BOUNDS = {
  left: 0,
  right: 1000,
  top: 0,
  bottom: 100,
  width: 1000,
  height: 100,
  x: 0,
  y: 0,
};
const SHRINK = VIZ_KEEP_MARGIN_PX - VIZ_CREATE_MARGIN_PX;

function rectForBand(band: Band): DOMRectReadOnly {
  // create: comfortably inside [SHRINK, 1000 - SHRINK]
  // hysteresis: intersecting the expanded root but outside the create box
  // outside: reported as not intersecting at all
  const [left, right] =
    band === 'create'
      ? [SHRINK + 50, SHRINK + 150]
      : band === 'hysteresis'
        ? [1000 - SHRINK + 10, 1000 - SHRINK + 110]
        : [5000, 5100];
  return {
    left,
    right,
    top: 0,
    bottom: 60,
    width: right - left,
    height: 60,
    x: left,
    y: 0,
  } as DOMRectReadOnly;
}

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[] = [0];
  observed = new Set<Element>();
  disconnectCount = 0;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    init: IntersectionObserverInit,
  ) {
    this.root = (init.root as Element | null) ?? null;
    this.rootMargin = init.rootMargin ?? '0px';
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }
  unobserve(target: Element): void {
    this.observed.delete(target);
  }
  disconnect(): void {
    this.observed.clear();
    this.disconnectCount++;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Deliver one callback for the named columns, as the real observer would. */
  emit(bands: Record<string, Band>): void {
    const entries: IntersectionObserverEntry[] = [];
    for (const [name, band] of Object.entries(bands)) {
      const target = document.querySelector(`[data-column="${name}"] .dt-col-viz`);
      if (!target) throw new Error(`no target for ${name}`);
      entries.push({
        target,
        isIntersecting: band !== 'outside',
        intersectionRatio: band === 'outside' ? 0 : 1,
        boundingClientRect: rectForBand(band),
        intersectionRect: rectForBand(band),
        rootBounds: ROOT_BOUNDS as DOMRectReadOnly,
        time: 0,
      } as IntersectionObserverEntry);
    }
    this.callback(entries, this as unknown as IntersectionObserver);
  }

  /** Every observed target, all non-intersecting — the empty initial wave. */
  emitAllOutside(): void {
    const bands: Record<string, Band> = {};
    for (const target of this.observed) {
      const name = target.closest('[data-column]')?.getAttribute('data-column');
      if (name) bands[name] = 'outside';
    }
    this.emit(bands);
  }
}

/** Structural stand-in for a built-in visualization. */
class StubViz {
  static created: StubViz[] = [];
  static fetchGate: Deferred<void> | null = null;
  fetchCount = 0;
  updateCount = 0;
  destroyed = false;
  seeded: unknown = null;
  private readonly initial: Promise<void>;

  constructor(
    readonly columnName: string,
    seed: unknown | null,
  ) {
    StubViz.created.push(this);
    this.seeded = seed;
    if (seed !== null) {
      this.initial = Promise.resolve();
    } else {
      this.fetchCount++;
      this.initial = StubViz.fetchGate ? StubViz.fetchGate.promise : Promise.resolve();
    }
  }

  waitForData(): Promise<void> {
    return this.initial;
  }
  async updateFilters(_filters: Filter[]): Promise<void> {
    this.updateCount++;
    if (StubViz.fetchGate) await StubViz.fetchGate.promise;
  }
  exportDataSnapshot(): unknown {
    return { of: this.columnName };
  }
  destroy(): void {
    this.destroyed = true;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }

  static reset(): void {
    StubViz.created = [];
    StubViz.fetchGate = null;
  }
}

function column(name: string, type: ColumnSchema['type'] = 'integer'): ColumnSchema {
  return { name, type, nullable: false, originalType: 'INTEGER' };
}

/**
 * Build the header DOM the controller queries against.
 *
 * `.dt-header-scroll` is created once by `TableContainer` and survives every
 * `render()`; what `render()` wipes is the header **row** inside it
 * (`headerRow.innerHTML = ''`). {@link Harness.rebuildHeaders} models exactly
 * that — a fresh scroll container per render would be a different (and
 * wrong) test, because the observer roots at the container.
 */
function mountHeaders(names: string[], into?: HTMLElement): HTMLElement {
  const root = into ?? document.createElement('div');
  root.className = 'dt-header-scroll';
  root.innerHTML = '';
  for (const name of names) {
    const header = document.createElement('div');
    header.className = 'dt-col-header';
    header.setAttribute('data-column', name);
    const viz = document.createElement('div');
    viz.className = 'dt-col-viz';
    header.appendChild(viz);
    root.appendChild(header);
  }
  if (!into) document.body.appendChild(root);
  return root;
}

interface Harness {
  controller: VizDataController;
  host: VizControllerHost;
  root: HTMLElement;
  filters: Filter[];
  errors: Array<{ error: unknown; column: string }>;
  waves: Array<{ count: number; generation: number }>;
  io(): FakeIntersectionObserver;
  /** Rebuild the header DOM, as `TableContainer.render()` does. */
  rebuildHeaders(names: string[]): void;
}

function makeHarness(
  names: string[],
  opts: { useIO?: boolean; concurrency?: number } = {},
): Harness {
  const useIO = opts.useIO !== false;
  const root = mountHeaders(names);
  const filters: Filter[] = [];
  const errors: Array<{ error: unknown; column: string }> = [];
  const waves: Array<{ count: number; generation: number }> = [];

  const host: VizControllerHost = {
    createViz: (col, _container, seed) =>
      new StubViz(col.name, seed) as unknown as BaseVisualization,
    getVizContainer: (name) =>
      root.querySelector<HTMLElement>(`[data-column="${name}"] .dt-col-viz`),
    getFilters: () => filters,
    onError: (error, column) => errors.push({ error, column }),
  };

  const controller = new VizDataController({
    host,
    getRoot: () => root,
    concurrency: opts.concurrency ?? 4,
    intersectionObserverFactory: useIO
      ? (cb, init) => new FakeIntersectionObserver(cb, init) as unknown as IntersectionObserver
      : undefined,
    onWaveSettled: (count, generation) => waves.push({ count, generation }),
  });

  return {
    controller,
    host,
    get root() {
      return root;
    },
    filters,
    errors,
    waves,
    io: () => FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1]!,
    rebuildHeaders(next: string[]) {
      mountHeaders(next, root);
    },
  };
}

/** Drain enough microtask turns that chained awaits have settled. */
async function drain(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '';
  FakeIntersectionObserver.instances = [];
  StubViz.reset();
  vi.clearAllMocks();
});

// =========================================
// Tests
// =========================================

describe('fallback mode (no IntersectionObserver)', () => {
  it('creates every instance synchronously inside sync()', async () => {
    const h = makeHarness(['a', 'b', 'c'], { useIO: false });
    h.controller.sync([column('a'), column('b'), column('c')], 1);

    // Synchronously — no microtask, no task. `DataTable.colStats.router.test.ts`
    // reads the newest instance after exactly two microtask turns.
    expect(StubViz.created).toHaveLength(3);
    expect(h.controller.liveVizCount()).toBe(3);

    await expect(h.controller.whenWaveSettled()).resolves.toBe(3);
    await drain();
    expect(h.waves).toEqual([{ count: 3, generation: 1 }]);
  });

  it('reports every column as having a live viz', () => {
    const h = makeHarness(['a'], { useIO: false });
    h.controller.sync([column('a')], 1);
    expect(h.controller.hasLiveViz('a')).toBe(true);
    expect(h.controller.hasLiveViz('missing')).toBe(false);
  });
});

describe('IntersectionObserver-gated creation', () => {
  it('creates nothing until the observer reports', () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    expect(StubViz.created).toHaveLength(0);
    expect(h.io().observed.size).toBe(2);
  });

  it('creates only the columns inside the create band', async () => {
    const h = makeHarness(['a', 'b', 'c']);
    h.controller.sync([column('a'), column('b'), column('c')], 1);
    h.io().emit({ a: 'create', b: 'create', c: 'outside' });
    await drain();

    expect(StubViz.created.map((v) => v.columnName).sort()).toEqual(['a', 'b']);
    expect(h.controller.getEntry('c')?.viz).toBeNull();
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
  });

  it('an empty initial wave settles with vizCount 0 rather than hanging', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 7);
    h.io().emitAllOutside();

    await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
    expect(h.waves).toEqual([{ count: 0, generation: 7 }]);
  });

  it('does not create in the hysteresis band, but keeps an instance already there', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);

    h.io().emit({ a: 'hysteresis' });
    await drain();
    expect(StubViz.created).toHaveLength(0);

    h.io().emit({ a: 'create' });
    await drain();
    expect(StubViz.created).toHaveLength(1);

    // Drifting back out to the hysteresis band must not reclaim the canvas.
    h.io().emit({ a: 'hysteresis' });
    await drain();
    expect(StubViz.created[0]!.destroyed).toBe(false);
    expect(h.controller.hasLiveViz('a')).toBe(true);

    // Past the keep margin it goes.
    h.io().emit({ a: 'outside' });
    await drain();
    expect(StubViz.created[0]!.destroyed).toBe(true);
    expect(h.controller.hasLiveViz('a')).toBe(false);
  });

  it('bounds fetches in flight at the configured concurrency', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const h = makeHarness(names, { concurrency: 4 });
    StubViz.fetchGate = deferred<void>();
    h.controller.sync(
      names.map((n) => column(n)),
      1,
    );
    h.io().emit(Object.fromEntries(names.map((n) => [n, 'create' as Band])));
    await drain();

    expect(StubViz.created).toHaveLength(4);

    StubViz.fetchGate.resolve();
    StubViz.fetchGate = null;
    await drain();
    expect(StubViz.created).toHaveLength(10);
    await expect(h.controller.whenWaveSettled()).resolves.toBe(10);
  });
});

describe('snapshots', () => {
  it('captures on destroy and seeds on re-entry, issuing no fetch', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();
    expect(StubViz.created[0]!.fetchCount).toBe(1);

    h.io().emit({ a: 'outside' });
    await drain();
    expect(h.controller.getEntry('a')?.snapshot).toEqual({ of: 'a' });

    h.io().emit({ a: 'create' });
    await drain();
    expect(StubViz.created).toHaveLength(2);
    expect(StubViz.created[1]!.seeded).toEqual({ of: 'a' });
    expect(StubViz.created[1]!.fetchCount).toBe(0);
  });

  it('re-creates previously-visible columns synchronously on a header rebuild', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    h.io().emit({ a: 'create', b: 'outside' });
    await drain();
    expect(StubViz.created).toHaveLength(1);

    // `TableContainer.render()` wipes the header row on every visibleColumns
    // write. The instance cannot survive; the data must, and the replacement
    // must exist before the next paint or the chart visibly blinks.
    h.rebuildHeaders(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 2);

    expect(StubViz.created).toHaveLength(2);
    expect(StubViz.created[1]!.columnName).toBe('a');
    expect(StubViz.created[1]!.seeded).toEqual({ of: 'a' });
    expect(StubViz.created[1]!.fetchCount).toBe(0);
    expect(StubViz.created[0]!.destroyed).toBe(true);
  });

  it('drops the snapshot when a column keeps its name but changes type', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a', 'integer')], 1);
    h.io().emit({ a: 'create' });
    await drain();

    h.rebuildHeaders(['a']);
    h.controller.sync([column('a', 'string')], 2);
    // Same name, different chart: the old snapshot describes bins that no
    // longer mean anything, so the replacement must fetch rather than seed.
    expect(h.controller.getEntry('a')?.snapshot).toBeNull();
    const latest = StubViz.created[StubViz.created.length - 1]!;
    expect(latest.seeded).toBeNull();
    expect(latest.fetchCount).toBe(1);
  });

  it('keeps live instances when the header DOM did not change', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();
    const first = StubViz.created[0]!;

    // The derived-column VIEW switch: `state.tableName` changes but
    // `TableContainer.render()` never runs, so the canvas is still mounted.
    // The controller detects that from container identity — no caller flag.
    h.controller.sync([column('a')], 2);
    expect(first.destroyed).toBe(false);
    expect(StubViz.created).toHaveLength(1);
  });

  it('refetches a surviving instance whose data invalidateAll marked stale', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();

    // The facade's derived-VIEW path: drop the snapshots (they describe the
    // old relation), then re-sync. The instance survives; its data must not.
    h.controller.invalidateAll();
    h.controller.sync([column('a')], 2);
    await drain();

    expect(StubViz.created).toHaveLength(1);
    expect(StubViz.created[0]!.updateCount).toBeGreaterThanOrEqual(1);
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
  });

  it('destroys and forgets a column that disappears from the schema', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    h.io().emit({ a: 'create', b: 'create' });
    await drain();

    h.rebuildHeaders(['a']);
    h.controller.sync([column('a')], 2);
    expect(h.controller.getColumnNames()).toEqual(['a']);
    expect(StubViz.created.find((v) => v.columnName === 'b')!.destroyed).toBe(true);
  });
});

describe('filter staleness', () => {
  function request(columns: string[], refresh: (c: string) => Promise<void>): FilterFanOutRequest {
    return { filters: [], sequence: 1, columns, refresh };
  }

  it('refreshes live columns and marks offscreen ones stale without a query', async () => {
    const h = makeHarness(['a', 'b', 'c']);
    h.controller.sync([column('a'), column('b'), column('c')], 1);
    h.io().emit({ a: 'create', b: 'outside', c: 'create' });
    await drain();

    const refreshed: string[] = [];
    await h.controller.refreshOnFilters(
      request(['a', 'c'], async (name) => {
        refreshed.push(name);
      }),
    );

    expect(refreshed.sort()).toEqual(['a', 'c']);
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
    expect(h.controller.getEntry('b')?.status).toBe('empty');
    expect(h.controller.getEntry('c')?.status).toBe('fresh');
  });

  it('marks a previously-fetched offscreen column stale, and refetches it on scroll-in', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();
    h.io().emit({ a: 'outside' });
    await drain();
    expect(h.controller.getEntry('a')?.status).toBe('fresh');

    await h.controller.refreshOnFilters(request([], async () => {}));
    expect(h.controller.getEntry('a')?.status).toBe('stale');

    // Scrolling it back in must NOT reuse the snapshot — it describes a
    // filter context the user has since changed. A plain fetch comes up
    // correct in one step instead of painting a chart that is wrong.
    h.io().emit({ a: 'create' });
    await drain();
    const latest = StubViz.created[StubViz.created.length - 1]!;
    expect(latest.seeded).toBeNull();
    expect(latest.fetchCount).toBe(1);
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
  });

  it('defers offscreen stats panels and refreshes them on scroll-in', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    h.io().emit({ a: 'create', b: 'outside' });
    await drain();

    const refreshed: string[] = [];
    await h.controller.panelScheduler.refreshOnFilters(
      request(['a', 'b', 'no-viz'], async (name) => {
        refreshed.push(name);
      }),
    );
    // 'a' is on screen; 'no-viz' has no visibility signal of its own so it
    // always refreshes; 'b' waits.
    expect(refreshed.sort()).toEqual(['a', 'no-viz']);

    h.io().emit({ b: 'create' });
    await drain();
    expect(refreshed).toContain('b');
  });

  it('the panel scheduler does not disturb the viz filter epoch', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();

    // Two coordinators broadcast per user-visible filter change. If both went
    // through the same entry point the epoch would advance twice and the
    // first cycle's own fetches would be discarded as stale.
    await h.controller.refreshOnFilters(request(['a'], async () => {}));
    await h.controller.panelScheduler.refreshOnFilters(request(['a'], async () => {}));
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
  });

  it('refreshes coordinator registrations the controller does not track', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'outside' });
    await drain();

    const refreshed: string[] = [];
    await h.controller.refreshOnFilters(
      request(['a', 'panel-only'], async (name) => {
        refreshed.push(name);
      }),
    );
    expect(refreshed).toEqual(['panel-only']);
  });

  it('discards a fetch overtaken by a newer filter cycle', async () => {
    const h = makeHarness(['a']);
    StubViz.fetchGate = deferred<void>();
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();
    expect(h.controller.getEntry('a')?.status).toBe('fetching');

    // A filter cycle lands while the initial fetch is still in flight.
    void h.controller.refreshOnFilters(request([], async () => {}));
    await drain();

    StubViz.fetchGate.resolve();
    StubViz.fetchGate = null;
    await drain();

    // The in-flight result describes the pre-filter world: keep it on screen,
    // but do not claim it is current.
    expect(h.controller.getEntry('a')?.status).toBe('stale');
  });

  it('invalidateAll retires the snapshots and marks stale without querying', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    h.io().emit({ a: 'create', b: 'outside' });
    await drain();

    h.controller.invalidateAll();
    await drain();

    expect(h.controller.getEntry('a')?.status).toBe('stale');
    expect(h.controller.getEntry('b')?.status).toBe('empty');
    expect(h.controller.getEntry('a')?.snapshot).toBeNull();
    // No refetch. Its one caller syncs immediately afterwards, and a query
    // issued here would run against the relation the instance was
    // *constructed* with — `updateFilters` replaces `options.filters`, never
    // `options.tableName` — then land on an instance `sync()` destroys.
    expect(StubViz.created[0]!.updateCount).toBe(0);
  });

  it('the sync after invalidateAll re-creates without the retired snapshot', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();

    h.controller.invalidateAll();
    h.rebuildHeaders(['a']);
    StubViz.created = [];
    h.controller.sync([column('a')], 2);
    h.io().emit({ a: 'create' });
    await drain();

    // A plain fetch against the new relation, correct in one step.
    const rebuilt = StubViz.created[0]!;
    expect(rebuilt.seeded).toBeNull();
    expect(rebuilt.fetchCount).toBe(1);
    expect(h.controller.getEntry('a')?.status).toBe('fresh');
  });
});

describe('observer hygiene', () => {
  it('disconnects before re-observing so detached headers are not retained', () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    const io = h.io();
    const firstTargets = [...io.observed];

    h.rebuildHeaders(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 2);

    expect(io.disconnectCount).toBeGreaterThanOrEqual(1);
    expect(io.observed.size).toBe(2);
    for (const target of io.observed) expect(firstTargets).not.toContain(target);
  });

  it('constructs exactly one observer for the table', () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.controller.sync([column('a')], 2);
    h.controller.sync([column('a')], 3);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  it('roots the observer at the header scroll container with the keep margin', () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    expect(h.io().root).toBe(h.root);
    expect(h.io().rootMargin).toBe(`0px ${VIZ_KEEP_MARGIN_PX}px`);
    expect(VIZ_KEEP_MARGIN_PX).toBe(VIZ_CREATE_MARGIN_PX * 2);
  });
});

describe('waves that have nothing to wait for', () => {
  it('settles a sync with no columns instead of waiting for a callback', async () => {
    // Reachable through the public `visualizationRegistry` option: a registry
    // matching none of the table's column types leaves `vizColumns` empty, so
    // nothing is observed, no callback is ever delivered, and `whenVizReady()`
    // would never settle on a table that is otherwise working perfectly.
    const h = makeHarness([]);
    h.controller.sync([], 1);
    await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
  });

  it('settles when every column is present but none has a container', async () => {
    const h = makeHarness(['a', 'b']);
    // Headers exist in the controller's list but not in the DOM — the state a
    // sync racing a container teardown lands in.
    h.root.innerHTML = '';
    h.controller.sync([column('a'), column('b')], 1);
    await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
  });
});

describe('a fetch whose instance is reclaimed mid-flight', () => {
  it('leaves the entry stale, so the snapshot is not reused as if current', async () => {
    const h = makeHarness(['a']);
    StubViz.fetchGate = deferred<void>();
    h.controller.sync([column('a')], 1);
    h.io().emit({ a: 'create' });
    await drain();

    // The header scrolls past the keep band while its first fetch is still in
    // flight. `destroyInstance` snapshots whatever the chart held *before*
    // that fetch — one filter context behind.
    h.io().emit({ a: 'outside' });
    await drain();
    expect(h.controller.getEntry('a')?.viz).toBeNull();

    StubViz.fetchGate.resolve();
    StubViz.fetchGate = null;
    await drain();

    // Calling this 'fresh' is what would seed the superseded snapshot into the
    // re-created chart, which then issues no query and never self-corrects.
    expect(h.controller.getEntry('a')?.status).toBe('stale');

    // …and the proof that it matters: scrolling back re-creates with a plain
    // fetch rather than the stale seed.
    StubViz.created = [];
    h.io().emit({ a: 'create' });
    await drain();
    const rebuilt = StubViz.created[0]!;
    expect(rebuilt.seeded).toBeNull();
    expect(rebuilt.fetchCount).toBe(1);
  });
});

describe('hidden document', () => {
  /**
   * A background tab gets no rendering opportunity, so the browser delivers
   * no IntersectionObserver callbacks at all — not even the initial "here is
   * every target's state" batch that normally closes the wave. Measured on a
   * 1,000-column load in a background tab: the load promise resolved at
   * 3,637 ms while `dt:load:viz` came out at 57,151 ms, settling only when
   * the tab was foregrounded 53 seconds later. Nobody looking means it never
   * settles at all, and `whenVizReady()` hangs for the life of the tab.
   */
  function hideDocument(): () => void {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    return () => {
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
      if (original) Object.defineProperty(Document.prototype, 'visibilityState', original);
    };
  }

  it('settles the wave immediately instead of waiting for a callback that never comes', async () => {
    const restore = hideDocument();
    try {
      const h = makeHarness(['a', 'b']);
      h.controller.sync([column('a'), column('b')], 1);
      // Nothing is visible, so the visible wave is empty — and saying so is
      // the whole point. The alternative is an awaiter that never returns.
      await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
      expect(StubViz.created).toHaveLength(0);
    } finally {
      restore();
    }
  });

  it('still observes, so the charts are built once the document is shown', async () => {
    const restore = hideDocument();
    let h: ReturnType<typeof makeHarness>;
    try {
      h = makeHarness(['a', 'b']);
      h.controller.sync([column('a'), column('b')], 1);
      await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
      expect(h.io().observed.size).toBe(2);
    } finally {
      restore();
    }
    // The tab comes to the front: the observer fires its backlog and the
    // visible columns get their charts, late but correct.
    h!.io().emit({ a: 'create', b: 'create' });
    await drain();
    expect(StubViz.created.map((v) => v.columnName)).toEqual(['a', 'b']);
  });

  it('a visible document still waits for the observer', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    let settled = false;
    void h.controller.whenWaveSettled().then(() => {
      settled = true;
    });
    await drain();
    // No callback yet, so the wave is still open — the hidden-document early
    // close must not leak into the ordinary path.
    expect(settled).toBe(false);
    h.io().emit({ a: 'create' });
    await drain();
    expect(settled).toBe(true);
  });
});

describe('eager mode', () => {
  it('creates everything at sync time and constructs no observer', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1, { eager: true });
    expect(StubViz.created).toHaveLength(2);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    await expect(h.controller.whenWaveSettled()).resolves.toBe(2);
  });
});

describe('teardown', () => {
  it('destroy() resolves a wave that is still open', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    h.controller.destroy();
    await expect(h.controller.whenWaveSettled()).resolves.toBe(0);
  });

  it('destroy() tears down every live instance and the observer', async () => {
    const h = makeHarness(['a', 'b']);
    h.controller.sync([column('a'), column('b')], 1);
    h.io().emit({ a: 'create', b: 'create' });
    await drain();

    h.controller.destroy();
    expect(StubViz.created.every((v) => v.destroyed)).toBe(true);
    expect(h.controller.getColumnNames()).toEqual([]);
    expect(h.io().observed.size).toBe(0);
  });

  it('a superseded wave resolves rather than stranding its awaiter', async () => {
    const h = makeHarness(['a']);
    h.controller.sync([column('a')], 1);
    const first = h.controller.whenWaveSettled();
    h.controller.sync([column('a')], 2);
    await expect(first).resolves.toBe(0);
  });
});
