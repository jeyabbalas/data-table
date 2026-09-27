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

import { createDataTable, type DataTable } from '@/index';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { SessionStore } from '@/persistence/SessionStore';
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
}

async function mount(): Promise<Mounted> {
  world = new FakeIntersectionWorld();
  world.viewportWidth = 250;
  world.placeRow(NAMES, 100);

  const queries: string[] = [];
  const base = makeNodeBridge(harness!.conn);
  const bridge = {
    ...base,
    query: (sql: string, ...rest: unknown[]) => {
      queries.push(sql);
      return (base.query as (...args: unknown[]) => unknown)(sql, ...rest);
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
});
