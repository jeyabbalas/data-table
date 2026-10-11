/**
 * @vitest-environment jsdom
 *
 * Annotation navigation under the annotated filter while the annotations
 * change, through `createDataTable`, against real DuckDB: resolve an issue,
 * then press F8.
 *
 * The view keeps the annotated rows, and is refreshed in place a moment
 * after each change. The cursor follows its row through that refresh; when
 * its row leaves the view, it stays where it was, on the row that slid into
 * its place, and the next search starts there. Whenever a navigation lands,
 * the row it says it landed on is the one at that position in the view as
 * DuckDB has it once the annotations are in (the oracle), the one the
 * cursor is on, and the one the grid renders there.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import type { AnnotationNavigationResult } from '@/annotations/navigationTypes';
import type { QueryOptions, WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, quoteIdentifier, type DataTable } from '@/index';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

/** 12 rows: `id` 0 … 11, in `__rowid__` order, and `grp` = `id % 3`. */
const CSV = ['id,grp', ...Array.from({ length: 12 }, (_, id) => `${id},${id % 3}`)].join('\n');

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let harness: NodeDuckDBHarness | undefined;
const tables: DataTable[] = [];
let tableCount = 0;

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

/**
 * A bridge over the node connection, with the lifecycle `createDataTable`
 * touches. While `hold.rows` is set, the grid's row fetches (sent at `high`
 * or `normal` priority) wait in `hold.held` until the test releases them.
 */
function facadeBridge(hold: { rows: boolean; held: (() => void)[] }): WorkerBridge {
  const conn = harness!.conn;
  const node = makeNodeBridge(conn, harness!.db);
  return {
    ...node,
    query: async (sql: string, signal?: AbortSignal, options?: QueryOptions) => {
      const fetch = options?.priority === 'high' || options?.priority === 'normal';
      if (hold.rows && fetch) await new Promise<void>((resolve) => hold.held.push(resolve));
      return node.query(sql, signal, options);
    },
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    dropTable: async (name: string) => {
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
    },
  } as unknown as WorkerBridge;
}

interface Mounted {
  table: DataTable;
  /** The annotations' ids, by rowId. */
  ids: Map<number, string>;
  /** Hold the grid's row fetches from now on, until `release`. */
  holdRows: () => void;
  /** Let the row fetches held go, and hold no more. */
  release: () => void;
  /** Row fetches held so far. */
  held: () => number;
  /**
   * The annotated view as DuckDB has it once the table of annotated rows
   * holds the annotations in the store: its rows' `__rowid__`s, in order.
   */
  order: () => Promise<number[]>;
  /** Wait for the view to show `count` rows, refreshed in place and settled. */
  settled: (count: number) => Promise<void>;
}

/**
 * The table, with a row annotation of each of `annotated` rows, under the
 * annotated filter, its rows in view fetched.
 */
async function mount(annotated: number[]): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const hold = { rows: false, held: [] as (() => void)[] };
  const name = `nav_${++tableCount}`;
  const table = await createDataTable({
    container,
    bridge: facadeBridge(hold),
    source: CSV,
    sourceFormat: 'csv',
    tableName: name,
    persistence: false,
    presets: false,
    expressionFilter: false,
    visualizations: false,
  });
  tables.push(table);
  const added = table.annotations.addMany(
    annotated.map((rowId) => ({
      scope: 'row' as const,
      rowId,
      severity: 'error' as const,
      message: `row ${rowId}`,
    })),
  );
  const ids = new Map(added.map((a) => [(a as { rowId: number }).rowId, a.id]));
  const settled = async (count: number): Promise<void> => {
    await vi.waitFor(() => expect(table.state.filteredRows.get()).toBe(count), {
      timeout: 5_000,
    });
    await table.container.whenAnnotatedViewSettled();
    await table.container.whenBodyReady();
  };
  table.actions.showAnnotatedRows();
  await settled(annotated.length);
  return {
    table,
    ids,
    holdRows: () => {
      hold.rows = true;
    },
    release: () => {
      hold.rows = false;
      for (const resolve of hold.held.splice(0)) resolve();
    },
    held: () => hold.held.length,
    order: async () => {
      await table.container.getAnnotatedRows()!.ensureFresh();
      const rows = await makeNodeBridge(harness!.conn).query<{ id: number }>(
        `SELECT "__rowid__" AS id FROM ${quoteIdentifier(name)}` +
          ` WHERE "__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_${name}__") ORDER BY 1`,
      );
      return rows.map((row) => row.id);
    },
    settled,
  };
}

/** The `__rowid__` of the row the grid renders at view position `row`. */
function renderedRowId(table: DataTable, row: number): number | null {
  const el = table.container
    .getElement()
    .querySelector(`.dt-body .dt-row[data-row-index="${row}"]`);
  const id = el?.getAttribute('data-row-id');
  return id === null || id === undefined ? null : Number(id);
}

const said = (table: DataTable): string =>
  table.container.getElement().querySelector('.dt-announce')?.textContent ?? '';

/**
 * Where a navigation landed, checked against the view as it is once
 * everything has settled: the oracle's row at that position, the cursor's,
 * and the grid's.
 */
async function expectLanded(
  m: Mounted,
  landed: AnnotationNavigationResult | null,
  expected: { rowId: number; row: number },
): Promise<void> {
  expect(landed).toMatchObject(expected);
  const order = await m.order();
  await m.settled(order.length);
  expect(order[landed!.row], `the view's row at ${landed!.row}`).toBe(landed!.rowId);
  const cursor = m.table.state.focusedCell.get();
  expect(cursor?.row).toBe(landed!.row);
  expect(order[cursor!.row]).toBe(landed!.rowId);
  expect(renderedRowId(m.table, cursor!.row)).toBe(landed!.rowId);
}

describe('resolve, then F8, under the annotated filter (real DuckDB)', () => {
  it('pressed at once: the next annotated row, where the refreshed view has it', async () => {
    const m = await mount([2, 5, 7]);
    expect(await m.table.actions.nextAnnotation()).toMatchObject({ rowId: 2, row: 0 });
    // The app resolves row 2's issue, and the user presses F8 before the
    // view has caught up.
    m.table.annotations.remove(m.ids.get(2)!);
    const landed = await m.table.actions.nextAnnotation();
    await expectLanded(m, landed, { rowId: 5, row: 0 });
    expect(said(m.table)).toBe('Row 1 of 2: error, row 5');
  });

  it('pressed while the view fetches its rows again: it waits for them', async () => {
    const m = await mount([2, 5, 7]);
    expect(await m.table.actions.nextAnnotation()).toMatchObject({ rowId: 2, row: 0 });
    m.holdRows();
    m.table.annotations.remove(m.ids.get(2)!);
    // The sync lands, and the refresh in place starts fetching the rows.
    await vi.waitFor(() => expect(m.held()).toBeGreaterThan(0), { timeout: 5_000 });
    const pressed = m.table.actions.nextAnnotation();
    await new Promise((resolve) => setTimeout(resolve, 20));
    m.release();
    await expectLanded(m, await pressed, { rowId: 5, row: 0 });
  });

  it('pressed after the view caught up: the row that slid under the cursor, then the next', async () => {
    const m = await mount([2, 5, 7]);
    expect(await m.table.actions.nextAnnotation()).toMatchObject({ rowId: 2, row: 0 });
    m.table.annotations.remove(m.ids.get(2)!);
    await m.settled(2);
    // The cursor stayed where it was; row 5 slid under it.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 0, column: 'id' });
    expect(renderedRowId(m.table, 0)).toBe(5);

    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 5, row: 0 });
    expect(said(m.table)).toBe('Row 1 of 2: error, row 5');
    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 7, row: 1 });
  });

  it('back from the row that slid under the cursor: the row before it, not that row', async () => {
    const m = await mount([2, 5, 7, 9]);
    // Row 9 has an issue in `id` too, left of the cursor's column.
    m.table.annotations.add({
      scope: 'cell',
      rowId: 9,
      column: 'id',
      severity: 'error',
      message: 'id 9',
    });
    await m.settled(4);
    m.table.actions.setFocusedCell({ row: 2, column: 'grp' });
    m.table.annotations.remove(m.ids.get(7)!);
    await m.settled(3);
    expect(renderedRowId(m.table, 2)).toBe(9);

    await expectLanded(m, await m.table.actions.previousAnnotation(), { rowId: 5, row: 1 });
  });

  it('the last row resolved: the cursor goes up to the row before, which Shift+F8 visits', async () => {
    const m = await mount([2, 5, 7]);
    m.table.actions.setFocusedCell({ row: 2, column: 'id' });
    m.table.annotations.remove(m.ids.get(7)!);
    await m.settled(2);
    expect(m.table.state.focusedCell.get()).toEqual({ row: 1, column: 'id' });

    await expectLanded(m, await m.table.actions.previousAnnotation(), { rowId: 5, row: 1 });
    // And from the last row back again, F8 goes round to the first.
    m.table.actions.setFocusedCell({ row: 1, column: 'id' });
    const landed = await m.table.actions.nextAnnotation();
    await expectLanded(m, landed, { rowId: 2, row: 0 });
    expect(landed!.wrapped).toBe(true);
  });

  it('an annotation added above the cursor: the cursor stays on its row, and F8 goes past it', async () => {
    const m = await mount([2, 5, 7]);
    m.table.actions.setFocusedCell({ row: 1, column: 'grp' });
    const scrollTop = m.table.container.getScrollContainer().scrollTop;
    m.table.annotations.add({ scope: 'row', rowId: 3, severity: 'warning', message: 'row 3' });
    await m.settled(4);
    // Row 5 moved down one, and the cursor with it.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 2, column: 'grp' });
    expect(renderedRowId(m.table, 2)).toBe(5);
    expect(m.table.container.getScrollContainer().scrollTop).toBe(scrollTop);

    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 7, row: 3 });
  });
});
