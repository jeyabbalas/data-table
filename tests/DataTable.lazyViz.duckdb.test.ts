/**
 * @vitest-environment jsdom
 *
 * Column charts through the facade, against real DuckDB, with a fake
 * `IntersectionObserver` placing the columns side by side. Only the columns
 * in view get a chart; the rest must still show correct stats, come back
 * filter-aware, and stay reachable from Escape.
 *
 * Columns are 100 px wide in a 250 px viewport, so the create band
 * (200 px each side) holds c0–c4 and the keep band (400 px) c0–c6.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createDataTable,
  StatsPanelRegistry,
  VisualizationRegistry,
  type CreateDataTableOptions,
  type DataTable,
  type DataTableError,
} from '@/index';
import { STATS_PANEL_SETTLE_MS } from '@/DataTable';
import { QueryError } from '@/core/errors';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { SessionStore } from '@/persistence/SessionStore';
import type { ColumnStatsData } from '@/statistics/ColumnStatsTypes';
import { BaseStatsPanel, type StatsPanelOptions } from '@/visualizations/BaseStatsPanel';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { FakeIntersectionWorld } from './helpers/fakeIntersectionObserver';
import { makeNodeBridge } from './helpers/nodeBridge';

const COLUMNS = 12;
const NAMES = Array.from({ length: COLUMNS }, (_, i) => `c${i}`);
/** Even columns are categorical (value counts), odd ones integers (histograms). */
const SCHEMA: ColumnSchema[] = NAMES.map((name, i) =>
  i % 2 === 0
    ? { name, type: 'string', nullable: true, originalType: 'VARCHAR' }
    : { name, type: 'integer', nullable: true, originalType: 'INTEGER' },
);

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;

let harness: NodeDuckDBHarness | undefined;
let world: FakeIntersectionWorld;

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // The facade's controller builds its observers through the global class.
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
      return world.factory(callback, init);
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 150,
      height: 60,
      top: 0,
      left: 0,
      bottom: 60,
      right: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  const ctx = new Proxy(
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
  );
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

  harness = await createNodeDuckDB();
  // 20 rows. Even columns: 'US' on rows 1–8, 'CA' on 9–20. Odd: the row id.
  const select = NAMES.map((name, i) =>
    i % 2 === 0 ? `CASE WHEN id <= 8 THEN 'US' ELSE 'CA' END AS ${name}` : `id AS ${name}`,
  ).join(', ');
  await harness.conn.query(`
    CREATE TABLE lazy_viz AS
    SELECT ${select}, id - 1 AS __rowid__ FROM range(1, 21) t(id)
  `);
}, 30_000);

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  await harness?.cleanup();
});

afterEach(() => {
  document.body.innerHTML = '';
});

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
  /** Every SQL statement the table has run. */
  queries: string[];
  /**
   * Whether a chart query has run for `column`. The body's row query names
   * every column, so a chart query is one that names `column` without `c5`,
   * a column no test filters on.
   */
  chartQueried: (column: string) => boolean;
  slot: (column: string) => string;
  charts: () => string[];
  /**
   * Hold the queries `match` accepts — before they run, or with `afterRun`
   * after they run and before they return — until `release()`.
   */
  hold: (
    match: (sql: string) => boolean,
    afterRun?: boolean,
  ) => { held: () => number; release: () => void };
  /**
   * Fail the queries `match` accepts, without running them, until `stop()`:
   * each with `error` when given, one instance for all, as a worker that
   * fails every request in flight does.
   */
  fail: (match: (sql: string) => boolean, error?: Error) => { stop: () => void };
}

interface Gate {
  match: (sql: string) => boolean;
  afterRun: boolean;
  waiting: (() => void)[];
}

async function mount(options: Partial<CreateDataTableOptions> = {}): Promise<Mounted> {
  world = new FakeIntersectionWorld();
  world.viewportWidth = 250;
  world.placeRow(NAMES, 100);

  const queries: string[] = [];
  let gate: Gate | null = null;
  let failing: ((sql: string) => boolean) | null = null;
  let failure: Error | undefined;
  const wait = (g: Gate): Promise<void> => new Promise((resolve) => g.waiting.push(resolve));
  const base = makeNodeBridge(harness!.conn);
  const bridge = {
    ...base,
    query: async (sql: string, ...rest: unknown[]) => {
      queries.push(sql);
      if (failing?.(sql))
        throw failure ?? new Error('Out of Memory Error: could not allocate block');
      const held = gate?.match(sql) ? gate : null;
      if (held && !held.afterRun) await wait(held);
      const result = await (base.query as (...args: unknown[]) => Promise<unknown>)(sql, ...rest);
      if (held?.afterRun) await wait(held);
      return result;
    },
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
  } as unknown as ReturnType<typeof makeNodeBridge>;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge,
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    expressionFilter: false,
    exportDialog: false,
    ...options,
  });
  table.state.tableName.set('lazy_viz');
  table.state.baseTableName.set('lazy_viz');
  table.state.totalRows.set(20);
  table.state.filteredRows.set(20);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  world.flush();

  const header = (column: string) =>
    container.querySelector(`.dt-col-header[data-column="${column}"]`) as HTMLElement;
  return {
    table,
    container,
    queries,
    chartQueried: (column) =>
      queries.some((sql) => sql.includes(`"${column}"`) && !sql.includes('"c5"')),
    slot: (column) => header(column).querySelector('.dt-col-stats')?.textContent ?? '',
    charts: () => NAMES.filter((name) => !!header(name).querySelector('.dt-col-viz canvas')),
    hold: (match, afterRun = false) => {
      const g: Gate = { match, afterRun, waiting: [] };
      gate = g;
      return {
        held: () => g.waiting.length,
        release: () => {
          if (gate === g) gate = null;
          for (const resolve of g.waiting.splice(0)) resolve();
        },
      };
    },
    fail: (match, error) => {
      failing = match;
      failure = error;
      return {
        stop: () => {
          if (failing === match) failing = null;
        },
      };
    },
  };
}

async function waitForSlot(m: Mounted, column: string, expected: string | RegExp): Promise<void> {
  await vi.waitFor(
    () => {
      const text = m.slot(column);
      if (expected instanceof RegExp) expect(text).toMatch(expected);
      else expect(text).toContain(expected);
    },
    { timeout: 5000 },
  );
}

/** Scroll the header row and let the observers report. */
function scrollTo(left: number): void {
  world.scrollTo(left);
}

/** Let the attach pass a header rebuild schedules run, then report. */
async function afterRebuild(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  world.flush();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A panel that shows the row count its chart reports, as the guide's example does. */
class CountPanel extends BaseStatsPanel {
  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    this.update(null);
  }

  update(stats: ColumnStatsData | null): void {
    this.container.textContent = stats ? `panel ${stats.nonNullCount} rows` : 'panel …';
  }

  override destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }
}

/** A {@link CountPanel} that records the column and relation of each one built. */
class RecordingPanel extends CountPanel {
  static built: string[] = [];
  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    RecordingPanel.built.push(`${column.name}@${options.tableName}`);
  }
}

function recordingPanels(): StatsPanelRegistry {
  const registry = new StatsPanelRegistry();
  registry.register({
    name: 'count',
    isApplicable: (type) => type === 'integer',
    constructor: RecordingPanel,
    priority: 10,
  });
  return registry;
}

/** A {@link CountPanel} that shows the hover or selection detail it is given. */
class DetailPanel extends CountPanel {
  private detail = '';
  override update(stats: ColumnStatsData | null): void {
    super.update(stats);
    if (this.detail) this.container.append(` · ${this.detail}`);
  }
  override setHoverStats(html: string | null): void {
    this.detail = html ?? '';
    this.update(null);
  }
}

/** A panel whose constructor throws. */
class ThrowingPanel extends BaseStatsPanel {
  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    throw new Error(`no panel for ${column.name}`);
  }
  update(): void {}
}

/** A custom chart whose constructor throws after the base class added its canvas. */
class ThrowingChart extends BaseVisualization {
  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    throw new Error(`cannot chart ${column.name}`);
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

/**
 * A custom chart whose fetches for c1 follow `script`, one step each:
 * `ok:<n>` reports stats with `n` rows through the filters (0 for none),
 * `detail:<n>` reports them and a hover detail too, `wait` parks the fetch
 * until the test settles it, `fail` throws. With `silent`, a fetch that
 * does not throw reports nothing, as a chart without stats of its own does.
 */
class ScriptedChart extends BaseVisualization {
  static script: string[] = [];
  static parked: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  static instances: ScriptedChart[] = [];
  static silent = false;

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    if (column.name === 'c1') ScriptedChart.instances.push(this);
    this.dataPromise = this.fetchData();
  }

  static reset(script: string[], { silent = false } = {}): VisualizationRegistry {
    ScriptedChart.script = script;
    ScriptedChart.parked = [];
    ScriptedChart.instances = [];
    ScriptedChart.silent = silent;
    const registry = new VisualizationRegistry();
    registry.register({
      name: 'scripted',
      isApplicable: (type) => type === 'integer',
      constructor: ScriptedChart,
      priority: 100,
    });
    return registry;
  }

  async fetchData(): Promise<void> {
    const step = this.column.name === 'c1' ? (ScriptedChart.script.shift() ?? 'ok:0') : 'ok:0';
    if (step === 'wait') {
      await new Promise<void>((resolve, reject) => ScriptedChart.parked.push({ resolve, reject }));
      return;
    }
    if (step === 'fail') throw new Error('scripted failure');
    if (ScriptedChart.silent) return;
    const filtered = Number(step.split(':')[1]);
    if (step.startsWith('detail:')) this.options.onStatsChange?.('<b>Hovered</b> bar');
    this.options.onDefaultStatsChange?.({
      kind: 'categorical',
      totalRows: 999,
      nonNullCount: filtered || 999,
      nullCount: 0,
      filteredTotalRows: filtered || null,
      distinctCount: 2,
    });
  }

  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

/** The `error` events with `source: 'visualization'`. */
function collectVizErrorEvents(table: DataTable): DataTableError[] {
  const errors: DataTableError[] = [];
  table.on('error', ({ error, source }) => {
    if (source === 'visualization') errors.push(error);
  });
  return errors;
}

/** Messages of the `error` events with `source: 'visualization'`. */
function collectVizErrors(table: DataTable): string[] {
  const messages: string[] = [];
  table.on('error', ({ error, source }) => {
    if (source === 'visualization') messages.push(error.message);
  });
  return messages;
}

describe('lazy column charts (real DuckDB)', () => {
  it('creates charts only for the columns in view', async () => {
    const m = await mount();
    await vi.waitFor(() => expect(m.charts()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']), {
      timeout: 5000,
    });
    // No chart, and no chart query, for a column out of view.
    expect(m.slot('c11')).toBe('20 rows');
    expect(m.chartQueried('c11')).toBe(false);
    await m.table.destroy();
  }, 20_000);

  it('refreshes only the charts in view on a filter, and the rest when scrolled in', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    m.queries.length = 0;

    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rows');
    // A column with no chart shows the filtered count too.
    await waitForSlot(m, 'c11', '8 / 20 rows');
    expect(['c9', 'c10', 'c11'].some((column) => m.chartQueried(column))).toBe(false);

    // Scrolled into view, its chart is built with the filter in force.
    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).toContain('c11'), { timeout: 5000 });
    await waitForSlot(m, 'c11', /^8 \/ 20 rows.*max/);
    // Its first query already carried the filter.
    expect(
      m.queries.some(
        (sql) => sql.includes('"c11"') && sql.includes('"c0"') && !sql.includes('"c5"'),
      ),
    ).toBe(true);
    await m.table.destroy();
  }, 20_000);

  it('bounds the charts to the columns near the view while scrolling', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    // Faster than the charts can fetch: columns passed before their turn
    // are skipped, which is the point of queueing.
    for (let left = 0; left <= 950; left += 50) scrollTo(left);
    // In view at 950 px: c9–c11. Within the keep band, [550, 1600): c5–c11.
    await vi.waitFor(
      () => expect(m.charts()).toEqual(expect.arrayContaining(['c9', 'c10', 'c11'])),
      {
        timeout: 5000,
      },
    );
    expect(m.charts().every((name) => Number(name.slice(1)) >= 5)).toBe(true);
    await m.table.destroy();
  }, 20_000);

  it('brings back a selection with its chart', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c0', 'Category: US');

    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c0'), { timeout: 5000 });
    scrollTo(0);
    await vi.waitFor(() => expect(m.charts()).toContain('c0'), { timeout: 5000 });
    await waitForSlot(m, 'c0', 'Category: US');
    await m.table.destroy();
  }, 20_000);

  it('does not bring back a selection whose filter was removed while away', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c0', 'Category: US');

    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c0'), { timeout: 5000 });
    m.table.actions.removeFilter('c0');
    await waitForSlot(m, 'c1', /^20 rows/);

    scrollTo(0);
    await vi.waitFor(() => expect(m.charts()).toContain('c0'), { timeout: 5000 });
    await waitForSlot(m, 'c0', /^20 rows/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(m.slot('c0')).not.toContain('Category:');
    await m.table.destroy();
  }, 20_000);

  it('does not bring back a selection on a header rebuild after its filter was removed', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    const rebuild = async (): Promise<void> => {
      m.table.state.visibleColumns.set([...m.table.state.visibleColumns.get()]);
      await Promise.resolve();
      await Promise.resolve();
      world.flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c0', 'Category: US');
    // The rebuild saves c0's selection so it can put it back.
    await rebuild();
    await waitForSlot(m, 'c0', 'Category: US');

    m.table.actions.removeFilter('c0');
    await waitForSlot(m, 'c0', /^20 rows/);
    await rebuild();
    await waitForSlot(m, 'c0', /^20 rows/);
    expect(m.slot('c0')).not.toContain('Category:');
    await m.table.destroy();
  }, 20_000);

  it('draws the current filter on a chart re-created after it changed', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c0', 'Category: US');

    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c0'), { timeout: 5000 });
    // Changed while c0 has no chart, as undo or a preset would.
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'CA' });
    await waitForSlot(m, 'c11', '12 / 20 rows');

    scrollTo(0);
    await vi.waitFor(() => expect(m.charts()).toContain('c0'), { timeout: 5000 });
    await waitForSlot(m, 'c0', 'Category: CA');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(m.slot('c0')).not.toContain('Category: US');
    await m.table.destroy();
  }, 20_000);

  it('Escape clears the latest selection even when its chart is out of view', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows2 unique/);
    await waitForSlot(m, 'c2', /^20 rows2 unique/);

    /** Click the first segment of a value-count chart, as a user would. */
    const clickChart = (column: string): void => {
      const canvas = m.container.querySelector(
        `.dt-col-header[data-column="${column}"] .dt-col-viz canvas`,
      )!;
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 20, bubbles: true }));
    };
    clickChart('c2');
    await waitForSlot(m, 'c2', 'Category:');
    clickChart('c0');
    await waitForSlot(m, 'c0', 'Category:');
    expect(m.table.state.filters.get().map((f) => f.column)).toEqual(['c2', 'c0']);

    // Both charts leave the keep band and are destroyed.
    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c2'), { timeout: 5000 });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(m.table.state.filters.get().map((f) => f.column)).toEqual(['c2']);

    // Back in view, Escape clears c2's selection and its chart follows.
    scrollTo(0);
    await vi.waitFor(() => expect(m.charts()).toContain('c2'), { timeout: 5000 });
    await waitForSlot(m, 'c2', 'Category:');
    await new Promise((resolve) => setTimeout(resolve, 50));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(m.table.state.filters.get()).toEqual([]);
    await waitForSlot(m, 'c2', /^20 rows2 unique$/);
    await m.table.destroy();
  }, 20_000);

  it('leaves no stale stats in the slot of a chart destroyed mid-refresh', async () => {
    const m = await mount();
    await waitForSlot(m, 'c2', /^20 rows/);
    // c2's refresh for the new filter is still pending when c2 scrolls away.
    const gate = m.hold((sql) => sql.includes('"c2"') && !sql.includes('"c5"'));
    m.table.actions.addFilter({ type: 'range', column: 'c1', min: 1, max: 8, maxInclusive: true });
    await waitForSlot(m, 'c10', '8 / 20 rows');
    expect(gate.held()).toBeGreaterThan(0);
    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c2'), { timeout: 5000 });
    gate.release();
    await sleep(50);
    expect(m.slot('c2')).toBe('8 / 20 rows');
    await m.table.destroy();
  }, 20_000);

  it('puts a custom stats panel back to its initial state when its chart goes', async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    statsPanelRegistry.register({
      name: 'count',
      isApplicable: (type) => type === 'integer',
      constructor: CountPanel,
      priority: 10,
    });
    const m = await mount({ statsPanelRegistry });
    await waitForSlot(m, 'c1', 'panel 20 rows');

    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c1'), { timeout: 5000 });
    expect(m.slot('c1')).toBe('panel …');
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c11', 'panel 8 rows');
    expect(m.slot('c1')).toBe('panel …');

    // Back in view, the panel shows no count until the new chart's lands.
    const gate = m.hold((sql) => sql.includes('"c1"') && !sql.includes('"c5"'));
    scrollTo(0);
    await vi.waitFor(() => expect(m.charts()).toContain('c1'), { timeout: 5000 });
    await sleep(50);
    expect(m.slot('c1')).toBe('panel …');
    gate.release();
    await waitForSlot(m, 'c1', 'panel 8 rows');
    await m.table.destroy();
  }, 20_000);

  it('builds no chart against a VIEW a derived-column change is dropping', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    const added = await m.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'd',
      expression: 'c1 * 2',
    });
    expect(added.success).toBe(true);
    await afterRebuild();
    // The rebuilt charts in view have drawn, so none has a fetch in flight.
    for (const column of ['c0', 'c1', 'c2', 'c3', 'c4']) await waitForSlot(m, column, /^20 rows\S/);
    const errors = collectVizErrors(m.table);

    // Removing the last derived column drops the VIEW. Scroll while the
    // DROP has run but the state still names the VIEW.
    const gate = m.hold((sql) => sql.startsWith('DROP VIEW'), true);
    const removing = m.table.actions.removeDerivedColumn('d');
    await vi.waitFor(() => expect(gate.held()).toBe(1), { timeout: 5000 });
    scrollTo(900);
    await sleep(50);
    gate.release();
    await removing;
    await afterRebuild();
    await vi.waitFor(
      () => expect(m.charts()).toEqual(expect.arrayContaining(['c9', 'c10', 'c11'])),
      { timeout: 5000 },
    );
    expect(errors).toEqual([]);
    await m.table.destroy();
  }, 20_000);

  it('builds the charts skipped during a derived-column change that fails', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows/);
    const gate = m.hold((sql) => sql.includes('no_such_col'));
    const adding = m.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'bad',
      expression: 'no_such_col + 1',
    });
    await vi.waitFor(() => expect(gate.held()).toBe(1), { timeout: 5000 });
    scrollTo(900);
    await sleep(50);
    expect(m.charts()).not.toContain('c11');

    // No header rebuild follows a failed change; the charts come anyway.
    gate.release();
    expect((await adding).success).toBe(false);
    await vi.waitFor(
      () => expect(m.charts()).toEqual(expect.arrayContaining(['c9', 'c10', 'c11'])),
      { timeout: 5000 },
    );
    await m.table.destroy();
  }, 20_000);

  it('shows the table-wide count when a panel fails to build for a column whose chart has gone', async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    const m = await mount({ statsPanelRegistry });
    await waitForSlot(m, 'c1', /^20 rows\S/);
    scrollTo(900);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c1'), { timeout: 5000 });
    expect(m.slot('c1')).toBe('20 rows');

    // A panel that throws, first tried as the columns mounted change.
    statsPanelRegistry.register({
      name: 'throwing',
      isApplicable: (type) => type === 'integer',
      constructor: ThrowingPanel,
      priority: 10,
    });
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    // Past the build that follows the mounted columns holding still.
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(m.slot('c1')).toBe('20 rows');
    await m.table.destroy();
  }, 20_000);

  it('builds no stats panel against a VIEW a derived-column change is dropping', async () => {
    const m = await mount({ statsPanelRegistry: recordingPanels() });
    await waitForSlot(m, 'c1', 'panel 20 rows');
    const added = await m.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'd',
      expression: 'c1 * 2',
    });
    expect(added.success).toBe(true);
    await afterRebuild();
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    RecordingPanel.built = [];

    // Shown while the DROP has run but the state still names the VIEW.
    const gate = m.hold((sql) => sql.startsWith('DROP VIEW'), true);
    const removing = m.table.actions.removeDerivedColumn('d');
    await vi.waitFor(() => expect(gate.held()).toBe(1), { timeout: 5000 });
    m.table.actions.showColumn('c3');
    await afterRebuild();
    // Past the time panels wait for the mounted columns to hold still.
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(RecordingPanel.built).toEqual([]);

    gate.release();
    await removing;
    await afterRebuild();
    await vi.waitFor(() => expect(RecordingPanel.built).toContain('c3@lazy_viz'), {
      timeout: 5000,
    });
    expect(RecordingPanel.built.every((panel) => panel.endsWith('@lazy_viz'))).toBe(true);
    await m.table.destroy();
  }, 20_000);

  it('builds the stats panels skipped during a derived-column change that fails', async () => {
    const m = await mount({ statsPanelRegistry: recordingPanels() });
    await waitForSlot(m, 'c1', 'panel 20 rows');
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    RecordingPanel.built = [];

    const gate = m.hold((sql) => sql.includes('no_such_col'));
    const adding = m.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'bad',
      expression: 'no_such_col + 1',
    });
    await vi.waitFor(() => expect(gate.held()).toBe(1), { timeout: 5000 });
    m.table.actions.showColumn('c3');
    await afterRebuild();
    // Past the time panels wait for the mounted columns to hold still.
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(RecordingPanel.built).toEqual([]);

    // No header rebuild follows a failed change; the panel comes anyway.
    gate.release();
    expect((await adding).success).toBe(false);
    await vi.waitFor(() => expect(RecordingPanel.built).toEqual(['c3@lazy_viz']), {
      timeout: 5000,
    });
    await m.table.destroy();
  }, 20_000);

  it('shows a chart whose refetch fails as failed, without the stats or detail it had', async () => {
    const m = await mount();
    const errors = collectVizErrorEvents(m.table);
    await waitForSlot(m, 'c0', /^20 rows/);
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    m.table.actions.addFilter({ type: 'range', column: 'c1', min: 1, max: 4, maxInclusive: true });
    await waitForSlot(m, 'c0', 'Category: US');
    await waitForSlot(m, 'c1', 'Bin:');
    const failed = (column: string): boolean =>
      m.container
        .querySelector(`.dt-col-header[data-column="${column}"] .dt-col-viz canvas`)!
        .hasAttribute('data-fetch-failed');

    // Every chart query fails; the count and the rows (which read c5) do not.
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'range', column: 'c3', min: 1, max: 20, maxInclusive: true });
    await vi.waitFor(() => expect(failed('c0') && failed('c1')).toBe(true), { timeout: 5000 });

    // The table-wide count, nothing from before the failure, and the failure
    // in text.
    expect(m.slot('c0')).toBe('4 / 20 rowsFailed to load');
    expect(m.slot('c1')).toBe('4 / 20 rowsFailed to load');
    const columns = errors.map((error) => error.details?.column);
    expect(columns).toEqual(expect.arrayContaining(['c0', 'c1']));
    expect(columns.every((column) => typeof column === 'string')).toBe(true);
    expect(errors.find((error) => error.details?.column === 'c1')!.details).toMatchObject({
      stage: 'fetch',
    });

    // The next refetch lands, and brings back each selection's detail.
    failing.stop();
    m.table.actions.removeFilter('c3');
    await waitForSlot(m, 'c0', 'Category: US');
    await waitForSlot(m, 'c1', 'Bin:');
    expect(failed('c0') || failed('c1')).toBe(false);
    await m.table.destroy();
  }, 20_000);

  it('names its own column on each error when charts fail with one error', async () => {
    const m = await mount();
    const errors = collectVizErrorEvents(m.table);
    const columnsAtEmit: string[] = [];
    m.table.on('error', ({ error, source }) => {
      if (source === 'visualization') columnsAtEmit.push(String(error.details?.column));
    });
    await waitForSlot(m, 'c1', /min/);
    await waitForSlot(m, 'c3', /min/);

    // One instance for every query, as a worker failing all requests does.
    const shared = new QueryError('worker failed', { code: 'QUERY_RUNTIME' });
    const failing = m.fail(
      (sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'),
      shared,
    );
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await vi.waitFor(() => expect(errors.length).toBeGreaterThanOrEqual(4), { timeout: 5000 });
    failing.stop();

    // Read later, each still names the column it was emitted for.
    expect(errors.map((error) => String(error.details?.column))).toEqual(columnsAtEmit);
    expect(new Set(columnsAtEmit).size).toBeGreaterThanOrEqual(4);
    expect(shared.details).toBeUndefined();
    // The histograms' filtered fetches pass the error on as it came: each
    // event has a copy, of the same class, with the same message and stack.
    const passedOn = errors.filter((error) => error.message === 'worker failed');
    expect(passedOn.length).toBeGreaterThanOrEqual(2);
    for (const error of passedOn) {
      expect(error).not.toBe(shared);
      expect(error).toBeInstanceOf(QueryError);
      expect(error.code).toBe('QUERY_RUNTIME');
      expect(error.stack).toBe(shared.stack);
    }
    await m.table.destroy();
  }, 20_000);

  it("drops the stats a column's panel shows when its chart's refetch fails", async () => {
    const m = await mount({ statsPanelRegistry: recordingPanels() });
    await waitForSlot(m, 'c1', 'panel 20 rows');
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', 'panel 8 rows');

    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'range', column: 'c3', min: 1, max: 20, maxInclusive: true });
    await waitForSlot(m, 'c1', 'panel …');
    failing.stop();

    // The table-wide count a failed chart's slot shows is kept current, but
    // not over a panel.
    m.table.state.filteredRows.set(3);
    await sleep(0);
    expect(m.slot('c1')).toBe('panel …');
    await m.table.destroy();
  }, 20_000);

  it('gives a panel built after its chart failed no stats from before the failure', async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    const m = await mount({ statsPanelRegistry });
    await waitForSlot(m, 'c1', /^20 rows\S/);
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', 'Failed to load');
    failing.stop();

    // A panel for c1, built while its failed chart lives.
    statsPanelRegistry.register({
      name: 'count',
      isApplicable: (type) => type === 'integer',
      constructor: CountPanel,
      priority: 10,
    });
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(m.slot('c1')).toBe('panel …');
    await m.table.destroy();
  }, 20_000);

  it("drops a custom chart's stats when a fetch for a filter change throws", async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset([]) });
    await waitForSlot(m, 'c1', '999 rows');
    ScriptedChart.script = ['fail'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsFailed to load');
    await m.table.destroy();
  }, 20_000);

  it("keeps a custom chart's stats when a refetch a newer one superseded fails", async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset([]) });
    const errors = collectVizErrorEvents(m.table);
    await waitForSlot(m, 'c1', '999 rows');
    // The first filter change parks c1's refetch; the second lands at once.
    ScriptedChart.script = ['wait', 'ok:555'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await vi.waitFor(() => expect(ScriptedChart.parked).toHaveLength(1), { timeout: 5000 });
    m.table.actions.addFilter({ type: 'range', column: 'c3', min: 1, max: 20, maxInclusive: true });
    await waitForSlot(m, 'c1', '555 / 999');

    ScriptedChart.parked[0]!.reject(new Error('late failure'));
    await sleep(50);
    expect(m.slot('c1')).toContain('555 / 999');
    expect(m.slot('c1')).not.toContain('Failed to load');
    // Reported all the same.
    expect(errors.map((error) => error.details?.column)).toEqual(['c1']);
    await m.table.destroy();
  }, 20_000);

  it("keeps a successor's stats when a destroyed custom chart's refetch fails", async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset([]) });
    const errors = collectVizErrorEvents(m.table);
    await waitForSlot(m, 'c1', '999 rows');
    ScriptedChart.script = ['wait'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await vi.waitFor(() => expect(ScriptedChart.parked).toHaveLength(1), { timeout: 5000 });

    // Scrolled out of the keep band, c1's chart goes; back, a new one comes.
    ScriptedChart.script = ['ok:444'];
    scrollTo(1100);
    await vi.waitFor(() => expect(ScriptedChart.instances[0]!.isDestroyed()).toBe(true), {
      timeout: 5000,
    });
    scrollTo(0);
    await waitForSlot(m, 'c1', '444 / 999');

    ScriptedChart.parked[0]!.reject(new Error('late failure'));
    await sleep(50);
    expect(m.slot('c1')).toContain('444 / 999');
    expect(m.slot('c1')).not.toContain('Failed to load');
    expect(errors.map((error) => error.details?.column)).toEqual(['c1']);
    await m.table.destroy();
  }, 20_000);

  it('does not say a custom chart without stats of its own failed', async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset([], { silent: true }) });
    const errors = collectVizErrorEvents(m.table);
    await waitForSlot(m, 'c1', /^20 rows$/);
    ScriptedChart.script = ['fail'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await vi.waitFor(() => expect(errors).toHaveLength(1), { timeout: 5000 });
    // As on main: the slot shows the table-wide count, which nothing would
    // take back from "Failed to load" once the chart recovers.
    await waitForSlot(m, 'c1', /^8 \/ 20 rows$/);

    ScriptedChart.script = ['ok'];
    m.table.actions.addFilter({ type: 'range', column: 'c3', min: 1, max: 4, maxInclusive: true });
    await waitForSlot(m, 'c1', /^4 \/ 20 rows$/);
    expect(errors).toHaveLength(1);
    await m.table.destroy();
  }, 20_000);

  it('keeps the count current for a custom chart without stats of its own', async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset([], { silent: true }) });
    await waitForSlot(m, 'c1', /^20 rows$/);
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', /^8 \/ 20 rows$/);
    await m.table.destroy();
  }, 20_000);

  it('says a built-in chart whose first fetch fails failed', async () => {
    const m = await mount();
    await waitForSlot(m, 'c1', /^20 rows\S/);
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    scrollTo(900);
    await waitForSlot(m, 'c9', '20 rowsFailed to load');
    failing.stop();
    await m.table.destroy();
  }, 20_000);

  it("drops the detail a panel shows when a custom chart's fetch fails", async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    statsPanelRegistry.register({
      name: 'detail',
      isApplicable: (type) => type === 'integer',
      constructor: DetailPanel,
      priority: 10,
    });
    const m = await mount({
      visualizationRegistry: ScriptedChart.reset(['detail:0']),
      statsPanelRegistry,
    });
    await waitForSlot(m, 'c1', 'Hovered');
    ScriptedChart.script = ['fail'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', /^panel …$/);
    await m.table.destroy();
  }, 20_000);

  it('gives a panel built after a custom chart failed no detail from before', async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    const m = await mount({
      visualizationRegistry: ScriptedChart.reset(['detail:0']),
      statsPanelRegistry,
    });
    await waitForSlot(m, 'c1', 'Hovered');
    ScriptedChart.script = ['fail'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsFailed to load');

    statsPanelRegistry.register({
      name: 'detail',
      isApplicable: (type) => type === 'integer',
      constructor: DetailPanel,
      priority: 10,
    });
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(m.slot('c1')).toBe('panel …');
    await m.table.destroy();
  }, 20_000);

  it("drops a custom chart's hover detail when its fetch fails", async () => {
    const m = await mount({ visualizationRegistry: ScriptedChart.reset(['detail:0']) });
    await waitForSlot(m, 'c1', 'Hovered bar');
    ScriptedChart.script = ['fail'];
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsFailed to load');
    expect(m.slot('c1')).not.toContain('Hovered');
    await m.table.destroy();
  }, 20_000);

  it('says a chart failed in the messages given', async () => {
    const m = await mount({ messages: { statistics: { chartFailed: 'Échec du chargement' } } });
    await waitForSlot(m, 'c1', /^20 rows\S/);
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsÉchec du chargement');
    failing.stop();
    await m.table.destroy();
  }, 20_000);

  it('emits a native error, of the class, code, cause and stack the chart reported', async () => {
    const m = await mount();
    const errors = collectVizErrorEvents(m.table);
    await waitForSlot(m, 'c1', /min/);
    const raw = new Error('Out of Memory Error');
    const original = new QueryError('boom', {
      code: 'QUERY_RUNTIME',
      cause: raw,
      details: { sql: 'x' },
    });
    const failing = m.fail(
      (sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'),
      original,
    );
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await vi.waitFor(() => expect(errors.some((e) => e.message === 'boom')).toBe(true), {
      timeout: 5000,
    });
    failing.stop();

    const copy = errors.find((error) => error.message === 'boom')!;
    expect(copy).not.toBe(original);
    expect(copy).toBeInstanceOf(QueryError);
    expect(copy).toBeInstanceOf(Error);
    expect(Object.prototype.toString.call(copy)).toBe('[object Error]');
    expect(copy.name).toBe('QueryError');
    expect(copy.code).toBe('QUERY_RUNTIME');
    expect(copy.cause).toBe(raw);
    expect(copy.stack).toBe(original.stack);
    expect(copy.details).toMatchObject({ sql: 'x', stage: 'fetch' });
    expect(typeof copy.details?.column).toBe('string');
    expect(original.details).toEqual({ sql: 'x' });
    expect((structuredClone(copy) as Error).message).toBe('boom');
    await m.table.destroy();
  }, 20_000);

  it("keeps a failed chart's count off a slot a panel is about to take", async () => {
    const statsPanelRegistry = new StatsPanelRegistry();
    const m = await mount({ statsPanelRegistry });
    await waitForSlot(m, 'c1', /^20 rows\S/);
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsFailed to load');
    failing.stop();

    // A panel for c1 waits for the mounted columns to hold still.
    statsPanelRegistry.register({
      name: 'count',
      isApplicable: (type) => type === 'integer',
      constructor: CountPanel,
      priority: 10,
    });
    m.table.actions.hideColumn('c3');
    await afterRebuild();
    m.table.state.filteredRows.set(3);
    await sleep(0);
    expect(m.slot('c1')).toBe('8 / 20 rowsFailed to load');
    await sleep(STATS_PANEL_SETTLE_MS + 50);
    expect(m.slot('c1')).toBe('panel …');
    await m.table.destroy();
  }, 20_000);

  it("leaves the stats of a failed chart's successor alone", async () => {
    const m = await mount();
    await waitForSlot(m, 'c1', /^20 rows\S/);
    const failing = m.fail((sql) => !sql.includes('"c5"') && !sql.startsWith('SELECT COUNT(*)'));
    m.table.actions.addFilter({ type: 'point', column: 'c0', value: 'US' });
    await waitForSlot(m, 'c1', '8 / 20 rowsFailed to load');
    failing.stop();

    // Scrolled out of the keep band, c1's chart goes; back, a new one lands.
    scrollTo(1100);
    await vi.waitFor(() => expect(m.charts()).not.toContain('c1'), { timeout: 5000 });
    scrollTo(0);
    await waitForSlot(m, 'c1', /^8 \/ 20 rows\S*min/);
    m.table.state.filteredRows.set(3);
    await sleep(0);
    expect(m.slot('c1')).toMatch(/^8 \/ 20 rows\S*min/);
    expect(m.slot('c1')).not.toContain('Failed to load');
    await m.table.destroy();
  }, 20_000);

  it('names the column of a chart that throws in its constructor', async () => {
    const visualizationRegistry = new VisualizationRegistry();
    visualizationRegistry.register({
      name: 'throwing',
      isApplicable: () => true,
      constructor: ThrowingChart,
      priority: 100,
    });
    const m = await mount({ visualizationRegistry });
    const errors = collectVizErrorEvents(m.table);
    scrollTo(900);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0), { timeout: 5000 });
    for (const error of errors) {
      expect(error.message).toBe(`cannot chart ${error.details?.column as string}`);
    }
    await m.table.destroy();
  }, 20_000);

  it('tries a chart that throws in its constructor once per relation', async () => {
    const visualizationRegistry = new VisualizationRegistry();
    visualizationRegistry.register({
      name: 'throwing',
      isApplicable: () => true,
      constructor: ThrowingChart,
      priority: 100,
    });
    // c0–c4 threw once while mounting, before this listener existed.
    const m = await mount({ visualizationRegistry });
    const errors = collectVizErrors(m.table);
    for (let i = 0; i < 3; i++) {
      scrollTo(900);
      scrollTo(0);
    }
    await sleep(50);
    const count = (column: string): number =>
      errors.filter((message) => message === `cannot chart ${column}`).length;
    // c7–c11, in reach at 900 px, threw once each; c0–c4 were not retried.
    expect(errors).toHaveLength(5);
    expect(count('c7')).toBe(1);
    expect(count('c0')).toBe(0);
    expect(m.container.querySelectorAll('.dt-col-viz canvas')).toHaveLength(0);

    // A column change leaves it be: the same relation would fail the same
    // way.
    m.table.state.visibleColumns.set([...m.table.state.visibleColumns.get()]);
    await afterRebuild();
    await sleep(50);
    expect(count('c0')).toBe(0);

    // New data tries again, once.
    m.table.state.schema.set([...m.table.state.schema.get()]);
    await afterRebuild();
    await sleep(50);
    expect(count('c0')).toBe(1);
    expect(m.container.querySelectorAll('.dt-col-viz canvas')).toHaveLength(0);
    await m.table.destroy();
  }, 20_000);

  it('drops a hidden column from the Escape stack', async () => {
    const m = await mount();
    await waitForSlot(m, 'c0', /^20 rows2 unique/);
    const canvas = m.container.querySelector(
      '.dt-col-header[data-column="c0"] .dt-col-viz canvas',
    )!;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 20, bubbles: true }));
    await waitForSlot(m, 'c0', 'Category:');

    m.table.actions.hideColumn('c0');
    await afterRebuild();
    expect(m.table.state.visibleColumns.get()).not.toContain('c0');
    // Escape clears interactions on columns in the header row, as before
    // lazy charts; the hidden column keeps its filter.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(m.table.state.filters.get().map((f) => f.column)).toEqual(['c0']);
    await m.table.destroy();
  }, 20_000);
});
