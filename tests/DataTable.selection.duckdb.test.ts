/**
 * @vitest-environment jsdom
 *
 * The row selection through `createDataTable`, against real DuckDB. A
 * selection holds 0-based positions in the filtered, sorted view.
 * `selectAll()` selected `totalRows` positions whatever the filters, so under
 * a filter it also selected positions past the view's last row, and the
 * export dialog counted them: "(40)" for a view of 10 rows. And `Ctrl/Cmd+C`
 * copied every column but `__rowid__`, hidden ones included, in the column
 * order rather than the visible columns the grid shows, and with no selected
 * row left in the view it took the browser's copy over and wrote the column
 * names alone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkerBridge } from '@/data/WorkerBridge';
import { copyRowsToClipboard } from '@/export/Clipboard';
import { createDataTable, quoteIdentifier, type DataTable, type TableEvents } from '@/index';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

/** 40 rows: `id` 0 … 39, in `__rowid__` order, and `grp` = `id % 4`. */
const CSV = ['id,grp', ...Array.from({ length: 40 }, (_, id) => `${id},${id % 4}`)].join('\n');

/** The view under `grp = 1`, sorted by `id` descending: 37, 33, …, 1. */
const GRP_1_DESC = Array.from({ length: 10 }, (_, i) => 37 - 4 * i);

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let harness: NodeDuckDBHarness | undefined;
const tables: DataTable[] = [];

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // A bounded container, so the body renders a screenful of rows.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  harness = await createNodeDuckDB();
}, 30_000);

afterEach(async () => {
  for (const table of tables.splice(0)) {
    if (!table.isDestroyed()) await table.destroy();
  }
  document.body.innerHTML = '';
});

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  await harness?.cleanup();
});

/** A bridge over the node connection, with the lifecycle `createDataTable` touches. */
function facadeBridge(): WorkerBridge {
  const conn = harness!.conn;
  return {
    ...makeNodeBridge(conn, harness!.db),
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    dropTable: async (name: string) => {
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
    },
  } as unknown as WorkerBridge;
}

async function mount(tableName: string): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    source: CSV,
    sourceFormat: 'csv',
    tableName,
    persistence: false,
    presets: false,
    expressionFilter: false,
    visualizations: false,
  });
  tables.push(table);
  return { table, container };
}

function nextEvent<K extends keyof TableEvents>(
  table: DataTable,
  name: K,
): Promise<TableEvents[K]> {
  return new Promise((resolve) => {
    const off = table.on(name, (payload) => {
      off();
      resolve(payload);
    });
  });
}

/** The export dialog's row counts: all, filtered, selected. */
function exportCounts(): string[] {
  return [...document.querySelectorAll('.dt-export-count')].map((el) => el.textContent ?? '');
}

const numbers = (values: ArrayLike<unknown>): number[] => Array.from(values, Number);

describe('selection under a filter, through createDataTable (real DuckDB)', () => {
  it('selectAll() after filterChange selects the rows of the filtered, sorted view', async () => {
    const { table } = await mount('selection_filtered');
    const counted = nextEvent(table, 'filterChange');
    table.actions.addFilter({ type: 'point', column: 'grp', value: 1 });
    expect((await counted).filteredRowCount).toBe(10);
    table.actions.setSort([{ column: 'id', direction: 'desc' }]);

    table.actions.selectAll();

    expect(table.state.selectedRows.get()).toEqual(new Set(GRP_1_DESC.keys()));
    const selected = numbers(
      await table.actions.getColumnValues('__rowid__', { scope: 'selected' }),
    );
    expect(selected).toEqual(GRP_1_DESC);
    const filtered = numbers(
      await table.actions.getColumnValues('__rowid__', { scope: 'filtered' }),
    );
    expect(new Set(selected)).toEqual(new Set(filtered));
    expect(numbers(await table.actions.getColumnValues('id', { scope: 'selected' }))).toEqual(
      GRP_1_DESC,
    );

    table.openExportDialog();
    expect(exportCounts()).toEqual(['(40)', '(10)', '(10)']);
  }, 30_000);

  it('counts only the selected positions left in the view once a filter narrows it', async () => {
    const { table } = await mount('selection_narrowed');
    table.actions.selectAll();
    expect(table.state.selectedRows.get().size).toBe(40);

    const counted = nextEvent(table, 'filterChange');
    table.actions.addFilter({ type: 'point', column: 'grp', value: 1 });
    await counted;

    // The selection keeps its 40 positions; 10 of them are rows of the view.
    expect(table.state.selectedRows.get().size).toBe(40);
    table.openExportDialog();
    expect(exportCounts()).toEqual(['(40)', '(10)', '(10)']);
    expect(await table.actions.getColumnValues('id', { scope: 'selected' })).toHaveLength(10);
  }, 30_000);

  it('Ctrl+C copies the visible columns in display order, a shown __rowid__ among them', async () => {
    const { table, container } = await mount('selection_copy');
    table.actions.showColumn('__rowid__');
    table.actions.hideColumn('id');
    table.actions.setColumnOrder(['grp', '__rowid__']);
    expect(table.state.visibleColumns.get()).toEqual(['grp', '__rowid__']);
    table.actions.selectRow(5);
    table.actions.selectRow(6, 'range');

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const grid = container.querySelector<HTMLElement>('.dt-grid')!;
    grid.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect((writeText.mock.calls[0]![0] as string).split('\n')).toEqual([
      'grp\t__rowid__',
      '1\t5',
      '2\t6',
    ]);
  }, 30_000);

  it('Ctrl+C leaves the browser its copy once a filter leaves no selected row in the view', async () => {
    const { table, container } = await mount('selection_copy_none');
    // Rows 30–35, then a filter down to the 10 rows of grp = 1.
    table.actions.selectRow(30);
    table.actions.selectRow(35, 'range');
    const counted = nextEvent(table, 'filterChange');
    table.actions.addFilter({ type: 'point', column: 'grp', value: 1 });
    await counted;

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.querySelector<HTMLElement>('.dt-grid')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    // Nor does a copy of those rows from code write the column names alone.
    await copyRowsToClipboard([...table.state.selectedRows.get()], table.state, facadeBridge());
    expect(writeText).not.toHaveBeenCalled();
  }, 30_000);
});
