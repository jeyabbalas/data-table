/**
 * Helpers for the value inspector specs: open the inspector the way a user
 * does, and read back its tree and the grid's cursor.
 *
 * The inspector is found by role and accessible name, as assistive
 * technology finds it: a `dialog` named "<column> · Row <n>" holding a
 * `tree` named "Value of <column>", whose `treeitem`s are named by their own
 * `aria-label` ("x: 1.5", "[1 … 100]"). Grid cells are found by the grid's
 * `data-row-index` and `data-column`: a cell's accessible name is its value,
 * which does not say where it is.
 *
 * What a value should show comes from `table.actions.getCellValue`, which
 * reads the cell's exact JSON by `__rowid__` and turns it into JavaScript
 * values ({@link valueSummary}), not from text built by hand.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { NESTED_HOST_ID, type NestedWindow, type TableRef } from './nested';

/**
 * A cell: its row, 0-based in the table as sorted and filtered, or -1 for
 * the column's header, as `state.focusedCell` has it; and its column.
 */
export interface CellRef {
  row: number;
  column: string;
}

/** The root a spec's table is mounted in: `mountSqlTable`'s host, or the demo's container. */
export function tableRoot(from: TableRef): string {
  return from === 'demo' ? '#table-container' : `#${NESTED_HOST_ID}`;
}

/** The grid cell at `cell`. */
export function cellAt(page: Page, cell: CellRef, from: TableRef): Locator {
  return page.locator(
    `${tableRoot(from)} .dt-body .dt-row[data-row-index="${cell.row}"] > .dt-cell[data-column="${cell.column}"]`,
  );
}

/**
 * The inspector open on `cell`, by role and accessible name: the panel's
 * title, "tags · Row 11". A closed panel is hidden, and matches nothing.
 */
export function inspectorOn(page: Page, cell: CellRef): Locator {
  return page.getByRole('dialog', {
    name: `${cell.column} · Row ${(cell.row + 1).toLocaleString('en-US')}`,
    exact: true,
  });
}

/** Any open dialog: the inspector is the only one these specs open. */
export function anyDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * Wait until the tree has focus. The panel takes focus as it opens and
 * hands it to the tree's active item once the value has been read.
 */
export async function waitForTreeFocus(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const active = document.activeElement;
      return active?.getAttribute('role') === 'treeitem' && !!active.closest('[role="dialog"]');
    },
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Put the grid's cursor on `cell`, give the grid focus, and press F2, as a
 * keyboard user does once on the cell; then wait for the tree. Placing the
 * cursor by API rather than by arrow keys leaves the cell where it is, in
 * view or not: F2 scrolls it into view itself.
 */
export async function openWithF2(page: Page, cell: CellRef, from: TableRef): Promise<Locator> {
  await page.evaluate(
    ({ cell, from }) => {
      const w = window as unknown as NestedWindow & { __dtDemo?: { table: NestedWindow['__dt'] } };
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt;
      table.actions.setFocusedCell(cell);
    },
    { cell, from },
  );
  await page.locator(`${tableRoot(from)} .dt-grid`).focus();
  await page.keyboard.press('F2');
  const dialog = inspectorOn(page, cell);
  await expect(dialog).toBeVisible();
  await waitForTreeFocus(page);
  return dialog;
}

/**
 * Press Escape in the inspector, wait for it to close, and check that the
 * page did not move: focus goes back to the grid, which is taller than the
 * window, and a plain `focus()` on it scrolls the page to its top.
 */
export async function escapeInspector(page: Page): Promise<void> {
  const before = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Escape');
  await expect(anyDialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY), 'the page scrolled on Escape').toBe(before);
}

/**
 * Wait two animation frames: long enough for an inspector that was going
 * to open to have opened. Its chunk loaded, opening takes a microtask, and
 * a press it refuses is refused at once; only a spec that already opened
 * the inspector once may rely on this.
 */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** One visible item of the open inspector's tree, as {@link treeItems} reads it. */
export interface TreeItem {
  label: string;
  level: number;
  posinset: number;
  setsize: number;
  /** `aria-expanded`; `null` on an end node, which carries none. */
  expanded: boolean | null;
  selected: boolean;
  /** The tree's one tab stop: `tabindex="0"`. */
  tabStop: boolean;
  /** Holds DOM focus. */
  focused: boolean;
}

/** Every visible item of the open inspector's tree, in order. */
export function treeItems(page: Page): Promise<TreeItem[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"] [role="tree"] > [role="treeitem"]'),
      (item) => {
        const expanded = item.getAttribute('aria-expanded');
        return {
          label: item.getAttribute('aria-label') ?? '',
          level: Number(item.getAttribute('aria-level')),
          posinset: Number(item.getAttribute('aria-posinset')),
          setsize: Number(item.getAttribute('aria-setsize')),
          expanded: expanded === null ? null : expanded === 'true',
          selected: item.getAttribute('aria-selected') === 'true',
          tabStop: item.getAttribute('tabindex') === '0',
          focused: item === document.activeElement,
        };
      },
    ),
  );
}

/**
 * The active item: the one item that is selected, is the tree's tab stop
 * and has focus. Fails when those are not one and the same item.
 */
export async function activeItem(page: Page): Promise<TreeItem> {
  const items = await treeItems(page);
  const flagged = items.filter((i) => i.selected || i.tabStop || i.focused);
  expect(flagged, 'exactly one item is selected, is the tab stop and has focus').toEqual([
    { ...flagged[0]!, selected: true, tabStop: true, focused: true },
  ]);
  return flagged[0]!;
}

/** Where the grid's cursor is: in state, and in the DOM through `aria-activedescendant`. */
export interface CursorDom {
  focusedCell: CellRef | null;
  /** `document.activeElement` is the grid. */
  gridFocused: boolean;
  /** The cell `aria-activedescendant` names, inside the grid; `null` when it names none. */
  activeDescendant: CellRef | null;
}

export function cursorDom(page: Page, from: TableRef): Promise<CursorDom> {
  return page.evaluate(
    ({ from, root }) => {
      const w = window as unknown as NestedWindow & { __dtDemo?: { table: NestedWindow['__dt'] } };
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt;
      const grid = document.querySelector<HTMLElement>(`${root} .dt-grid`)!;
      const id = grid.getAttribute('aria-activedescendant');
      const el = id ? document.getElementById(id) : null;
      // A header is the cursor's row -1, as `focusedCell` has it.
      const row = el?.classList.contains('dt-col-header')
        ? '-1'
        : el?.closest('.dt-row')?.getAttribute('data-row-index');
      const column = el?.getAttribute('data-column');
      return {
        focusedCell: table.state.focusedCell.get(),
        gridFocused: document.activeElement === grid,
        activeDescendant:
          el && grid.contains(el) && row != null && column != null
            ? { row: Number(row), column }
            : null,
      };
    },
    { from, root: tableRoot(from) },
  );
}

/**
 * What the inspector's root and its children should be named, worked out
 * from `getCellValue(rowId, column)`:
 *
 * - the root: `<column>: <type>, <n> <unit>`;
 * - a child holding a scalar: `<key>: <text>`, where a string is JSON-quoted
 *   and a number or bigint is its digits;
 * - a child holding a container: `<key>: <type>, <n> <unit>`.
 *
 * Keys are a struct's field names, a map's keys in order, a list's 1-based
 * positions, and inside JSON an object's keys or an array's 0-based
 * indexes. Types are left out: they are the column's own outline, not part
 * of the value.
 */
export interface ExpectedItem {
  key: string;
  /** A scalar child's text, exactly. */
  text?: string;
  /** A container's `, <n> <unit>`. */
  count?: string;
}

export interface ValueSummary {
  /** The root's `, <n> <unit>`. */
  count: string;
  children: ExpectedItem[];
}

export function valueSummary(
  page: Page,
  rowId: number,
  column: string,
  from: TableRef,
): Promise<ValueSummary> {
  return page.evaluate(
    async ({ rowId, column, from }) => {
      const w = window as unknown as NestedWindow & { __dtDemo?: { table: NestedWindow['__dt'] } };
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt;
      const schema = table.state.schema.get().find((c) => c.name === column)!;
      const json = /^JSON$/i.test(schema.originalType ?? '');
      let value = await table.actions.getCellValue(rowId, column);
      // A JSON column's value is its text.
      if (json && typeof value === 'string') value = JSON.parse(value);

      const words = {
        items: ['item', 'items'],
        fields: ['field', 'fields'],
        entries: ['entry', 'entries'],
        keys: ['key', 'keys'],
      } as const;
      const count = (n: number, unit: keyof typeof words): string =>
        `, ${n.toLocaleString('en-US')} ${words[unit][n === 1 ? 0 : 1]}`;
      /** A container's count, or `undefined` for a scalar. */
      const countOf = (v: unknown): string | undefined => {
        if (v instanceof Map) return count(v.size, 'entries');
        if (Array.isArray(v)) return count(v.length, 'items');
        if (v !== null && typeof v === 'object') {
          return count(Object.keys(v).length, json ? 'keys' : 'fields');
        }
        return undefined;
      };
      const textOf = (v: unknown): string =>
        typeof v === 'string' ? JSON.stringify(v) : v === null ? 'null' : String(v);
      const child = (key: string, v: unknown) => {
        const c = countOf(v);
        return c === undefined ? { key, text: textOf(v) } : { key, count: c };
      };

      let children: { key: string; text?: string; count?: string }[];
      if (value instanceof Map) {
        children = Array.from(value, ([k, v]) => child(String(k), v));
      } else if (Array.isArray(value)) {
        // DuckDB counts list positions from 1; JSONPath counts from 0.
        children = value.map((v, i) => child(String(json ? i : i + 1), v));
      } else {
        children = Object.entries(value as object).map(([k, v]) => child(k, v));
      }
      return { count: countOf(value)!, children };
    },
    { rowId, column, from },
  );
}

/**
 * Check the open inspector's tree against {@link valueSummary}: the root and
 * its children, which start expanded, by name, level and position.
 */
export async function expectTopLevel(
  page: Page,
  column: string,
  expected: ValueSummary,
): Promise<void> {
  const items = await treeItems(page);
  const root = items[0]!;
  expect(root.level).toBe(1);
  expect(root.label.startsWith(`${column}: `), `root "${root.label}"`).toBe(true);
  expect(root.label.endsWith(expected.count), `root "${root.label}"`).toBe(true);
  expect(root.expanded).toBe(true);

  const children = items.filter((i) => i.level === 2);
  expect(children.map((c) => c.posinset)).toEqual(expected.children.map((_, i) => i + 1));
  for (const [i, want] of expected.children.entries()) {
    const got = children[i]!;
    expect(got.setsize).toBe(expected.children.length);
    if (want.text !== undefined) {
      expect(got.label).toBe(`${want.key}: ${want.text}`);
    } else {
      expect(got.label.startsWith(`${want.key}: `), `child "${got.label}"`).toBe(true);
      expect(got.label.endsWith(want.count!), `child "${got.label}"`).toBe(true);
    }
  }
}
