/**
 * Integration tests for the column-stats slot router inside
 * `attachVisualizations` (no custom stats panel): line 1 (row counts) and the
 * detail region (interaction text or default line 2) are independent regions.
 *
 * Regression focus: the old `showingHover` latch let interaction text replace
 * the whole slot and silently drop default-stats refreshes, so participant
 * columns went stale when other filters changed.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import { BaseStatsPanel, type StatsPanelOptions } from '@/visualizations/BaseStatsPanel';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { ColumnStatsData, NumericColumnStats } from '@/statistics/ColumnStatsTypes';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';
import { StatsPanelRegistry } from '@/visualizations/StatsPanelRegistry';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
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

const SCHEMA: ColumnSchema[] = [
  { name: 'amount', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'label', type: 'uuid', nullable: true, originalType: 'UUID' },
];

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

/** Stub viz that lets tests drive the two stats callbacks directly. */
class StubViz extends BaseVisualization {
  static instances: StubViz[] = [];

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    StubViz.instances.push(this);
  }

  async fetchData(): Promise<void> {}
  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}

  emitDefaultStats(stats: ColumnStatsData): void {
    this.options.onDefaultStatsChange?.(stats);
  }

  emitDetail(text: string | null): void {
    this.options.onStatsChange?.(text);
  }
}

class MarkerPanel extends BaseStatsPanel {
  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    this.container.dataset.panelMounted = column.name;
    this.container.textContent = 'panel-owned';
  }
  update(): void {}
  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }
}

/** Registry with a stub viz for integers only — `uuid` stays viz-less. */
function makeVizRegistry(): VisualizationRegistry {
  const reg = new VisualizationRegistry();
  // The constructor pre-populates the built-ins (uuid included via the
  // categorical registration) — drop them so `label` is genuinely viz-less.
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub-numeric',
    isApplicable: (t) => t === 'integer' || t === 'float' || t === 'decimal',
    constructor: StubViz as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

function makeStats(overrides: Partial<NumericColumnStats> = {}): NumericColumnStats {
  return {
    kind: 'numeric',
    totalRows: 20,
    nonNullCount: 20,
    nullCount: 0,
    filteredTotalRows: null,
    min: 1,
    max: 20,
    median: 10,
    distinctCount: 20,
    ...overrides,
  };
}

interface Harness {
  table: DataTable;
  container: HTMLElement;
  viz: StubViz;
  amountSlot: HTMLElement;
  uuidSlot: HTMLElement;
}

async function mount(
  opts: {
    classPrefix?: string;
    statsPanelRegistry?: StatsPanelRegistry;
    messages?: Parameters<typeof createDataTable>[0]['messages'];
  } = {},
): Promise<Harness> {
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
    ...(opts.classPrefix ? { classPrefix: opts.classPrefix } : {}),
    ...(opts.statsPanelRegistry ? { statsPanelRegistry: opts.statsPanelRegistry } : {}),
    ...(opts.messages ? { messages: opts.messages } : {}),
  });
  table.state.tableName.set('t1');
  table.state.totalRows.set(20);
  table.state.filteredRows.set(20);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  const prefix = opts.classPrefix ?? 'dt';
  const headers = container.querySelectorAll(`.${prefix}-col-header`);
  let amountSlot: HTMLElement | null = null;
  let uuidSlot: HTMLElement | null = null;
  for (const header of headers) {
    const slot = header.querySelector(`.${prefix}-col-stats`) as HTMLElement | null;
    if (!slot) continue;
    if (header.getAttribute('data-column') === 'amount') amountSlot = slot;
    if (header.getAttribute('data-column') === 'label') uuidSlot = slot;
  }
  if (!amountSlot || !uuidSlot) throw new Error('stats slots not found');
  return {
    table,
    container,
    viz: StubViz.instances[StubViz.instances.length - 1]!,
    amountSlot,
    uuidSlot,
  };
}

afterEach(() => {
  StubViz.instances = [];
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('column-stats slot router — line 1 and detail regions', () => {
  it('renders default stats as line1 + line2 spans', async () => {
    const { table, viz, amountSlot } = await mount();
    viz.emitDefaultStats(makeStats());
    const line1 = amountSlot.querySelector('.dt-stats-line1');
    const line2 = amountSlot.querySelector('.dt-stats-line2');
    expect(line1?.textContent).toBe('20 rows');
    expect(line2?.textContent).toContain('min');
    await table.destroy();
  });

  it('keeps line 1 visible while interaction detail is showing', async () => {
    const { table, viz, amountSlot } = await mount();
    viz.emitDefaultStats(makeStats({ filteredTotalRows: 8 }));
    const line1Before = amountSlot.querySelector('.dt-stats-line1')?.textContent;
    expect(line1Before).toBe('8 / 20 rows');

    viz.emitDetail('<span class="stats-label">Bin:</span> 1 – 3<br>9 rows (45.0%)');
    const line1During = amountSlot.querySelector('.dt-stats-line1')?.textContent;
    expect(line1During).toBe('8 / 20 rows');
    expect(amountSlot.textContent).toContain('Bin:');
    expect(amountSlot.textContent).toContain('9 rows (45.0%)');
    // Default line 2 is displaced by the detail, not stacked under it.
    expect(amountSlot.querySelector('.dt-stats-line2')).toBeNull();

    viz.emitDetail(null);
    expect(amountSlot.querySelector('.dt-stats-line1')?.textContent).toBe('8 / 20 rows');
    expect(amountSlot.querySelector('.dt-stats-line2')?.textContent).toContain('min');
    expect(amountSlot.textContent).not.toContain('Bin:');
    await table.destroy();
  });

  it('applies default-stats refreshes that arrive while detail is showing (latch removal)', async () => {
    const { table, viz, amountSlot } = await mount();
    viz.emitDefaultStats(makeStats({ filteredTotalRows: 8 }));
    viz.emitDetail('<span class="stats-label">Category:</span> US<br>8 rows (40.0%)');

    // Another column's filter changes → this viz refetches and re-emits.
    viz.emitDefaultStats(makeStats({ filteredTotalRows: 4 }));
    // Line 1 tracks the new stats immediately, detail stays.
    expect(amountSlot.querySelector('.dt-stats-line1')?.textContent).toBe('4 / 20 rows');
    expect(amountSlot.textContent).toContain('8 rows (40.0%)');

    // Clearing the detail reveals the *latest* default stats, not the
    // pre-interaction snapshot the old latch would have restored.
    viz.emitDetail(null);
    expect(amountSlot.querySelector('.dt-stats-line1')?.textContent).toBe('4 / 20 rows');
    expect(amountSlot.querySelector('.dt-stats-line2')).not.toBeNull();
    await table.destroy();
  });

  it('replaces detail text on subsequent emissions (hover over committed)', async () => {
    const { table, viz, amountSlot } = await mount();
    viz.emitDefaultStats(makeStats({ filteredTotalRows: 9 }));
    viz.emitDetail('committed-text');
    expect(amountSlot.textContent).toContain('committed-text');
    viz.emitDetail('hover-text');
    expect(amountSlot.textContent).toContain('hover-text');
    expect(amountSlot.textContent).not.toContain('committed-text');
    // The viz restores committed text on mouse-out by re-emitting it.
    viz.emitDetail('committed-text');
    expect(amountSlot.textContent).toContain('committed-text');
    await table.destroy();
  });

  it('uses the configured classPrefix for both spans', async () => {
    const { table, viz, amountSlot } = await mount({ classPrefix: 'xx' });
    viz.emitDefaultStats(makeStats());
    expect(amountSlot.querySelector('.xx-stats-line1')).not.toBeNull();
    expect(amountSlot.querySelector('.xx-stats-line2')).not.toBeNull();
    expect(amountSlot.querySelector('.dt-stats-line1')).toBeNull();
    await table.destroy();
  });

  it('never writes the slot when a custom panel owns it', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'marker',
      isApplicable: (t) => t === 'integer',
      constructor: MarkerPanel as unknown as never,
      priority: 10,
    } as never);
    const { table, viz, amountSlot } = await mount({ statsPanelRegistry: reg });
    expect(amountSlot.dataset.panelMounted).toBe('amount');
    viz.emitDefaultStats(makeStats());
    viz.emitDetail('should-not-appear');
    viz.emitDetail(null);
    expect(amountSlot.textContent).toBe('panel-owned');
    expect(amountSlot.querySelector('.dt-stats-line1')).toBeNull();
    await table.destroy();
  });
});

describe('non-viz column stats (refreshNonVizStats)', () => {
  it('shows the fraction via messages.statistics.filteredRowCount when filters are active', async () => {
    const { table, uuidSlot } = await mount({
      messages: {
        statistics: {
          filteredRowCount: (f: number, t: number) => `${f} sur ${t} lignes`,
        },
      },
    });
    expect(uuidSlot.textContent).toBe('20 rows');

    table.state.filters.set([{ type: 'point', column: 'amount', value: 1 }]);
    await Promise.resolve();
    await Promise.resolve();
    table.state.filteredRows.set(5);
    // The refresh is coalesced into a microtask (one pass per filter cycle
    // instead of one per signal), so it lands a turn after the `set`.
    await Promise.resolve();
    expect(uuidSlot.querySelector('.dt-stats-line1')?.textContent).toBe('5 sur 20 lignes');

    table.state.filters.set([]);
    await Promise.resolve();
    expect(uuidSlot.querySelector('.dt-stats-line1')?.textContent).toBe('20 rows');
    await table.destroy();
  });

  it('shows the fraction even when the filtered count equals the total', async () => {
    const { table, uuidSlot } = await mount();
    table.state.filters.set([{ type: 'point', column: 'amount', value: 1 }]);
    await Promise.resolve();
    await Promise.resolve();
    table.state.filteredRows.set(20);
    await Promise.resolve();
    expect(uuidSlot.querySelector('.dt-stats-line1')?.textContent).toBe('20 / 20 rows');
    await table.destroy();
  });

  it('initial non-viz write is filter-aware when mounted with filters already active', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    // The coordinator's COUNT(*) re-query must agree with the filteredRows
    // this test sets, or its async write would race the assertion.
    const bridge = makeBridge();
    (bridge.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (/COUNT\(\*\)/i.test(sql)) return Promise.resolve([{ cnt: 7 }]);
      return Promise.resolve([]);
    });
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      exportDialog: false,
      visualizationRegistry: makeVizRegistry(),
    });
    table.state.tableName.set('t1');
    table.state.totalRows.set(20);
    table.state.filteredRows.set(7);
    table.state.filters.set([{ type: 'point', column: 'amount', value: 1 }]);
    initializeColumnsFromSchema(table.state, SCHEMA);
    await Promise.resolve();
    await Promise.resolve();
    const header = container.querySelector('.dt-col-header[data-column="label"]');
    const slot = header?.querySelector('.dt-col-stats');
    expect(slot?.querySelector('.dt-stats-line1')?.textContent).toBe('7 / 20 rows');
    await table.destroy();
  });
});
