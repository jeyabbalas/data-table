/**
 * @vitest-environment jsdom
 *
 * A nested column through `createDataTable`, against real DuckDB: the
 * default registry gives it the summary chart, its header shows the type's
 * label, and its stats slot shows the counts and the type summary, escaped
 * on the way into the slot's HTML, and follows the filters.
 *
 * Table `nested_facade(id, n, point, tags)`, 10 rows: `point` is NULL at
 * ids 1 and 2, `tags` at ids 1, 4 and 7; `n` is `id % 2`. One of `point`'s
 * fields is named `<img src=x onerror=alert(1)>`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { createDataTable, type DataTable } from '@/index';
import type { SessionStore } from '@/persistence/SessionStore';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

const POINT_TYPE = 'STRUCT(x DOUBLE, "<img src=x onerror=alert(1)>" VARCHAR)';

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'n', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'point', type: 'nested', nullable: true, originalType: POINT_TYPE },
  { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
];

let harness: NodeDuckDBHarness | undefined;

/** A bridge over the node connection with the lifecycle `createDataTable` touches. */
function facadeBridge(): ReturnType<typeof makeNodeBridge> {
  return {
    ...makeNodeBridge(harness!.conn),
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
  } as unknown as ReturnType<typeof makeNodeBridge>;
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
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
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
  await harness.conn.query(`
    CREATE TABLE nested_facade AS SELECT
      range::INTEGER AS id,
      (range % 2)::INTEGER AS n,
      CASE WHEN range IN (1, 2) THEN NULL
           ELSE {'x': range * 1.5, '<img src=x onerror=alert(1)>': 'v' || range} END AS point,
      CASE WHEN range IN (1, 4, 7) THEN NULL ELSE ['a', 'b'] END AS tags,
      range AS __rowid__
    FROM range(10)
  `);
}, 30_000);

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  await harness?.cleanup();
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function mountTable(): Promise<{ table: DataTable; container: HTMLElement }> {
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
  table.state.tableName.set('nested_facade');
  table.state.baseTableName.set('nested_facade');
  table.state.totalRows.set(10);
  table.state.filteredRows.set(10);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  return { table, container };
}

function header(container: HTMLElement, column: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"]`);
  if (!el) throw new Error(`header for ${column} not found`);
  return el;
}

const slotOf = (container: HTMLElement, column: string): HTMLElement =>
  header(container, column).querySelector<HTMLElement>('.dt-col-stats')!;

describe('a nested column through createDataTable (real DuckDB)', () => {
  it('labels the header with the type outline, and speaks it', async () => {
    const { table, container } = await mountTable();
    const type = header(container, 'tags').querySelector<HTMLElement>('.dt-col-type')!;
    expect(type.textContent).toBe('[varchar]');
    expect(type.title).toBe('VARCHAR[]');
    expect(header(container, 'tags').getAttribute('aria-label')).toBe('tags, list of varchar');
    expect(header(container, 'point').querySelector('.dt-col-type')!.textContent).toBe('struct(2)');
    await table.destroy();
  }, 20_000);

  it('shows the short type in the filter panel’s badge, titled with the full one', async () => {
    const { table, container } = await mountTable();
    header(container, 'point').querySelector<HTMLElement>('.dt-col-filter-btn')!.click();
    const badge = document.querySelector<HTMLElement>('.dt-filter-panel-type')!;
    expect(badge.textContent).toBe('struct(2)');
    expect(badge.title).toBe(POINT_TYPE);

    // The panel moves to a scalar column: its type, and no title.
    header(container, 'id').querySelector<HTMLElement>('.dt-col-filter-btn')!.click();
    expect(badge.textContent).toBe('integer');
    expect(badge.hasAttribute('title')).toBe(false);
    await table.destroy();
  }, 20_000);

  it('draws the summary chart and puts the counts and type summary in the stats slot', async () => {
    const { table, container } = await mountTable();
    await vi.waitFor(
      () => expect(slotOf(container, 'point').textContent).toMatch(/^10 rows · 2 null/),
      { timeout: 5000 },
    );
    const slot = slotOf(container, 'point');
    // Line 2: the type summary, as text — the field name made no element.
    expect(slot.querySelector('.dt-stats-line2')!.textContent).toBe(
      'x double · <img src=x onerror=alert(1)> varchar',
    );
    expect(slot.querySelector('img')).toBeNull();
    expect(header(container, 'point').querySelector('.dt-col-viz canvas')).not.toBeNull();

    await vi.waitFor(
      () => expect(slotOf(container, 'tags').textContent).toMatch(/^10 rows · 3 null/),
      { timeout: 5000 },
    );
    expect(slotOf(container, 'tags').querySelector('.dt-stats-line2')!.textContent).toBe(
      '[varchar]',
    );
    await table.destroy();
  }, 20_000);

  it('follows a filter on another column, and one on itself', async () => {
    const { table, container } = await mountTable();
    await vi.waitFor(
      () => expect(slotOf(container, 'point').textContent).toMatch(/^10 rows · 2 null/),
      { timeout: 5000 },
    );

    // n = 1 keeps ids 1, 3, 5, 7, 9: point is NULL at 1 only.
    table.actions.addFilter({ type: 'point', column: 'n', value: 1 });
    await vi.waitFor(
      () => expect(slotOf(container, 'point').textContent).toMatch(/^5 \/ 10 rows · 1 null/),
      { timeout: 5000 },
    );

    // And tags NULL too: ids 1 and 7.
    table.actions.addFilter({ type: 'null', column: 'tags' });
    await vi.waitFor(
      () => expect(slotOf(container, 'tags').textContent).toMatch(/^2 \/ 10 rows · all null/),
      { timeout: 5000 },
    );
    await vi.waitFor(
      () => expect(slotOf(container, 'point').textContent).toMatch(/^2 \/ 10 rows · 1 null/),
      { timeout: 5000 },
    );
    await table.destroy();
  }, 20_000);
});
