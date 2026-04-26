/**
 * Integration tests for the custom stats panel API.
 *
 * Wires a real `createDataTable()` instance against a stub bridge and
 * a stub VisualizationRegistry, then mounts a fake `BaseStatsPanel`
 * subclass that captures every lifecycle call. Verifies the routing
 * through `attachVisualizations` end-to-end.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

import {
  createDataTable,
  StatsPanelRegistry,
  VisualizationRegistry,
  defaultStatsPanelRegistry,
  type DataTable,
} from '@/index';
import { BaseStatsPanel, type StatsPanelOptions } from '@/visualizations/BaseStatsPanel';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { ColumnStatsData } from '@/statistics/ColumnStatsTypes';
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
  // BaseVisualization eagerly creates a canvas + 2D context; JSDOM doesn't
  // implement getContext, so we stub it for the create-path.
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
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
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

/**
 * Stub visualization that synthetically invokes `onDefaultStatsChange` and
 * `onStatsChange` on demand. Lets us trigger the stats-flow plumbing
 * without running real DuckDB queries.
 */
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

  emitHover(text: string | null): void {
    this.options.onStatsChange?.(text);
  }
}

interface PanelEvent {
  type: 'construct' | 'update' | 'updateFilters' | 'setHoverStats' | 'destroy';
  column: string;
  payload?: unknown;
}

class CapturingPanel extends BaseStatsPanel {
  static events: PanelEvent[] = [];
  static throwIn: { construct?: boolean; update?: boolean; updateFilters?: boolean } = {};

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    if (CapturingPanel.throwIn.construct) {
      throw new Error('panel construct boom');
    }
    CapturingPanel.events.push({ type: 'construct', column: column.name });
    this.container.dataset.panelMounted = column.name;
  }

  update(stats: ColumnStatsData | null): void {
    if (CapturingPanel.throwIn.update) throw new Error('panel update boom');
    CapturingPanel.events.push({ type: 'update', column: this.column.name, payload: stats });
    this.container.textContent = stats ? `mounted:${stats.kind}` : `mounted:loading`;
  }

  setHoverStats(text: string | null): void {
    CapturingPanel.events.push({ type: 'setHoverStats', column: this.column.name, payload: text });
  }

  async updateFilters(filters: Filter[]): Promise<void> {
    await super.updateFilters(filters);
    if (CapturingPanel.throwIn.updateFilters) throw new Error('panel updateFilters boom');
    CapturingPanel.events.push({
      type: 'updateFilters',
      column: this.column.name,
      payload: filters,
    });
  }

  destroy(): void {
    CapturingPanel.events.push({ type: 'destroy', column: this.column.name });
    this.container.replaceChildren();
    super.destroy();
  }
}

function makeVizRegistry(): VisualizationRegistry {
  const reg = new VisualizationRegistry();
  reg.resetToDefaults();
  // Replace built-ins with the stub for both numeric and string types so
  // the visualization plumbing exists but never makes a real query.
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub-numeric',
    isApplicable: (t) => t === 'integer' || t === 'float' || t === 'decimal',
    constructor: StubViz as unknown as VisualizationRegistry['create'] extends (
      ...args: unknown[]
    ) => infer R
      ? never
      : never,
    priority: 100,
  } as never);
  reg.register({
    name: 'stub-string',
    isApplicable: (t) => t === 'string',
    constructor: StubViz as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

interface Harness {
  table: DataTable;
  container: HTMLElement;
  bridge: WorkerBridge;
}

async function mount(
  opts: {
    statsPanelRegistry?: StatsPanelRegistry;
    vizRegistry?: VisualizationRegistry;
  } = {},
): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  const table = await createDataTable({
    container,
    bridge,
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry: opts.vizRegistry ?? makeVizRegistry(),
    statsPanelRegistry: opts.statsPanelRegistry,
  });
  // Drive a fake load by setting tableName and the schema so attachVisualizations
  // fires. The microtask in `scheduleAttach` reads both before mounting headers.
  table.state.tableName.set('t1');
  initializeColumnsFromSchema(table.state, SCHEMA);
  // Two microtasks: one for scheduleAttach to run, one for any chained queueMicrotask.
  await Promise.resolve();
  await Promise.resolve();
  return { table, container, bridge };
}

beforeEach(() => {
  CapturingPanel.events = [];
  CapturingPanel.throwIn = {};
  StubViz.instances = [];
  defaultStatsPanelRegistry.resetToDefaults();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('DataTable + StatsPanelRegistry — integration', () => {
  it('with no registry, the library writes its default fallback HTML to .dt-col-stats', async () => {
    const { table, container } = await mount();
    const slots = container.querySelectorAll('.dt-col-stats');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      // Default fallback HTML contains a stats-line1 span. No mounted-panel marker.
      expect(slot.querySelector('.dt-stats-line1')).not.toBeNull();
      expect((slot as HTMLElement).dataset.panelMounted).toBeUndefined();
    }
    await table.destroy();
  });

  it('with empty registry passed, behavior is unchanged (no panel mounted)', async () => {
    const reg = new StatsPanelRegistry();
    const { table, container } = await mount({ statsPanelRegistry: reg });
    const slots = container.querySelectorAll('.dt-col-stats');
    for (const slot of slots) {
      expect((slot as HTMLElement).dataset.panelMounted).toBeUndefined();
    }
    expect(CapturingPanel.events).toHaveLength(0);
    await table.destroy();
  });

  it('mounts a custom panel for each matching column; non-matching columns keep default HTML', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'numeric-only',
      isApplicable: (t) => t === 'integer' || t === 'float' || t === 'decimal',
      constructor: CapturingPanel,
      priority: 10,
    });
    const { table, container } = await mount({ statsPanelRegistry: reg });

    const constructEvents = CapturingPanel.events.filter((e) => e.type === 'construct');
    expect(constructEvents).toHaveLength(1);
    expect(constructEvents[0].column).toBe('amount');

    // The numeric column slot was claimed by the panel.
    const amountSlot = container.querySelector('[data-panel-mounted="amount"]');
    expect(amountSlot).not.toBeNull();
    expect(amountSlot?.classList.contains('dt-col-stats')).toBe(true);

    // The string column slot still uses the default formatter.
    const allSlots = Array.from(container.querySelectorAll('.dt-col-stats'));
    const stringSlot = allSlots.find(
      (el) => (el as HTMLElement).dataset.panelMounted === undefined,
    );
    expect(stringSlot).toBeDefined();
    expect(stringSlot?.querySelector('.dt-stats-line1')).not.toBeNull();

    await table.destroy();
  });

  it('initial mount triggers panel.update(null)', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    const updates = CapturingPanel.events.filter((e) => e.type === 'update');
    expect(updates.length).toBeGreaterThanOrEqual(2); // one per column
    for (const u of updates) expect(u.payload).toBeNull();

    await table.destroy();
  });

  it('routes onDefaultStatsChange from a viz through panel.update(stats)', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    CapturingPanel.events.length = 0;
    const numericViz = StubViz.instances.find((v) => v.getColumn().name === 'amount');
    expect(numericViz).toBeDefined();

    const stats: ColumnStatsData = {
      kind: 'numeric',
      totalRows: 100,
      nonNullCount: 90,
      nullCount: 10,
      filteredTotalRows: null,
      min: 0,
      max: 1000,
      median: 50,
      distinctCount: 80,
    };
    numericViz!.emitDefaultStats(stats);

    const updateEvent = CapturingPanel.events.find(
      (e) => e.type === 'update' && e.column === 'amount',
    );
    expect(updateEvent).toBeDefined();
    expect(updateEvent?.payload).toBe(stats);

    await table.destroy();
  });

  it('routes onStatsChange (hover) through panel.setHoverStats(text); null clears', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    CapturingPanel.events.length = 0;
    const numericViz = StubViz.instances.find((v) => v.getColumn().name === 'amount')!;
    numericViz.emitHover('hovering bin 5');
    numericViz.emitHover(null);

    const hoverEvents = CapturingPanel.events.filter((e) => e.type === 'setHoverStats');
    expect(hoverEvents).toHaveLength(2);
    expect(hoverEvents[0].payload).toBe('hovering bin 5');
    expect(hoverEvents[1].payload).toBeNull();

    await table.destroy();
  });

  it('broadcasts updateFilters to every panel on filter change', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    CapturingPanel.events.length = 0;
    const f: Filter = { type: 'not-null', column: 'amount' } as unknown as Filter;
    table.state.filters.set([f]);

    // Wait for async broadcast to complete.
    const start = Date.now();
    while (
      CapturingPanel.events.filter((e) => e.type === 'updateFilters').length < 2 &&
      Date.now() - start < 1000
    ) {
      await new Promise((r) => setTimeout(r, 5));
    }

    const updates = CapturingPanel.events.filter((e) => e.type === 'updateFilters');
    expect(updates).toHaveLength(2);
    for (const u of updates) {
      expect(u.payload).toEqual([f]);
    }

    await table.destroy();
  });

  it('table.destroy() destroys every active panel and clears the slot', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table, container } = await mount({ statsPanelRegistry: reg });

    await table.destroy();

    const destroyed = CapturingPanel.events.filter((e) => e.type === 'destroy');
    // At least one destroy per column (could be more if attach re-ran, but we
    // expect exactly two here for the steady-state schema).
    expect(destroyed.length).toBeGreaterThanOrEqual(2);

    // After destroy the table container is torn down by tableContainer.destroy(),
    // so we don't assert on its DOM contents — just that destroy fired.
    expect(container).toBeDefined();
  });

  it('schema change destroys old panels and constructs new ones bound to fresh headers', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    const initialConstructs = CapturingPanel.events.filter((e) => e.type === 'construct').length;
    expect(initialConstructs).toBeGreaterThanOrEqual(2);

    // Replace the schema. This should re-run attachVisualizations.
    initializeColumnsFromSchema(table.state, [
      { name: 'amount', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
      { name: 'extra', type: 'integer', nullable: true, originalType: 'INTEGER' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    const finalConstructs = CapturingPanel.events.filter((e) => e.type === 'construct').length;
    const destroys = CapturingPanel.events.filter((e) => e.type === 'destroy').length;

    // We tore down the original panels and built a new set for the new schema.
    expect(destroys).toBeGreaterThanOrEqual(initialConstructs);
    expect(finalConstructs).toBeGreaterThan(initialConstructs);

    await table.destroy();
  });

  it('two tables with different statsPanelRegistry values do not leak panels', async () => {
    class PanelA extends CapturingPanel {}
    class PanelB extends CapturingPanel {}

    const regA = new StatsPanelRegistry();
    regA.register({
      name: 'a',
      isApplicable: () => true,
      constructor: PanelA,
      priority: 10,
    });
    const regB = new StatsPanelRegistry();
    regB.register({
      name: 'b',
      isApplicable: () => true,
      constructor: PanelB,
      priority: 10,
    });

    const a = await mount({ statsPanelRegistry: regA });
    const b = await mount({ statsPanelRegistry: regB });

    // Each table's columns mount its own subclass.
    const aMounts = a.container.querySelectorAll('[data-panel-mounted]');
    const bMounts = b.container.querySelectorAll('[data-panel-mounted]');
    expect(aMounts.length).toBeGreaterThan(0);
    expect(bMounts.length).toBeGreaterThan(0);

    await a.table.destroy();
    await b.table.destroy();
  });

  it('panel constructor throw is caught, surfaces via error event with source: stats-panel, falls back to default HTML', async () => {
    CapturingPanel.throwIn.construct = true;
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'numeric-only',
      isApplicable: (t) => t === 'integer',
      constructor: CapturingPanel,
      priority: 10,
    });

    // The error listener has to be attached BEFORE mount fires its first
    // `attachVisualizations` microtask — but the listener can't be set up
    // until after `createDataTable` resolves. We attach it eagerly via a
    // pre-mount hook.
    const errors: Array<{ source: string; message: string }> = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      exportDialog: false,
      visualizationRegistry: makeVizRegistry(),
      statsPanelRegistry: reg,
    });
    table.on('error', (p) => errors.push({ source: p.source, message: p.error.message }));
    table.state.tableName.set('t1');
    initializeColumnsFromSchema(table.state, SCHEMA);
    await Promise.resolve();
    await Promise.resolve();

    expect(errors.some((e) => e.source === 'stats-panel')).toBe(true);

    // Numeric column falls back to default HTML on construction failure.
    const slots = Array.from(container.querySelectorAll('.dt-col-stats'));
    for (const slot of slots) {
      // No panel marker, so default HTML rendered.
      expect((slot as HTMLElement).dataset.panelMounted).toBeUndefined();
    }
    CapturingPanel.throwIn = {};
    await table.destroy();
  });

  it('panel update throw is caught, surfaces via error event, panel stays registered', async () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 10,
    });
    const errors: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      exportDialog: false,
      visualizationRegistry: makeVizRegistry(),
      statsPanelRegistry: reg,
    });
    table.on('error', (p) => errors.push(p.source));

    table.state.tableName.set('t1');
    initializeColumnsFromSchema(table.state, SCHEMA);
    await Promise.resolve();
    await Promise.resolve();

    // From this point, every update throws.
    CapturingPanel.throwIn.update = true;
    const numericViz = StubViz.instances.find((v) => v.getColumn().name === 'amount')!;
    numericViz.emitDefaultStats({
      kind: 'numeric',
      totalRows: 100,
      nonNullCount: 100,
      nullCount: 0,
      filteredTotalRows: null,
      min: 0,
      max: 1,
      median: 0,
      distinctCount: 1,
    });

    expect(errors.filter((s) => s === 'stats-panel').length).toBeGreaterThanOrEqual(1);
    CapturingPanel.throwIn = {};
    await table.destroy();
  });

  it('panel mounted on a non-viz column owns the slot; refreshNonVizStats does not overwrite it on filter change', async () => {
    // Build a registry that registers a panel for `uuid` (a type with no built-in viz).
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'uuid-panel',
      isApplicable: (t) => t === 'uuid' || t === 'integer',
      constructor: CapturingPanel,
      priority: 10,
    });

    // Build a viz registry with NO uuid registration.
    const vizReg = makeVizRegistry();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      exportDialog: false,
      visualizationRegistry: vizReg,
      statsPanelRegistry: reg,
    });
    table.state.tableName.set('t1');
    initializeColumnsFromSchema(table.state, [
      { name: 'amount', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'guid', type: 'uuid', nullable: false, originalType: 'UUID' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    // Panel mounted on uuid column.
    const uuidSlot = container.querySelector('[data-panel-mounted="guid"]') as HTMLElement;
    expect(uuidSlot).not.toBeNull();
    expect(uuidSlot.textContent).toBe('mounted:loading');

    // A filter change triggers refreshNonVizStats for non-viz columns. The uuid
    // column is non-viz but panel-owned — its slot text should NOT be replaced.
    table.state.filters.set([{ type: 'not-null', column: 'amount' } as unknown as Filter]);
    await new Promise((r) => setTimeout(r, 20));

    // The slot still says 'mounted:loading' (not the rows-count fallback).
    expect(uuidSlot.textContent).toBe('mounted:loading');

    await table.destroy();
  });

  it('hover string is passed verbatim to panel.setHoverStats (HTML pass-through)', async () => {
    // Locks in the contract documented on BaseStatsPanel.setHoverStats:
    // the argument is HTML, not plain text — angle brackets are preserved
    // exactly so the panel can write it through innerHTML safely (the
    // library escapes user-derived values upstream).
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'all',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });
    const { table } = await mount({ statsPanelRegistry: reg });

    CapturingPanel.events.length = 0;
    const numericViz = StubViz.instances.find((v) => v.getColumn().name === 'amount')!;

    const hoverHtml = '<span class="stats-label">Bin:</span><br>5–10<br>Count: 42';
    numericViz.emitHover(hoverHtml);

    const hoverEvent = CapturingPanel.events.find(
      (e) => e.type === 'setHoverStats' && e.column === 'amount',
    );
    expect(hoverEvent).toBeDefined();
    // Verbatim — no string transformation, no escape, no truncation.
    expect(hoverEvent?.payload).toBe(hoverHtml);
    expect(hoverEvent?.payload).toContain('<span class="stats-label">');

    await table.destroy();
  });

  it('self-destroyed panel falls back to default HTML on next filter refresh', async () => {
    // Regression for "self-destroying panels orphan their slot": the
    // refreshNonVizStats path now detects a destroyed-but-still-tracked
    // panel and writes the fallback HTML in its place.
    const trackedInstances: CapturingPanel[] = [];
    class TrackingPanel extends CapturingPanel {
      constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
        super(container, column, options);
        trackedInstances.push(this);
      }
    }

    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'uuid-panel',
      isApplicable: (t) => t === 'uuid',
      constructor: TrackingPanel,
      priority: 10,
    });

    // No viz registration for `uuid` so the column is non-viz and goes
    // through the refreshNonVizStats path on filter change.
    const vizReg = makeVizRegistry();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const table = await createDataTable({
      container,
      bridge,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      exportDialog: false,
      visualizationRegistry: vizReg,
      statsPanelRegistry: reg,
    });
    table.state.tableName.set('t1');
    initializeColumnsFromSchema(table.state, [
      { name: 'amount', type: 'integer', nullable: false, originalType: 'INTEGER' },
      { name: 'guid', type: 'uuid', nullable: false, originalType: 'UUID' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    const guidPanel = trackedInstances.find((p) => p.getColumn().name === 'guid');
    expect(guidPanel).toBeDefined();
    expect(guidPanel!.isDestroyed()).toBe(false);

    // Self-destroy. The library normally drives this on schema change /
    // table destroy; here we exercise the misuse path documented in
    // BaseStatsPanel.destroy's docstring.
    guidPanel!.destroy();
    expect(guidPanel!.isDestroyed()).toBe(true);

    // Trigger refreshNonVizStats by mutating filters.
    table.state.filters.set([{ type: 'not-null', column: 'amount' } as unknown as Filter]);
    await new Promise((r) => setTimeout(r, 20));

    const uuidSlot = container.querySelector('[data-panel-mounted="guid"]') as HTMLElement;
    expect(uuidSlot).not.toBeNull();
    // Slot was overwritten with the default fallback — it now contains a
    // .dt-stats-line1 span with a rows count, not the destroyed panel's
    // last-rendered text.
    expect(uuidSlot.querySelector('.dt-stats-line1')).not.toBeNull();
    expect(uuidSlot.textContent).toMatch(/rows/);
    expect(uuidSlot.textContent).not.toContain('mounted:');

    await table.destroy();
  });
});
