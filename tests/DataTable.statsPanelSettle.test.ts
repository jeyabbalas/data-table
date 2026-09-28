/**
 * @vitest-environment jsdom
 *
 * Custom stats panels on a wide table are built for the columns a scroll
 * stops at, not for every column it passes.
 *
 * A panel lives while its column is mounted, and usually queries as it is
 * built. A smooth scroll across the table mounts nearly every column on the
 * way, and building each one's panel as it mounted left hundreds of queries
 * for the charts at the far end to wait behind: about 500 panels for the
 * scroll to a derived column just added, on a 1,000-column table.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { STATS_PANEL_SETTLE_MS } from '@/DataTable';
import {
  createDataTable,
  StatsPanelRegistry,
  VisualizationRegistry,
  type DataTable,
} from '@/index';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';
import type { ColumnStatsData } from '@/statistics/ColumnStatsTypes';
import { BaseStatsPanel, type StatsPanelOptions } from '@/visualizations/BaseStatsPanel';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { FakeIntersectionWorld } from './helpers/fakeIntersectionObserver';

const NAMES = Array.from({ length: 40 }, (_, i) => `c${i}`);
const SCHEMA: ColumnSchema[] = NAMES.map((name) => ({
  name,
  type: 'integer',
  nullable: false,
  originalType: 'INTEGER',
}));
/** Every column is 150 px wide, the default. */
const COLUMN_WIDTH = 150;
/**
 * The body's viewport: two columns. The columns mounted are those within a
 * viewport of the view, six of them, kept until the view moves half a
 * viewport past them.
 */
const VIEWPORT = 300;

/** Panels built, updated and destroyed, and charts built, in order. */
let log: string[] = [];

class LoggingPanel extends BaseStatsPanel {
  /** The column whose panel throws as it is built. */
  static throwFor: string | null = null;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    if (column.name === LoggingPanel.throwFor) throw new Error(`no panel for ${column.name}`);
    log.push(`panel ${column.name}`);
    container.textContent = `panel ${column.name}`;
  }
  update(stats: ColumnStatsData | null): void {
    log.push(`update ${this.column.name} ${stats ? stats.nonNullCount : 'null'}`);
  }
  override setHoverStats(text: string | null): void {
    log.push(`detail ${this.column.name} ${text}`);
  }
  override destroy(): void {
    log.push(`destroy ${this.column.name}`);
    super.destroy();
  }
}

/** A chart that queries nothing, and reports what a test tells it to. */
class StubChart extends BaseVisualization {
  static live = new Map<string, StubChart>();

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    log.push(`chart ${column.name}`);
    StubChart.live.set(column.name, this);
  }
  /** Report the column's stats, as a chart does when its fetch lands. */
  reportStats(nonNullCount: number): void {
    this.options.onDefaultStatsChange?.({
      kind: 'numeric',
      totalRows: 20,
      nonNullCount,
      nullCount: 20 - nonNullCount,
      filteredTotalRows: null,
      min: 0,
      max: 10,
      median: 5,
      distinctCount: nonNullCount,
    });
  }
  /** Report detail text, as a chart does for a selection or under the pointer. */
  reportHover(text: string | null): void {
    this.options.onStatsChange?.(text);
  }
  override destroy(): void {
    if (StubChart.live.get(this.column.name) === this) StubChart.live.delete(this.column.name);
    super.destroy();
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

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
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

interface Mounted {
  table: DataTable;
  container: HTMLElement;
  statsPanelRegistry: StatsPanelRegistry;
  /** Scroll the body to `left`, as the browser does: then its scroll event. */
  scrollTo: (left: number) => void;
  /** The stats slot's text. */
  slot: (column: string) => string;
}

/** Register {@link LoggingPanel} for every column. */
function registerPanels(registry: StatsPanelRegistry): void {
  registry.register({
    name: 'logging',
    isApplicable: (type) => type === 'integer',
    constructor: LoggingPanel,
    priority: 10,
  });
}

/**
 * A table of {@link NAMES}, with a stub chart and, unless `panels` is
 * `false`, a logging panel on every column. Every column is mounted until the
 * body has a width; it gets {@link VIEWPORT}, and the view starts at the left
 * edge.
 */
async function mount({ panels = true } = {}): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const statsPanelRegistry = new StatsPanelRegistry();
  if (panels) registerPanels(statsPanelRegistry);
  const visualizationRegistry = new VisualizationRegistry();
  for (const name of visualizationRegistry.getRegisteredTypes()) {
    visualizationRegistry.unregister(name);
  }
  visualizationRegistry.register({
    name: 'stub',
    isApplicable: () => true,
    constructor: StubChart,
    priority: 100,
  });
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry,
    statsPanelRegistry,
  });
  table.state.tableName.set('t');
  table.state.totalRows.set(20);
  table.state.filteredRows.set(20);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();

  const body = container.querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(body, 'clientWidth', { configurable: true, value: VIEWPORT });
  const scrollTo = (left: number): void => {
    body.scrollLeft = left;
    body.dispatchEvent(new Event('scroll'));
  };
  scrollTo(0);
  const slot = (column: string): string =>
    container.querySelector(`.dt-col-header[data-column="${column}"] .dt-col-stats`)?.textContent ??
    '';
  return { table, container, statsPanelRegistry, scrollTo, slot };
}

/** The columns with a live panel, from the log. */
function livePanels(): string[] {
  const live = new Map<string, number>();
  for (const entry of log) {
    const [event, column] = entry.split(' ') as [string, string];
    if (event === 'panel') live.set(column, (live.get(column) ?? 0) + 1);
    if (event === 'destroy') live.set(column, (live.get(column) ?? 0) - 1);
  }
  return [...live].filter(([, n]) => n > 0).map(([column]) => column);
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  log = [];
  LoggingPanel.throwFor = null;
  StubChart.live.clear();
});

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(
    new Proxy(
      { measureText: () => ({ width: 30 }) },
      {
        get: (target, key) =>
          key in target
            ? target[key as keyof typeof target]
            : typeof key === 'string'
              ? vi.fn()
              : undefined,
        set: () => true,
      },
    ),
  ) as never;
});

describe('custom stats panels during a scroll', () => {
  it('builds none on the way, and those of the columns it stops at once they hold still', async () => {
    const { table, scrollTo } = await mount();
    // Mounted: c0–c3, the view and a viewport to its right.
    expect(livePanels()).toEqual(['c0', 'c1', 'c2', 'c3']);
    log = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // A column a frame, halfway across, then a jump to the far end: the
    // mounted columns change every other frame on the way.
    for (let left = COLUMN_WIDTH; left <= 20 * COLUMN_WIDTH; left += COLUMN_WIDTH) {
      scrollTo(left);
      vi.advanceTimersByTime(16);
    }
    // The columns left behind lose their panels as they go.
    expect(log.filter((e) => e.startsWith('destroy'))).toEqual(
      expect.arrayContaining(['destroy c0', 'destroy c1', 'destroy c2', 'destroy c3']),
    );
    scrollTo(NAMES.length * COLUMN_WIDTH - VIEWPORT);
    expect(log.filter((e) => e.startsWith('panel'))).toEqual([]);

    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS - 1);
    expect(log.filter((e) => e.startsWith('panel'))).toEqual([]);
    vi.advanceTimersByTime(1);

    // The view is c38–c39; a viewport to its left is c36–c37.
    expect(log.filter((e) => e.startsWith('panel'))).toEqual([
      'panel c36',
      'panel c37',
      'panel c38',
      'panel c39',
    ]);
    expect(livePanels()).toEqual(['c36', 'c37', 'c38', 'c39']);
    await table.destroy();
  });

  it('keeps waiting while the mounted columns keep changing', async () => {
    const { table, scrollTo } = await mount();
    log = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // A change every 100 ms, each inside the settle time of the one before.
    for (const left of [1500, 3000, 4500]) {
      scrollTo(left);
      vi.advanceTimersByTime(100);
    }
    expect(log.filter((e) => e.startsWith('panel'))).toEqual([]);
    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS - 100);
    expect(livePanels()).toEqual(['c28', 'c29', 'c30', 'c31', 'c32', 'c33']);
    await table.destroy();
  });

  it('gives a panel built for new data no detail from the chart the data replaced', async () => {
    const { table } = await mount();
    StubChart.live.get('c1')!.reportHover('3 of 20 selected');
    log = [];
    table.state.tableName.set('t2');
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toContain('panel c1');
    expect(log.filter((e) => e.startsWith('detail c1'))).toEqual([]);
    await table.destroy();
  });

  it('builds nothing once the table is destroyed', async () => {
    const { table, scrollTo } = await mount();
    log = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    scrollTo(4500);
    expect(vi.getTimerCount()).toBe(1);
    await table.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS);
    expect(log.filter((e) => e.startsWith('panel'))).toEqual([]);
  });
});

describe('custom stats panels and lazy charts', () => {
  let world: FakeIntersectionWorld;

  beforeAll(() => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        return world.factory(callback, init);
      }
    };
  });

  afterAll(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  /**
   * Mount, then jump to c28–c29 in view. The columns mounted, c26–c31, and
   * the charts in reach, the same, are built as the create observer reports
   * them, before the mounted columns have held still. `before` holds each
   * stats slot as it was when the columns mounted, before their charts.
   */
  async function jumpWithCharts(
    options: { panels?: boolean } = {},
  ): Promise<Mounted & { before: Map<string, string> }> {
    world = new FakeIntersectionWorld();
    world.viewportWidth = VIEWPORT;
    world.placeRow(NAMES, COLUMN_WIDTH);
    const mounted = await mount(options);
    world.flush();
    await Promise.resolve();
    log = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mounted.scrollTo(4200);
    const before = new Map(NAMES.map((name) => [name, mounted.slot(name)]));
    world.scrollTo(4200);
    // The first charts' data settles, and the queue builds the rest.
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return { ...mounted, before };
  }

  it('gives a panel the stats its chart reported before the panel was built, and never shows them itself', async () => {
    const { table, slot, before } = await jumpWithCharts();
    expect(StubChart.live.has('c28')).toBe(true);
    expect(log).not.toContain('panel c28');
    expect(slot('c28')).toBe(before.get('c28'));

    // Its data lands, and with it the detail of a selection drawn from the
    // column's filter.
    StubChart.live.get('c28')!.reportStats(15);
    StubChart.live.get('c28')!.reportHover('3 of 20 selected');
    expect(slot('c28')).toBe(before.get('c28'));

    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS);
    const panelLog = log.slice(log.indexOf('panel c28')).filter((e) => e.includes('c28'));
    expect(panelLog).toEqual(['panel c28', 'update c28 15', 'detail c28 3 of 20 selected']);
    expect(slot('c28')).toBe('panel c28');
    await table.destroy();
  });

  it('gives a panel no detail its chart has since cleared', async () => {
    const { table } = await jumpWithCharts();
    StubChart.live.get('c28')!.reportHover('bin 1–5');
    StubChart.live.get('c28')!.reportHover(null);
    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS);
    expect(log).toContain('panel c28');
    expect(log.filter((e) => e.startsWith('detail c28'))).toEqual([]);
    await table.destroy();
  });

  it('gives a panel no detail from a chart that is gone', async () => {
    const { table } = await jumpWithCharts();
    StubChart.live.get('c28')!.reportHover('3 of 20 selected');
    // The charts' reach moves on and c28's chart goes; c28 stays mounted,
    // as in a table narrower than the charts' reach.
    world.scrollTo(3000);
    expect(StubChart.live.has('c28')).toBe(false);
    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS);
    expect(log).toContain('panel c28');
    expect(log.filter((e) => e.startsWith('detail c28'))).toEqual([]);
    await table.destroy();
  });

  it("shows the stats its chart held back once the column's panel fails to build", async () => {
    const { table, slot } = await jumpWithCharts();
    // Built at load, destroyed as the view left, and failing when rebuilt.
    LoggingPanel.throwFor = 'c28';
    // 15 of 20 values: 5 nulls.
    StubChart.live.get('c28')!.reportStats(15);
    expect(slot('c28')).not.toMatch(/5 null/);

    vi.advanceTimersByTime(STATS_PANEL_SETTLE_MS);
    expect(slot('c28')).toMatch(/5 null/);
    await table.destroy();
  });

  it('writes its stats into the slot of a column whose panel failed to build', async () => {
    // Fails at load, and is not tried again for this relation.
    LoggingPanel.throwFor = 'c28';
    const { table, slot } = await jumpWithCharts();
    StubChart.live.get('c28')!.reportStats(15);
    expect(slot('c28')).toMatch(/5 null/);
    await table.destroy();
  });

  it('writes its stats into the slot of a column no panel applies to', async () => {
    const { table, slot } = await jumpWithCharts({ panels: false });
    StubChart.live.get('c28')!.reportStats(15);
    expect(slot('c28')).toMatch(/5 null/);
    await table.destroy();
  });

  it('writes its stats into the slot of a column that is not mounted', async () => {
    const { table, slot } = await jumpWithCharts();
    // The charts reach past the mounted columns, as in a table narrower than
    // their reach: c32 gets a chart, and no panel is coming for it.
    world.scrollTo(4500);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(StubChart.live.has('c32')).toBe(true);
    StubChart.live.get('c32')!.reportStats(15);
    expect(slot('c32')).toMatch(/5 null/);
    await table.destroy();
  });

  it('writes its stats into the slot when no panel build is waiting', async () => {
    world = new FakeIntersectionWorld();
    world.viewportWidth = VIEWPORT;
    world.placeRow(NAMES, COLUMN_WIDTH);
    const { table, statsPanelRegistry, slot } = await mount({ panels: false });
    world.flush();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    // The build the mount scheduled has run, and found no panel to build.
    await new Promise((resolve) => setTimeout(resolve, STATS_PANEL_SETTLE_MS));

    // A panel registered now waits for the next change to the mounted columns.
    registerPanels(statsPanelRegistry);
    StubChart.live.get('c1')!.reportStats(15);
    expect(slot('c1')).toMatch(/5 null/);
    await table.destroy();
  });
});
