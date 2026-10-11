/**
 * @vitest-environment jsdom
 *
 * Annotation navigation under the annotated filter while the annotations
 * change, through `createDataTable`, against real DuckDB: resolve an issue,
 * then press F8.
 *
 * The view keeps the annotated rows, and is refreshed in place a moment
 * after each change, which takes in every change made since the last. The
 * cursor follows its row through that refresh, wherever it goes: among the
 * rows the grid fetches again, past the view's old end, or off-screen. When
 * its row leaves the view, the cursor goes to the gap the row left, where
 * the first row after it is now, and the next search starts from that gap.
 * Whenever a navigation lands, the row it says it landed on is the one at
 * that position in the view as DuckDB has it once the annotations are in
 * (the oracle), the one the cursor is on, and the one the grid renders
 * there.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import type { AnnotationNavigationResult } from '@/annotations/navigationTypes';
import type { QueryOptions, WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, quoteIdentifier, type DataTable } from '@/index';
import type { ValueInspector } from '@/table/ValueInspector';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

/** `rows` rows: `id` 0, 1, …, in `__rowid__` order, and `grp` = `id % 3`. */
const csv = (rows: number): string =>
  ['id,grp', ...Array.from({ length: rows }, (_, id) => `${id},${id % 3}`)].join('\n');

/** The same, as JSON with a list column, `tags`, in place of `grp`: a nested column to inspect. */
const json = (rows: number): string =>
  JSON.stringify(Array.from({ length: rows }, (_, id) => ({ id, tags: [`t${id}`, 'x'] })));

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

/** What a test holds back: the grid's row fetches, or the filtered rows' counts. */
interface Hold {
  rows: boolean;
  counts: boolean;
  held: (() => void)[];
}

/**
 * A bridge over the node connection, with the lifecycle `createDataTable`
 * touches. While `hold.rows` is set, the grid's row fetches (sent at `high`
 * or `normal` priority) wait in `hold.held` until the test releases them;
 * while `hold.counts` is, the counts of the filtered rows do.
 */
function facadeBridge(hold: Hold): WorkerBridge {
  const conn = harness!.conn;
  const node = makeNodeBridge(conn, harness!.db);
  return {
    ...node,
    query: async (sql: string, signal?: AbortSignal, options?: QueryOptions) => {
      const fetch = options?.priority === 'high' || options?.priority === 'normal';
      const count = sql.startsWith('SELECT COUNT(*) as cnt');
      if ((hold.rows && fetch) || (hold.counts && count)) {
        await new Promise<void>((resolve) => hold.held.push(resolve));
      }
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
  /** Hold the counts of the filtered rows from now on, until `release`. */
  holdCounts: () => void;
  /** Let what was held go, and hold no more. */
  release: () => void;
  /** Queries held so far. */
  held: () => number;
  /**
   * The annotated view as DuckDB has it once the table of annotated rows
   * holds the annotations in the store: its rows' `__rowid__`s, in order,
   * by `__rowid__` or by `orderBy`.
   */
  order: (orderBy?: string) => Promise<number[]>;
  /** Wait for the view to show `count` rows, refreshed in place and settled. */
  settled: (count: number) => Promise<void>;
}

/**
 * The table, of `rows` rows (12 by default), as CSV or, with `json`, as
 * JSON with a list column, with a row annotation of each of `annotated`
 * rows, under the annotated filter, its rows in view fetched.
 */
async function mount(
  annotated: number[],
  { rows = 12, json: asJson = false }: { rows?: number; json?: boolean } = {},
): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const hold: Hold = { rows: false, counts: false, held: [] };
  const name = `nav_${++tableCount}`;
  const table = await createDataTable({
    container,
    bridge: facadeBridge(hold),
    source: asJson ? json(rows) : csv(rows),
    sourceFormat: asJson ? 'json' : 'csv',
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
    // The table of annotated rows brought up to date with the store: the
    // view's refresh in place, if it needs one, has started by then, even
    // for a change that leaves the row count as it was.
    await table.container.getAnnotatedRows()!.ensureFresh();
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
    holdCounts: () => {
      hold.counts = true;
    },
    release: () => {
      hold.rows = false;
      hold.counts = false;
      for (const resolve of hold.held.splice(0)) resolve();
    },
    held: () => hold.held.length,
    order: async (orderBy = '"__rowid__"') => {
      await table.container.getAnnotatedRows()!.ensureFresh();
      const rows = await makeNodeBridge(harness!.conn).query<{ id: number }>(
        `SELECT "__rowid__" AS id FROM ${quoteIdentifier(name)}` +
          ` WHERE "__rowid__" IN (SELECT "__rowid__" FROM "__dt_annot_${name}__") ORDER BY ${orderBy}`,
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

/** Press `key` on the grid, as the user would. */
function press(table: DataTable, init: KeyboardEventInit): void {
  const grid = table.container.getGridElement();
  grid.focus();
  grid.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

/**
 * Where a navigation landed, checked against the view as it is once
 * everything has settled: the oracle's row at that position, the cursor's,
 * and the grid's.
 */
async function expectLanded(
  m: Mounted,
  landed: AnnotationNavigationResult | null,
  expected: { rowId: number; row: number },
  orderBy?: string,
): Promise<void> {
  expect(landed).toMatchObject(expected);
  const order = await m.order(orderBy);
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

describe('several changes in one refresh (real DuckDB)', () => {
  it("the cursor's row and one above it resolved together: the cursor goes to the gap, and F8 to the row after", async () => {
    const m = await mount([2, 5, 7, 9]);
    m.table.actions.setFocusedCell({ row: 1, column: 'grp' });
    // Both in one turn: one sync, one refresh.
    m.table.annotations.remove(m.ids.get(2)!);
    m.table.annotations.remove(m.ids.get(5)!);
    await m.settled(2);
    expect(await m.order()).toEqual([7, 9]);
    // Row 5's gap is at the start now, where row 7 is: not where the cursor was.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 0, column: 'grp' });
    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 7, row: 0 });
  });

  it("a row joins above as the cursor's row leaves: F8 goes on past the gap, not back", async () => {
    const m = await mount([2, 5, 7]);
    m.table.actions.setFocusedCell({ row: 1, column: 'grp' });
    m.table.annotations.add({ scope: 'row', rowId: 1, severity: 'error', message: 'row 1' });
    m.table.annotations.remove(m.ids.get(5)!);
    await m.settled(3);
    expect(await m.order()).toEqual([1, 2, 7]);
    // Row 5's gap is two rows in, where row 7 is.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 2, column: 'grp' });
    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 7, row: 2 });
  });

  it('…and Shift+F8 goes to the last row before the gap', async () => {
    const m = await mount([2, 5, 7]);
    m.table.actions.setFocusedCell({ row: 1, column: 'grp' });
    m.table.annotations.add({ scope: 'row', rowId: 1, severity: 'error', message: 'row 1' });
    m.table.annotations.remove(m.ids.get(5)!);
    await m.settled(3);
    await expectLanded(m, await m.table.actions.previousAnnotation(), { rowId: 2, row: 1 });
  });
});

describe('a row that moves out of the rows the grid fetches again (real DuckDB)', () => {
  it('the cursor on the last row, a row added above: it follows its row past the old end', async () => {
    const m = await mount([2, 5, 7]);
    m.table.actions.setFocusedCell({ row: 2, column: 'grp' });
    m.table.annotations.add({ scope: 'row', rowId: 3, severity: 'warning', message: 'row 3' });
    await m.settled(4);
    expect(await m.order()).toEqual([2, 3, 5, 7]);
    // Row 7 is at position 3 now, past the three rows the grid fetched again.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 3, column: 'grp' });
    await vi.waitFor(() => expect(renderedRowId(m.table, 3)).toBe(7));
    // Shift+F8 goes to row 5, the one before it; then F8 back to row 7.
    await expectLanded(m, await m.table.actions.previousAnnotation(), { rowId: 5, row: 2 });
    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 7, row: 3 });
  });

  it('the cursor off-screen, a row above it resolved: it follows its row, and nothing scrolls', async () => {
    const m = await mount(
      Array.from({ length: 600 }, (_, rowId) => rowId),
      { rows: 600 },
    );
    expect(await m.table.actions.revealRow(400, 'grp')).toEqual({ row: 400, column: 'grp' });
    const body = m.table.container.getTableBody()!;
    await vi.waitFor(() => expect(body.cachedRowId(400)).toBe(400), { timeout: 5_000 });
    // The user scrolls back to the top, the cursor left on row 400.
    body.scrollToRow(0, 'start');
    await m.table.container.whenBodyReady();

    m.table.annotations.remove(m.ids.get(10)!);
    await m.settled(599);
    // Row 400 is at position 399 now: the cursor went with it.
    expect(m.table.state.focusedCell.get()).toEqual({ row: 399, column: 'grp' });
    expect(body.getVisibleRange().start).toBe(0);
    await expectLanded(m, await m.table.actions.nextAnnotation(), { rowId: 401, row: 400 });
  });
});

describe('the rows back, the count on its way (real DuckDB)', () => {
  it('the cursor is on its row already, and the keys act from there', async () => {
    const m = await mount([2, 5, 7, 9]);
    m.table.actions.setFocusedCell({ row: 1, column: 'grp' });
    m.holdCounts();
    try {
      m.table.annotations.add({ scope: 'row', rowId: 3, severity: 'warning', message: 'row 3' });
      const body = m.table.container.getTableBody()!;
      // The rows land: [2, 3, 5, 7]; the count of the view waits.
      await vi.waitFor(() => expect(body.cachedRowId(1)).toBe(3), { timeout: 5_000 });
      expect(m.held()).toBeGreaterThan(0);
      expect(m.table.state.focusedCell.get()).toEqual({ row: 2, column: 'grp' });
      // Down, from row 5.
      press(m.table, { key: 'ArrowDown' });
    } finally {
      m.release();
    }
    await m.settled(5);
    expect(m.table.state.focusedCell.get()).toEqual({ row: 3, column: 'grp' });
    expect(renderedRowId(m.table, 3)).toBe(7);
  });
});

describe('the value inspector through a refresh in place (real DuckDB)', () => {
  const inspector = (table: DataTable): ValueInspector | null =>
    (table.container as unknown as { valueInspector: ValueInspector | null }).valueInspector;

  for (const [where, rowId, row] of [
    ['below', 9, 1],
    ['above', 3, 2],
  ] as const) {
    it(`an annotation added ${where} the cursor's row: the inspector stays open on its row`, async () => {
      const m = await mount([2, 5, 7], { json: true });
      m.table.actions.setFocusedCell({ row: 1, column: 'tags' });
      expect(m.table.container.openValueInspector({ row: 1, column: 'tags' })).toBe(true);
      await vi.waitFor(() => expect(inspector(m.table)?.getIsOpen()).toBe(true), {
        timeout: 5_000,
      });

      m.table.annotations.add({ scope: 'row', rowId, severity: 'warning', message: 'new' });
      await m.settled(4);
      expect(m.table.state.focusedCell.get()).toEqual({ row, column: 'tags' });
      expect(inspector(m.table)!.getShown()).toEqual({ column: 'tags', row, rowId: 5 });
      const title = inspector(m.table)!
        .getElement()
        .querySelector('[id$="-value-inspector-title"]');
      expect(title?.textContent).toContain(`${row + 1}`);
      // The user's own move to another cell still closes it.
      m.table.actions.setFocusedCell({ row: 0, column: 'tags' });
      expect(inspector(m.table)!.getIsOpen()).toBe(false);
    });
  }
});

describe('resolve, then F8, in a sorted annotated view (real DuckDB)', () => {
  /** Every other row of 60 annotated, sorted by `grp` descending, ties by `__rowid__`. */
  const SORT = '"grp" DESC, "__rowid__"';

  async function sorted(): Promise<{ m: Mounted; before: number[] }> {
    const m = await mount(
      Array.from({ length: 30 }, (_, k) => k * 2),
      { rows: 60 },
    );
    m.table.actions.setSort([{ column: 'grp', direction: 'desc' }]);
    await m.settled(30);
    return { m, before: await m.order(SORT) };
  }

  it('the row resolved under the cursor: F8 lands on the next in the sort, Shift+F8 on the one before', async () => {
    const { m, before } = await sorted();
    m.table.actions.setFocusedCell({ row: 10, column: 'id' });
    m.table.annotations.remove(m.ids.get(before[10]!)!);
    await expectLanded(
      m,
      await m.table.actions.nextAnnotation(),
      { rowId: before[11]!, row: 10 },
      SORT,
    );
    await expectLanded(
      m,
      await m.table.actions.previousAnnotation(),
      { rowId: before[9]!, row: 9 },
      SORT,
    );
  });

  it("it and a row before it resolved together: the gap is where the sort puts the cursor's row", async () => {
    const { m, before } = await sorted();
    m.table.actions.setFocusedCell({ row: 10, column: 'id' });
    m.table.annotations.remove(m.ids.get(before[3]!)!);
    m.table.annotations.remove(m.ids.get(before[10]!)!);
    await m.settled(28);
    expect(m.table.state.focusedCell.get()).toEqual({ row: 9, column: 'id' });
    await expectLanded(
      m,
      await m.table.actions.nextAnnotation(),
      { rowId: before[11]!, row: 9 },
      SORT,
    );
  });
});
