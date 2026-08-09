/**
 * What `createDataTable` hangs off the header row now that the row is
 * windowed.
 *
 * `TableContainer` mounts only the columns near the horizontal viewport, so
 * "every column's header" is not a thing that exists at any one moment, and
 * the two per-header decorations the facade owns — a custom stats panel, and
 * the visualization container the controller draws into — moved from a sweep
 * over `getColumnHeaders()` to the `onHeaderMount` / `onHeaderUnmount` hooks.
 * `TableContainer.headerWindow.test.ts` covers the firing discipline of the
 * hooks themselves; this covers what the facade does with them.
 *
 * jsdom reports `clientWidth === 0`, so the pixel overscan collapses and
 * `MIN_OVERSCAN_COLUMNS` is the whole window: ten headers at `scrollLeft = 0`
 * out of thirty columns, and `[start - 10, start + 10)` at any offset past it.
 * Twenty columns therefore have no header at load, which is the condition
 * every test here needs and the reason the fixture is thirty wide.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  createDataTable,
  StatsPanelRegistry,
  VisualizationRegistry,
  type DataTable,
} from '@/index';
import type { SessionStore } from '@/persistence/SessionStore';
import { DEFAULT_COLUMN_WIDTH, MIN_OVERSCAN_COLUMNS } from '@/table/ColumnWindow';
import { BaseStatsPanel, type StatsPanelOptions } from '@/visualizations/BaseStatsPanel';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { VizDataController } from '@/visualizations/VizDataController';

import { headerColumns } from './helpers/headerDom';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // BaseVisualization eagerly creates a canvas + 2D context; jsdom implements
  // no `getContext`, so the create path needs one to exist.
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

const COLUMNS = 30;
/** Every fifth column has a type the visualization registry does not claim. */
const isVizColumn = (index: number): boolean => index % 5 !== 4;
const columnName = (index: number): string => `col_${String(index).padStart(2, '0')}`;

const SCHEMA: ColumnSchema[] = Array.from({ length: COLUMNS }, (_, i) =>
  isVizColumn(i)
    ? { name: columnName(i), type: 'integer' as const, nullable: false, originalType: 'INTEGER' }
    : { name: columnName(i), type: 'uuid' as const, nullable: false, originalType: 'UUID' },
);
/** The list `sync()` owes the controller: viz-applicable, in display order. */
const VIZ_COLUMNS = SCHEMA.filter((c) => c.type === 'integer').map((c) => c.name);
const isViz = (name: string): boolean => VIZ_COLUMNS.includes(name);
const sorted = (names: string[]): string[] => [...names].sort();

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

/** Chart that makes no query, and says when it exists and when it stops. */
class StubViz extends BaseVisualization {
  /** Columns with a live instance right now — the canvas count, by name. */
  static live = new Set<string>();

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    StubViz.live.add(column.name);
  }

  async fetchData(): Promise<void> {}
  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}

  destroy(): void {
    StubViz.live.delete(this.getColumn().name);
    super.destroy();
  }
}

interface PanelEvent {
  type: 'construct' | 'destroy';
  column: string;
}

/** Stats panel that records only its own lifetime. */
class SpyPanel extends BaseStatsPanel {
  static events: PanelEvent[] = [];

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    SpyPanel.events.push({ type: 'construct', column: column.name });
    this.container.dataset.panelMounted = column.name;
  }

  update(): void {}

  destroy(): void {
    SpyPanel.events.push({ type: 'destroy', column: this.getColumn().name });
    this.container.replaceChildren();
    super.destroy();
  }
}

/**
 * Columns holding a panel that was constructed and not destroyed, from
 * `events[from..]`.
 *
 * `activeStatsPanels` is private and the panels themselves are the only
 * evidence of it, so the live set is reconstructed from the log. Net rather
 * than raw counts because an attach pass legitimately destroys and rebuilds
 * every panel it owns.
 */
function livePanelColumns(from = 0): string[] {
  const net = new Map<string, number>();
  for (const event of SpyPanel.events.slice(from)) {
    net.set(event.column, (net.get(event.column) ?? 0) + (event.type === 'construct' ? 1 : -1));
  }
  return sorted([...net].filter(([, count]) => count > 0).map(([name]) => name));
}

function eventColumns(events: PanelEvent[], type: PanelEvent['type']): string[] {
  return sorted(events.filter((event) => event.type === type).map((event) => event.column));
}

function makeVizRegistry(): VisualizationRegistry {
  const reg = new VisualizationRegistry();
  reg.resetToDefaults();
  // The stub replaces the built-ins for numeric columns only, so `uuid` stays
  // a column the registry does not claim — the non-viz half of the fixture.
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub-numeric',
    isApplicable: (t: string) => t === 'integer' || t === 'float' || t === 'decimal',
    constructor: StubViz as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

function makePanelRegistry(): StatsPanelRegistry {
  const reg = new StatsPanelRegistry();
  reg.register({
    name: 'spy',
    isApplicable: () => true,
    constructor: SpyPanel,
    priority: 10,
  });
  return reg;
}

/**
 * Every `sync()` the facade drove, with the controller that received it.
 *
 * Recorded through a pass-through spy on the prototype because the controller
 * is `@internal` and `createDataTable` exposes no handle to it, while the
 * column list it is handed is precisely the thing under test. The spy calls
 * the real implementation, so the table behaves exactly as it would without
 * it.
 */
const syncCalls: Array<{ controller: VizDataController; columns: string[] }> = [];
let syncSpy: ReturnType<typeof vi.spyOn> | null = null;

interface Harness {
  table: DataTable;
  /** The element the table was mounted into. */
  host: HTMLElement;
  errors: string[];
  /** Scroll sideways and re-window both axes, the way a scroll frame does. */
  scrollTo(left: number): void;
  /** The `.dt-col-stats` slot of a mounted column. */
  statsSlot(column: string): HTMLElement;
}

async function mount(
  opts: { statsPanelRegistry?: StatsPanelRegistry; visualizations?: false } = {},
): Promise<Harness> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const errors: string[] = [];
  const table = await createDataTable({
    container: host,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry: makeVizRegistry(),
    statsPanelRegistry: opts.statsPanelRegistry,
    ...(opts.visualizations === false ? { visualizations: false as const } : {}),
  });
  table.on('error', (p) => errors.push(`${p.source}: ${p.error.message}`));

  // Drive a fake load: `scheduleAttach` reads both before the attach pass, and
  // the headers mount synchronously on the `visibleColumns` write.
  table.state.tableName.set('t1');
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();

  return {
    table,
    host,
    errors,
    scrollTo(left: number) {
      table.container.getScrollContainer().scrollLeft = left;
      table.container.refreshColumnWindow();
    },
    statsSlot(column: string) {
      const header = table.container.getColumnHeaders().find((h) => h.getColumn().name === column);
      if (!header) throw new Error(`${column} is not mounted`);
      return header.getStatsElement();
    },
  };
}

/** Let the microtask-coalesced stats refresh and any filter query settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  SpyPanel.events = [];
  StubViz.live = new Set();
  syncCalls.length = 0;
  const realSync = VizDataController.prototype.sync;
  syncSpy = vi.spyOn(VizDataController.prototype, 'sync').mockImplementation(function (
    this: VizDataController,
    ...args: unknown[]
  ) {
    const [columns, generation, opts] = args as Parameters<VizDataController['sync']>;
    syncCalls.push({ controller: this, columns: columns.map((c) => c.name) });
    realSync.call(this, columns, generation, opts);
  } as never);
});

afterEach(() => {
  syncSpy?.mockRestore();
  syncSpy = null;
  document.body.innerHTML = '';
});

describe('DataTable + a windowed header row', () => {
  it('mounts a stats panel with its header and destroys it when the header goes', async () => {
    const h = await mount({ statsPanelRegistry: makePanelRegistry() });

    const first = headerColumns(h.host);
    // The premise: two thirds of the table has no header to decorate.
    expect(first).toHaveLength(MIN_OVERSCAN_COLUMNS);
    expect(first.length).toBeLessThan(COLUMNS);
    // A panel per mounted header and not one more. The registry claims every
    // column here, so a pass that still built panels per *column* would show
    // thirty.
    expect(livePanelColumns()).toEqual(sorted(first));

    const mark = SpyPanel.events.length;
    h.scrollTo(DEFAULT_COLUMN_WIDTH * 15);
    const second = headerColumns(h.host);
    const events = SpyPanel.events.slice(mark);

    const gone = first.filter((c) => !second.includes(c));
    const arrived = second.filter((c) => !first.includes(c));
    expect(gone.length).toBeGreaterThan(0);
    expect(arrived.length).toBeGreaterThan(0);

    // A panel's DOM lives inside its header, so a header that scrolls away
    // takes the panel's markup with it whatever anyone does. What is at stake
    // is the `destroy()` its author was promised — the hook to close a socket,
    // abort a fetch, unregister a listener — and the entry in the facade's
    // panel map, which would otherwise grow by one for every column the user
    // ever scrolls past.
    expect(eventColumns(events, 'destroy')).toEqual(sorted(gone));
    expect(eventColumns(events, 'construct')).toEqual(sorted(arrived));
    expect(livePanelColumns()).toEqual(sorted(second));

    await h.table.destroy();
    expect(livePanelColumns()).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('hands sync() every viz-applicable column, not the mounted window', async () => {
    const h = await mount();

    const mounted = headerColumns(h.host);
    expect(mounted.length).toBeLessThan(VIZ_COLUMNS.length);

    // The controller's contract is the full viz-applicable set in display
    // order, however few of them have a header. Handing it the mounted subset
    // instead is not a smaller version of the same thing: `sync()` destroys
    // every chart it is not told about, so each pass would reclaim the canvas
    // of every column outside the window, discard its queued fetch and re-arm
    // `whenVizReady`.
    const last = syncCalls.at(-1);
    expect(last).toBeDefined();
    expect(last!.columns).toEqual(VIZ_COLUMNS);
    expect(sorted(last!.controller.getColumnNames())).toEqual(sorted(VIZ_COLUMNS));

    // And the consequence, which is what a user would report: a column the
    // controller tracks gets its chart the moment its header arrives. A column
    // missing from `sync()` has no entry, so `observeColumn` drops its mount
    // and it stays blank for the life of the table.
    expect(sorted([...StubViz.live])).toEqual(sorted(mounted.filter(isViz)));

    h.scrollTo(DEFAULT_COLUMN_WIDTH * 15);
    const after = headerColumns(h.host);
    expect(after).not.toEqual(mounted);
    expect(sorted([...StubViz.live])).toEqual(sorted(after.filter(isViz)));
    // Named explicitly: this one was outside the window at load, so its chart
    // exists only because the mount hook reached an entry `sync()` had made.
    expect([...StubViz.live]).toContain('col_20');

    await h.table.destroy();
  });

  it('refreshes the stats line of the mounted headers and of nothing else', async () => {
    const h = await mount();
    h.table.state.totalRows.set(1000);

    // Hold each slot and what it says now. After the scroll these are detached
    // but perfectly writable, so a refresh that still knew about them would
    // rewrite them silently — nothing throws, nothing is visible, and the pass
    // is back to costing one `innerHTML` per column of the whole table.
    const stranded = new Map<string, { el: HTMLElement; html: string }>();
    for (const header of h.table.container.getColumnHeaders()) {
      const el = header.getStatsElement();
      stranded.set(header.getColumn().name, { el, html: el.innerHTML });
    }

    h.scrollTo(DEFAULT_COLUMN_WIDTH * 15);
    const after = headerColumns(h.host);
    const gone = [...stranded.keys()].filter((c) => !after.includes(c));
    expect(gone.length).toBeGreaterThan(0);

    h.table.state.filters.set([{ type: 'not-null', column: 'col_00' } as unknown as Filter]);
    await settle();

    for (const name of gone) {
      const slot = stranded.get(name)!;
      expect(slot.el.innerHTML, `${name} is unmounted; its slot must be left alone`).toBe(
        slot.html,
      );
    }

    // The columns still on screen did get the filtered line — a refresh that
    // skipped them would leave a stale "1,000 rows" under an active filter,
    // which is the failure the pass exists to prevent. Only the ones with no
    // chart: a charted column's own `onDefaultStatsChange` owns its slot.
    const refreshed = after.filter((c) => !isViz(c));
    expect(refreshed.length).toBeGreaterThan(0);
    for (const name of refreshed) {
      expect(h.statsSlot(name).textContent, name).toBe('0 / 1,000 rows');
    }
    expect(h.errors).toEqual([]);

    await h.table.destroy();
  });

  it('seeds a header that scrolls in under a filter, with charts off', async () => {
    const h = await mount({ visualizations: false });
    h.table.state.totalRows.set(1000);
    h.table.state.filters.set([{ type: 'not-null', column: 'col_00' } as unknown as Filter]);
    await settle();

    const before = headerColumns(h.host);
    for (const name of before) {
      expect(h.statsSlot(name).textContent, name).toBe('0 / 1,000 rows');
    }

    h.scrollTo(DEFAULT_COLUMN_WIDTH * 15);
    const after = headerColumns(h.host);
    const arrived = after.filter((c) => !before.includes(c));
    expect(arrived.length).toBeGreaterThan(0);

    // A header is born reading `totalRows` and nothing else —
    // `ColumnHeader.updateStatsLine` knows about no filter — so one that
    // mounts while a filter is active arrives claiming the table has 1,000
    // rows when the user is looking at none of them. With charts on the seed
    // hides it; with charts off nothing else writes to the slot until the
    // *next* filter change, so the wrong number is what the user reads until
    // they filter again. Unreachable before the header row was windowed,
    // because every header existed by the time `refreshNonVizStats` ran.
    for (const name of arrived) {
      expect(h.statsSlot(name).textContent, `${name} mounted under a filter`).toBe(
        '0 / 1,000 rows',
      );
    }
    expect(h.errors).toEqual([]);

    await h.table.destroy();
  });
});
