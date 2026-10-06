/**
 * Helpers for the "extract field → column" specs: open a header's extract
 * panel, read back what it shows, and check what a new column holds and how
 * its histogram filters.
 *
 * The panel is found as assistive technology finds it: a `dialog` named
 * "Extract from <column>", opened by the header's button of the same name,
 * holding a `tree` named "Parts of <column>" and labelled fields ("Position
 * in people", "Key in attrs", "JSON path", "Read as", "Column name").
 *
 * What a new column should hold comes from DuckDB: the panel's own
 * expression preview, read beside the column in one query. What a brush on
 * its histogram should leave comes from SQL over the source column.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { type TableRef, scrollToColumn, waitForFilledBody } from './nested';
import { tableRoot } from './inspector';

/** The header's extract button for `column`. */
export function extractButton(page: Page, column: string): Locator {
  return page.getByRole('button', { name: `Extract from ${column}`, exact: true });
}

/** The extract panel open for `column`. A closed panel is hidden, and matches nothing. */
export function extractPanel(page: Page, column: string): Locator {
  return page.getByRole('dialog', { name: `Extract from ${column}`, exact: true });
}

/**
 * Scroll `column` to the view's left edge, press its extract button, and
 * wait for the panel, with focus inside it.
 */
export async function openExtractPanel(
  page: Page,
  column: string,
  from: TableRef,
): Promise<Locator> {
  await scrollToColumn(page, column, tableRoot(from));
  await waitForFilledBody(page, [column], tableRoot(from));
  await extractButton(page, column).click();
  const panel = extractPanel(page, column);
  await expect(panel).toBeVisible();
  await expect
    .poll(() => panel.evaluate((p) => p.contains(document.activeElement)), {
      message: 'focus inside the panel',
    })
    .toBe(true);
  return panel;
}

/** What the panel shows: the new column's name, its expression, why it cannot be added. */
export interface PanelState {
  name: string;
  expression: string;
  /** The error the fields are described by; `null` while there is none. */
  error: string | null;
  /** Whether Add column can be pressed. */
  canAdd: boolean;
}

export async function panelState(panel: Locator): Promise<PanelState> {
  const name = await panel.getByLabel('Column name', { exact: true }).inputValue();
  return panel.evaluate((p, name) => {
    // The error is the element the name field's description points at.
    const errorId = p.querySelector('input')!.getAttribute('aria-describedby')!.split(' ').at(-1)!;
    const error = document.getElementById(errorId)!;
    const add = Array.from(p.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add column',
    )!;
    return {
      name,
      expression: p.querySelector('code')?.textContent ?? '',
      error: error.hidden ? null : error.textContent,
      canAdd: !add.disabled,
    };
  }, name);
}

/** The table, where a spec's `page.evaluate` callback needs it. */
type AnyTableWindow = {
  __dt?: import('../../../src/index').DataTable;
  __dtDemo?: { table: import('../../../src/index').DataTable };
};

/**
 * Compare `column` with `expression`, as DuckDB writes each as text, in the
 * rows `where` picks: the rows where they differ, as `rowid: got ≠ want`,
 * and how many rows were compared.
 */
export function columnAgainstExpression(
  page: Page,
  from: TableRef,
  column: string,
  expression: string,
  where: string,
): Promise<{ compared: number; nulls: number; wrong: string[] }> {
  return page.evaluate(
    async ({ from, column, expression, where }) => {
      const w = window as unknown as AnyTableWindow;
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt!;
      const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
      const rows = await table.bridge.query<{ r: number; want: string | null; got: string | null }>(
        `SELECT "__rowid__" AS r, CAST((${expression}) AS VARCHAR) AS want,
           CAST(${quote(column)} AS VARCHAR) AS got
         FROM ${quote(table.state.tableName.get()!)} WHERE ${where} ORDER BY 1`,
      );
      const wrong = rows
        .filter((row) => row.want !== row.got)
        .slice(0, 20)
        .map((row) => `${row.r}: ${row.got} ≠ ${row.want}`);
      return {
        compared: rows.length,
        nulls: rows.filter((row) => row.want === null).length,
        wrong,
      };
    },
    { from, column, expression, where },
  );
}

/** The canvas of `column`'s header chart. */
export function chartOf(page: Page, column: string, from: TableRef): Locator {
  return page.locator(
    `${tableRoot(from)} .dt-col-header[data-column="${column}"] .dt-col-viz canvas`,
  );
}

/**
 * Brush `column`'s histogram from a quarter of its width to three fifths of
 * it, with the mouse, and wait for the range filter the brush makes.
 */
export async function brush(page: Page, column: string, from: TableRef): Promise<void> {
  const box = (await chartOf(page, column, from).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ from, column }) => {
            const w = window as unknown as AnyTableWindow;
            const table = from === 'demo' ? w.__dtDemo!.table : w.__dt!;
            return table.state.filters.get().find((f) => f.column === column)?.type ?? null;
          },
          { from, column },
        ),
      { message: `a range filter on ${column}` },
    )
    .toBe('range');
}

/**
 * The rows the table counts with its filters on, and the rows SQL counts
 * where `source` lies within `column`'s range filter, its bounds as the
 * filter has them; and the table's row count, so a brush that kept every row
 * or none shows.
 */
export function brushCounts(
  page: Page,
  from: TableRef,
  column: string,
  source: string,
): Promise<{ shown: number; sql: number; total: number }> {
  return page.evaluate(
    async ({ from, column, source }) => {
      const w = window as unknown as AnyTableWindow;
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt!;
      const f = table.state.filters.get().find((f) => f.column === column);
      if (f?.type !== 'range') throw new Error(`no range filter on ${column}`);
      const lower = `${source} ${f.minExclusive ? '>' : '>='} ${Number(f.min)}`;
      const upper = `${source} ${f.maxInclusive ? '<=' : '<'} ${Number(f.max)}`;
      const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
      const [row] = await table.bridge.query<{ n: number | bigint }>(
        `SELECT count(*) AS n FROM ${quote(table.state.tableName.get()!)} WHERE ${lower} AND ${upper}`,
      );
      return {
        shown: table.state.filteredRows.get(),
        sql: Number(row!.n),
        total: table.state.totalRows.get(),
      };
    },
    { from, column, source },
  );
}
