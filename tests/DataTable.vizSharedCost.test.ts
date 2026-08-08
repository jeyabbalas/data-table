/**
 * Facade wiring for the two per-column costs Phase 2 collapsed: the
 * `data-dt-color-scheme` MutationObserver and the exact `COUNT(DISTINCT …)`
 * scan.
 *
 * `ThemeWatcher` and `shouldUseApproxDistinct` have their own unit tests;
 * these pin that `createDataTable` actually *reaches* them, because both are
 * opt-in options on `VisualizationOptions` and a dropped line in the facade
 * would silently restore the per-column cost with every test still green.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { APPROX_DISTINCT_ROW_THRESHOLD } from '@/visualizations/histogram/HistogramData';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
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
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
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
  }) as never;
});

const COLUMN_COUNT = 6;
const SCHEMA: ColumnSchema[] = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
  name: `c${i}`,
  type: 'integer' as const,
  nullable: false,
  originalType: 'INTEGER',
}));

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation((sql: string) => {
      if (/COUNT\(\*\)/i.test(sql)) return Promise.resolve([{ cnt: 0 }]);
      return Promise.resolve([]);
    }),
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

/** Records the options every instance was handed. */
class StubViz extends BaseVisualization {
  static seen: VisualizationOptions[] = [];
  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    StubViz.seen.push(options);
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

function makeVizRegistry(): VisualizationRegistry {
  const reg = new VisualizationRegistry();
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub-numeric',
    isApplicable: (t: string) => t === 'integer',
    constructor: StubViz as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

/**
 * Count `observe()` calls that filter on `data-dt-color-scheme`, whoever
 * makes them. Other subsystems (modals, portals) install observers of their
 * own, so filtering by attribute is what isolates the theme cost.
 */
function countThemeObservers(): { stop: () => number } {
  const Original = window.MutationObserver;
  let observed = 0;
  class Counting extends Original {
    observe(target: Node, init?: MutationObserverInit): void {
      if (init?.attributeFilter?.includes('data-dt-color-scheme')) observed++;
      super.observe(target, init);
    }
  }
  window.MutationObserver = Counting as unknown as typeof MutationObserver;
  globalThis.MutationObserver = Counting as unknown as typeof MutationObserver;
  return {
    stop() {
      window.MutationObserver = Original;
      globalThis.MutationObserver = Original;
      return observed;
    },
  };
}

async function mount(totalRows: number): Promise<DataTable> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry: makeVizRegistry(),
  });
  table.state.tableName.set('t1');
  table.state.totalRows.set(totalRows);
  table.state.filteredRows.set(totalRows);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return table;
}

afterEach(() => {
  StubViz.seen = [];
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('shared theme observer', () => {
  it('installs one color-scheme observer per table, not one per column', async () => {
    const counter = countThemeObservers();
    const table = await mount(1000);
    const observers = counter.stop();

    expect(StubViz.seen).toHaveLength(COLUMN_COUNT);
    expect(observers).toBe(1);
    await table.destroy();
  });

  it('hands every visualization the same watcher instance', async () => {
    const table = await mount(1000);
    const watchers = new Set(StubViz.seen.map((o) => o.themeWatcher));
    expect(watchers.size).toBe(1);
    expect([...watchers][0]).toBeDefined();
    await table.destroy();
  });

  it('detaches the observer when the table is destroyed', async () => {
    const table = await mount(1000);
    const watcher = StubViz.seen[0]?.themeWatcher;
    expect(watcher?.isObserving).toBe(true);
    await table.destroy();
    expect(watcher?.isObserving).toBe(false);
    expect(watcher?.count).toBe(0);
  });
});

describe('approximate distinct counts', () => {
  it('stays exact at or below the row threshold', async () => {
    const table = await mount(APPROX_DISTINCT_ROW_THRESHOLD);
    expect(StubViz.seen.every((o) => o.useApproxDistinct === false)).toBe(true);
    await table.destroy();
  });

  it('switches to HyperLogLog above the row threshold', async () => {
    const table = await mount(APPROX_DISTINCT_ROW_THRESHOLD + 1);
    expect(StubViz.seen).toHaveLength(COLUMN_COUNT);
    expect(StubViz.seen.every((o) => o.useApproxDistinct === true)).toBe(true);
    await table.destroy();
  });
});
