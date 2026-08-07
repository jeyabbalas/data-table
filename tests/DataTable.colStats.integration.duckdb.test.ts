/**
 * @vitest-environment jsdom
 *
 * End-to-end integration of the column-stats display against real DuckDB:
 * real default visualizations, real SQL, driven through `table.actions`.
 *
 * The uniform-denominator contract under test:
 *  - Line 1 on EVERY column while any filter is active: `F / N rows`
 *    (rows passing all filters / dataset total) — identical across columns.
 *  - A column whose own filter has a chart representation shows a committed
 *    detail: its selection label + `X rows (p%)` where X counts what the
 *    filter alone matches in the UNFILTERED data and p% is X/N.
 *  - The detail is identical no matter how the filter was created (API,
 *    preset, pre-attach restore, undo/redo) and survives rebuilds
 *    (derived columns, hide/show), and sorting never changes it.
 *
 * Canonical 20-row table `verify_stats(id, v, c)`:
 *   v: 1×9, 2×5, 3×3, NULL×3      c: US×8, CA×5, DE×3, NULL×4
 *   joint: US∧v=1 = 4 · id = 1..20 (continuous histogram)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { SessionStore } from '@/persistence/SessionStore';
import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;

let harness: NodeDuckDBHarness | undefined;
let bridge: ReturnType<typeof makeNodeBridge>;

/**
 * `makeNodeBridge` implements only `query`; `createDataTable` also touches
 * the lifecycle surface. Stub the rest — the table never owns this bridge.
 */
function facadeBridge(): ReturnType<typeof makeNodeBridge> {
  const base = makeNodeBridge(harness!.conn);
  return {
    ...base,
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
  } as unknown as ReturnType<typeof makeNodeBridge>;
}

beforeAll(async () => {
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
  const ctx = {
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 30 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

  harness = await createNodeDuckDB();
  bridge = makeNodeBridge(harness.conn);
  await harness.conn.query(`
    CREATE TABLE verify_stats AS SELECT
      t.id, t.v, t.c, t.id - 1 AS __rowid__
    FROM (VALUES
      (1,1,'US'),(2,1,'US'),(3,1,'US'),(4,1,'US'),(5,2,'US'),(6,2,'US'),(7,3,'US'),(8,3,'US'),
      (9,1,'CA'),(10,1,'CA'),(11,1,'CA'),(12,2,'CA'),(13,2,'CA'),
      (14,1,'DE'),(15,2,'DE'),(16,3,'DE'),
      (17,1,NULL),(18,NULL,NULL),(19,NULL,NULL),(20,NULL,NULL)
    ) AS t(id, v, c)
  `);
}, 30_000);

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  await harness?.cleanup();
});

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'v', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'c', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

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

interface Harness2 {
  table: DataTable;
  container: HTMLElement;
  slot: (column: string) => string;
  slotHtml: (column: string) => string;
}

async function mountTable(preFilters: Filter[] = []): Promise<Harness2> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    expressionFilter: false,
    exportDialog: false,
  });
  table.state.tableName.set('verify_stats');
  table.state.baseTableName.set('verify_stats');
  table.state.totalRows.set(20);
  table.state.filteredRows.set(20);
  if (preFilters.length > 0) table.state.filters.set(preFilters);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();

  const slotEl = (column: string): HTMLElement => {
    const el = container.querySelector(
      `.dt-col-header[data-column="${column}"] .dt-col-stats`,
    ) as HTMLElement | null;
    if (!el) throw new Error(`stats slot for ${column} not found`);
    return el;
  };
  return {
    table,
    container,
    slot: (column) => slotEl(column).textContent ?? '',
    slotHtml: (column) => slotEl(column).innerHTML,
  };
}

async function waitForSlot(h: Harness2, column: string, expected: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(h.slot(column)).toContain(expected);
    },
    { timeout: 5000 },
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('column stats — uniform denominator end-to-end (real DuckDB)', () => {
  it('baseline: every column shows the total with per-column null annotations', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'id', '20 rows');
    await waitForSlot(h, 'v', '20 rows · 3 null');
    await waitForSlot(h, 'c', '20 rows · 4 null');
    await h.table.destroy();
  }, 20_000);

  it('point filter on c: identical line 1 everywhere, committed detail on c only', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', 'Category: US');
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    await waitForSlot(h, 'id', '8 / 20 rows');
    await waitForSlot(h, 'v', '8 / 20 rows');
    expect(h.slot('c')).toContain('8 / 20 rows');
    expect(h.slot('v')).not.toContain('Bin:');
    await h.table.destroy();
  }, 20_000);

  it('chained filter: numerators shrink everywhere, committed details stay byte-stable', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    const cDetailBefore = h.slotHtml('c');

    h.table.actions.addFilter({ type: 'point', column: 'v', value: 1 });
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    await waitForSlot(h, 'id', '4 / 20 rows');
    await waitForSlot(h, 'c', '4 / 20 rows');
    // The c detail region (selection label + own-filter count) is unchanged;
    // only its line 1 numerator moved.
    expect(h.slotHtml('c').split('<br>').slice(1).join('<br>')).toBe(
      cDetailBefore.split('<br>').slice(1).join('<br>'),
    );
    expect(h.slot('v')).toContain('Bin: 1');

    // Replace the v filter: detail updates, c detail still stable.
    h.table.actions.addFilter({ type: 'point', column: 'v', value: 2 });
    await waitForSlot(h, 'v', '5 rows (25.0%)');
    await waitForSlot(h, 'id', '2 / 20 rows');
    expect(h.slotHtml('c').split('<br>').slice(1).join('<br>')).toBe(
      cDetailBefore.split('<br>').slice(1).join('<br>'),
    );
    await h.table.destroy();
  }, 20_000);

  it('range filter on id: F/N line 1 on every column; detail shows the bin-snapped brush', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'id', '20 rows');
    // maxInclusive: true → id in [6, 15] → 10 rows.
    h.table.actions.addFilter({ type: 'range', column: 'id', min: 6, max: 15, maxInclusive: true });
    await waitForSlot(h, 'id', '10 / 20 rows');
    await waitForSlot(h, 'v', '10 / 20 rows');
    await waitForSlot(h, 'c', '10 / 20 rows');
    // The histogram can only draw bin-aligned brushes, so an API-created
    // range snaps to bins; the detail honestly describes that drawn brush
    // (label + unfiltered count over the snapped bins).
    expect(h.slot('id')).toContain('Bin:');
    expect(h.slot('id')).toMatch(/\d+ rows \(\d+\.\d%\)/);
    await h.table.destroy();
  }, 20_000);

  it('null filter on v: null-bin detail; all-null annotation on c', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'v', '20 rows');
    h.table.actions.addFilter({ type: 'null', column: 'v' });
    await waitForSlot(h, 'v', 'Bin: null');
    await waitForSlot(h, 'v', '3 rows (15.0%)');
    await waitForSlot(h, 'id', '3 / 20 rows');
    // The 3 v-null rows all have null c → "all null" within the filtered set.
    await waitForSlot(h, 'c', '3 / 20 rows · all null');
    await h.table.destroy();
  }, 20_000);

  it('set filter on c: multi-select detail sums the background', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'set', column: 'c', values: ['US', 'CA'] });
    await waitForSlot(h, 'c', 'Selected: US, CA');
    await waitForSlot(h, 'c', '13 rows (65.0%)');
    await waitForSlot(h, 'id', '13 / 20 rows');
    await h.table.destroy();
  }, 20_000);

  it('pattern filter: line 1 reflects it, no committed detail', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'pattern', column: 'c', pattern: 'U', mode: 'contains' });
    await waitForSlot(h, 'c', '8 / 20 rows');
    await waitForSlot(h, 'v', '8 / 20 rows');
    expect(h.slot('c')).not.toContain('Category:');
    expect(h.slot('c')).not.toContain('Selected:');
    await h.table.destroy();
  }, 20_000);

  it('raw-SQL filter: fractions everywhere, no committed details; F==N still shows the fraction', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'id', '20 rows');
    const filterId = h.table.actions.addRawSQLFilter('id <= 10');
    await waitForSlot(h, 'id', '10 / 20 rows');
    await waitForSlot(h, 'v', '10 / 20 rows');
    await waitForSlot(h, 'c', '10 / 20 rows');
    expect(h.slot('v')).not.toContain('Bin:');
    expect(h.slot('c')).not.toContain('Category:');

    h.table.actions.updateRawSQLFilter(filterId, 'id >= 1');
    await waitForSlot(h, 'id', '20 / 20 rows');
    await waitForSlot(h, 'c', '20 / 20 rows');
    await h.table.destroy();
  }, 20_000);

  it('creation-path identity: preset load reproduces the API-created display exactly', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    h.table.actions.addFilter({ type: 'point', column: 'v', value: 1 });
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    await waitForSlot(h, 'c', '4 / 20 rows');
    const cHtml = h.slotHtml('c');
    const vHtml = h.slotHtml('v');

    h.table.actions.clearFilters();
    await waitForSlot(h, 'c', '20 rows · 4 null');
    expect(h.slot('v')).not.toContain('Bin:');

    h.table.actions.loadFilterPreset([
      { type: 'point', column: 'c', value: 'US' },
      { type: 'point', column: 'v', value: 1 },
    ]);
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    await waitForSlot(h, 'c', '4 / 20 rows');
    expect(h.slotHtml('c')).toBe(cHtml);
    expect(h.slotHtml('v')).toBe(vHtml);
    await h.table.destroy();
  }, 20_000);

  it('pre-attach filters (session-restore path) produce committed details without any gesture', async () => {
    const h = await mountTable([
      { type: 'point', column: 'c', value: 'US' },
      { type: 'point', column: 'v', value: 1 },
    ]);
    await waitForSlot(h, 'c', 'Category: US');
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    await waitForSlot(h, 'v', 'Bin: 1');
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    await waitForSlot(h, 'id', '4 / 20 rows');
    await h.table.destroy();
  }, 20_000);

  it('undo removes the newest filter and its detail; redo re-derives it', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    h.table.actions.addFilter({ type: 'point', column: 'v', value: 1 });
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    const vHtml = h.slotHtml('v');

    await h.table.actions.undo();
    await waitForSlot(h, 'id', '8 / 20 rows');
    await vi.waitFor(() => {
      expect(h.slot('v')).not.toContain('Bin:');
    });
    expect(h.slot('c')).toContain('8 rows (40.0%)');

    await h.table.actions.redo();
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    expect(h.slotHtml('v')).toBe(vHtml);
    await h.table.destroy();
  }, 20_000);

  it('removal paths: removeFilter clears one detail, clearFilters clears everything', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    h.table.actions.addFilter({ type: 'point', column: 'v', value: 1 });
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    await waitForSlot(h, 'c', '4 / 20 rows');

    h.table.actions.removeFilter('c');
    await waitForSlot(h, 'id', '9 / 20 rows');
    await vi.waitFor(() => {
      expect(h.slot('c')).not.toContain('Category:');
    });
    expect(h.slot('v')).toContain('9 rows (45.0%)');

    h.table.actions.clearFilters();
    await waitForSlot(h, 'id', '20 rows');
    await vi.waitFor(() => {
      expect(h.slot('v')).not.toContain('Bin:');
    });
    await h.table.destroy();
  }, 20_000);

  it('derived expression column: gets its own filtered line 1; existing details survive the rebuild', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', '8 rows (40.0%)');

    const res = await h.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'v2',
      expression: 'v * 2',
    });
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);
    await waitForSlot(h, 'v2', '8 / 20 rows');
    // The c detail survived the full viz teardown/rebuild.
    await waitForSlot(h, 'c', 'Category: US');
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    await h.table.destroy();
  }, 20_000);

  it('renaming a filtered derived column carries the committed detail to the new name', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    const res = await h.table.actions.addDerivedColumn({
      kind: 'expression',
      name: 'v2',
      expression: 'v * 2',
    });
    expect(res.success).toBe(true);
    await waitForSlot(h, 'v2', '20 rows');

    h.table.actions.addFilter({ type: 'point', column: 'v2', value: 2 });
    await waitForSlot(h, 'v2', '9 rows (45.0%)');

    const renamed = await h.table.actions.updateDerivedColumn('v2', {
      kind: 'expression',
      name: 'v2x',
      expression: 'v * 2',
    });
    expect(renamed.success).toBe(true);
    await waitForSlot(h, 'v2x', '9 rows (45.0%)');
    await waitForSlot(h, 'v2x', 'Bin: 2');
    await waitForSlot(h, 'id', '9 / 20 rows');

    await h.table.actions.removeDerivedColumn('v2x');
    await waitForSlot(h, 'id', '20 rows');
    await h.table.destroy();
  }, 20_000);

  it('derived vector column joins the same stats contract', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', '8 rows (40.0%)');

    const res = await h.table.actions.addDerivedColumn({
      kind: 'vector',
      name: 'score',
      vectorType: 'integer',
      values: Array.from({ length: 20 }, (_, i) => i % 4),
    });
    expect(res.success).toBe(true);
    await waitForSlot(h, 'score', '8 / 20 rows');
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    await h.table.destroy();
  }, 20_000);

  it('hiding a filtered column keeps its filter active; showing restores the identical detail', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    h.table.actions.addFilter({ type: 'point', column: 'v', value: 1 });
    await waitForSlot(h, 'c', '4 / 20 rows');
    await waitForSlot(h, 'v', '9 rows (45.0%)');
    const cHtml = h.slotHtml('c');

    h.table.actions.hideColumn('c');
    await vi.waitFor(() => {
      expect(h.container.querySelector('.dt-col-header[data-column="c"]')).toBeNull();
    });
    // The hidden column's filter still constrains every remaining column.
    await waitForSlot(h, 'id', '4 / 20 rows');
    await waitForSlot(h, 'v', '9 rows (45.0%)');

    h.table.actions.showColumn('c');
    await waitForSlot(h, 'c', 'Category: US');
    await vi.waitFor(() => {
      expect(h.slotHtml('c')).toBe(cHtml);
    });
    await h.table.destroy();
  }, 20_000);

  it('sorting and reordering never change the stats text', async () => {
    const h = await mountTable();
    await waitForSlot(h, 'c', '20 rows');
    h.table.actions.addFilter({ type: 'point', column: 'c', value: 'US' });
    await waitForSlot(h, 'c', '8 rows (40.0%)');
    await waitForSlot(h, 'v', '8 / 20 rows');
    const cHtml = h.slotHtml('c');
    const vHtml = h.slotHtml('v');

    h.table.actions.toggleSort('v');
    await new Promise((r) => setTimeout(r, 150));
    expect(h.slotHtml('c')).toBe(cHtml);
    expect(h.slotHtml('v')).toBe(vHtml);

    h.table.actions.toggleSort('v');
    await new Promise((r) => setTimeout(r, 150));
    expect(h.slotHtml('c')).toBe(cHtml);

    const order = h.table.state.columnOrder.get();
    h.table.actions.setColumnOrder([...order].reverse());
    await new Promise((r) => setTimeout(r, 150));
    expect(h.slot('c')).toContain('8 rows (40.0%)');
    expect(h.slot('v')).toContain('8 / 20 rows');
    await h.table.destroy();
  }, 20_000);
});
