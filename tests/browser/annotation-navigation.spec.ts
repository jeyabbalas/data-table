/**
 * Annotation navigation in a real browser: `F8` / `Shift+F8` and
 * `Alt+↓` / `Alt+↑` on two million rows under compressed scrolling, where
 * a row's `__rowid__` is its position and the rendered rows prove where the
 * view is; jumps in a sorted and a filtered view, whose positions are worked
 * out from the generator's formula; `revealRow` deep in the table; and on a
 * 300-column table, the annotated column brought into view, a hidden one
 * named, the tab-stop census unchanged and axe clean.
 *
 * jsdom cannot see these: it lays nothing out, so neither the scroll
 * position a jump lands at nor the column scrolled into view exists there.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  BIG_TABLE_HOST_ID,
  mountBigTable,
  readVisibleRows,
  waitForRowsResolved,
} from './helpers/bigTable';
import { installProbes, settle } from './helpers/demo';
import { HOST_ID, mountTable, type TestWindow } from './helpers/table';

type BigWindow = { __t: import('../../src/index').DataTable };

const ROWS = 2_000_000;

/**
 * The generated table's `val` is `(i % 1000) / 10`: two thousand rows a
 * value. Sorted on it descending (ties by `__rowid__`), row `i` is at
 * `(999 - i % 1000) * 2000 + floor(i / 1000)`.
 */
const sortedPosition = (i: number): number => (999 - (i % 1000)) * 2000 + Math.floor(i / 1000);

/** Where the cursor is, and what the live region last said. */
async function landing(
  page: Page,
  host: string,
): Promise<{
  cursor: { row: number; column: string } | null;
  said: string;
}> {
  return page.evaluate((host) => {
    const w = window as unknown as Partial<BigWindow & TestWindow>;
    const table = w.__t ?? w.__dt!;
    return {
      cursor: table.state.focusedCell.get(),
      said: document.querySelector(`#${host} .dt-announce`)?.textContent ?? '',
    };
  }, host);
}

/**
 * Press `key` with the grid focused, and wait for the cursor to reach `row`
 * and, when given, for the live region to say `said` (for a jump that ends
 * on the row the cursor is on).
 */
async function pressTo(
  page: Page,
  host: string,
  key: string,
  row: number,
  said?: RegExp,
): Promise<{ cursor: { row: number; column: string } | null; said: string }> {
  await page.locator(`#${host} .dt-grid`).focus();
  await page.keyboard.press(key);
  await expect
    .poll(
      async () => {
        const now = await landing(page, host);
        return now.cursor?.row === row && (!said || said.test(now.said));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return landing(page, host);
}

/** The `__rowid__` of the rendered row at view position `row`, once rows have resolved. */
async function renderedRowId(page: Page, row: number): Promise<number | null> {
  await waitForRowsResolved(page);
  return page.evaluate(
    ({ host, row }) => {
      const el = document.querySelector(`#${host} .dt-body .dt-row[data-row-index="${row}"]`);
      return el ? Number(el.getAttribute('data-row-id')) : null;
    },
    { host: BIG_TABLE_HOST_ID, row },
  );
}

test('F8, Shift+F8 and Alt+↓/↑ go through the annotations of two million rows', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await mountBigTable(page, { rows: ROWS });
  await page.evaluate(() => {
    const { annotations } = (window as unknown as BigWindow).__t;
    annotations.addMany([
      { scope: 'cell', rowId: 3, column: 'grp', severity: 'warning', message: 'odd group' },
      { scope: 'cell', rowId: 999, column: 'val', severity: 'error', message: 'too high' },
      { scope: 'row', rowId: 250_000, severity: 'info', message: 'checked' },
      { scope: 'cell', rowId: 1_234_567, column: 'val', severity: 'error', message: 'too high' },
      { scope: 'row', rowId: 1_234_567, severity: 'info', message: 'and the row' },
      { scope: 'row', rowId: 1_999_999, severity: 'error', message: 'last row' },
    ]);
  });
  const host = BIG_TABLE_HOST_ID;

  await test.step('forward, from no cursor', async () => {
    expect(await pressTo(page, host, 'F8', 3)).toEqual({
      cursor: { row: 3, column: 'grp' },
      said: 'Row 4 of 2,000,000, grp: warning, odd group',
    });
    expect((await pressTo(page, host, 'F8', 999)).cursor).toEqual({ row: 999, column: 'val' });
    // Row annotations only: the cursor keeps its column.
    expect(await pressTo(page, host, 'Alt+ArrowDown', 250_000)).toEqual({
      cursor: { row: 250_000, column: 'val' },
      said: 'Row 250,001 of 2,000,000: info, checked',
    });
    expect(await pressTo(page, host, 'Alt+ArrowDown', 1_234_567)).toEqual({
      cursor: { row: 1_234_567, column: 'val' },
      said: 'Row 1,234,568 of 2,000,000, val: error, too high, and 1 more',
    });
    expect((await pressTo(page, host, 'F8', 1_999_999)).said).toBe(
      'Row 2,000,000 of 2,000,000: error, last row',
    );
    // The view is where the cursor is: the oracle row is rendered, and in view.
    await waitForRowsResolved(page);
    const rows = await readVisibleRows(page);
    expect(rows.some((r) => r.index === 1_999_999 && r.rowid === 1_999_999)).toBe(true);
    expect(rows.every((r) => r.index === r.rowid)).toBe(true);
  });

  await test.step('round the end, both ways', async () => {
    expect((await pressTo(page, host, 'F8', 3)).said).toBe(
      'Wrapped to the first annotation. Row 4 of 2,000,000, grp: warning, odd group',
    );
    expect((await pressTo(page, host, 'Shift+F8', 1_999_999)).said).toBe(
      'Wrapped to the last annotation. Row 2,000,000 of 2,000,000: error, last row',
    );
    expect((await pressTo(page, host, 'Alt+ArrowUp', 1_234_567)).cursor?.row).toBe(1_234_567);
  });

  await test.step('revealRow deep in the table', async () => {
    const shown = await page.evaluate(() =>
      (window as unknown as BigWindow).__t.actions.revealRow(1_876_543, 'grp'),
    );
    expect(shown).toEqual({ row: 1_876_543, column: 'grp' });
    expect((await landing(page, host)).cursor).toEqual({ row: 1_876_543, column: 'grp' });
    await waitForRowsResolved(page);
    const rows = await readVisibleRows(page);
    expect(rows.some((r) => r.index === 1_876_543 && r.rowid === 1_876_543)).toBe(true);
  });

  await test.step('sorted: each jump lands where the sort puts the row', async () => {
    await page.evaluate(() => {
      const { actions } = (window as unknown as BigWindow).__t;
      actions.setSort([{ column: 'val', direction: 'desc' }]);
      actions.clearFocusedCell();
    });
    await waitForRowsResolved(page);
    // val 99.9 first: rows 999 and 1,999,999, then 1,234,567 (56.7), 3 (0.3), 250,000 (0).
    for (const rowId of [999, 1_999_999, 1_234_567, 3, 250_000]) {
      const row = sortedPosition(rowId);
      await pressTo(page, host, 'F8', row);
      expect(await renderedRowId(page, row), `row ${row}`).toBe(rowId);
    }
    expect((await pressTo(page, host, 'F8', 0)).said).toMatch(/^Wrapped to the first annotation/);
    const shown = await page.evaluate(() =>
      (window as unknown as BigWindow).__t.actions.revealRow(1_234_567),
    );
    expect(shown?.row).toBe(sortedPosition(1_234_567));
  });

  await test.step('filtered: the one annotated row the filter shows', async () => {
    await page.evaluate(() => {
      const { actions } = (window as unknown as BigWindow).__t;
      actions.clearSort();
      actions.addFilter({ type: 'range', column: 'val', min: 50, max: 60 });
    });
    // val in [50, 60): 100 rows in each thousand. Below 1,234,567: 1,234
    // whole thousands, and rows 1,234,500 to 1,234,566.
    const row = 1234 * 100 + 67;
    expect((await pressTo(page, host, 'F8', row)).said).toBe(
      'Row 123,468 of 200,000, val: error, too high, and 1 more',
    );
    expect(await renderedRowId(page, row)).toBe(1_234_567);
    await pressTo(
      page,
      host,
      'Shift+F8',
      row,
      /^Wrapped to the last annotation\. Row 123,468 of 200,000/,
    );
    const hidden = await page.evaluate(() =>
      (window as unknown as BigWindow).__t.actions.revealRow(999),
    );
    expect(hidden).toBe(null);
  });
});

test('a 300-column table: the annotated column comes into view, a hidden one is named', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await installProbes(page);
  await mountTable(page, { columns: 300, rows: 200 });
  const root = `#${HOST_ID} .dt-root`;
  const census = (): Promise<string[]> =>
    page.evaluate((selector) => window.__dtA11y.partition(selector).inside, root);
  const before = await census();
  expect(before, before.join(', ')).toHaveLength(5);

  await page.evaluate(() => {
    const { annotations } = (window as unknown as TestWindow).__dt;
    annotations.add({
      scope: 'cell',
      rowId: 120,
      column: 'c250',
      severity: 'error',
      message: 'out of range',
    });
  });
  expect((await pressTo(page, HOST_ID, 'F8', 120)).said).toBe(
    'Row 121 of 200, c250: error, out of range',
  );
  await settle(page);
  const view = await page.evaluate(() => {
    const probes = (window as unknown as TestWindow).__dtTest;
    return { cursor: probes.cursor(), column: probes.column('c250') };
  });
  expect(view.cursor.focused).toEqual({ row: 120, column: 'c250' });
  expect(view.cursor.target).toMatchObject({ column: 'c250', ringed: true, inView: true });
  expect(view.column?.inView).toBe(true);
  // Nothing became focusable.
  expect(await census()).toEqual(before);

  const axe = await new AxeBuilder({ page }).include(root).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual(
    [],
  );

  // Hidden: the cursor keeps its column, and the announcement names it.
  await page.evaluate(() => {
    const { actions } = (window as unknown as TestWindow).__dt;
    actions.hideColumn('c250');
    actions.setFocusedCell({ row: 3, column: 'c010' });
  });
  expect(await pressTo(page, HOST_ID, 'F8', 120)).toEqual({
    cursor: { row: 120, column: 'c010' },
    said: 'Row 121 of 200, c250 (hidden): error, out of range',
  });
  expect(await census()).toEqual(before);
});

test('under the annotated filter, F8 goes through the rows it shows', async ({ page }) => {
  test.setTimeout(180_000);
  await mountBigTable(page, { rows: 300_000 });
  await page.evaluate(() => {
    const t = (window as unknown as BigWindow).__t;
    t.annotations.addMany([
      { scope: 'cell', rowId: 3, column: 'grp', severity: 'warning', message: 'odd group' },
      { scope: 'cell', rowId: 999, column: 'val', severity: 'error', message: 'too high' },
      { scope: 'row', rowId: 250_000, severity: 'info', message: 'checked' },
      { scope: 'row', rowId: 299_999, severity: 'error', message: 'last row' },
      // Singles out no row.
      { scope: 'column', column: 'id', severity: 'error', message: 'whole column' },
    ]);
    t.actions.showAnnotatedRows();
  });
  const host = BIG_TABLE_HOST_ID;
  const count = (): Promise<number> =>
    page.evaluate(() => (window as unknown as BigWindow).__t.state.filteredRows.get());
  await expect.poll(count).toBe(4);

  expect(await pressTo(page, host, 'F8', 0)).toEqual({
    cursor: { row: 0, column: 'grp' },
    said: 'Row 1 of 4, grp: warning, odd group',
  });
  expect(await renderedRowId(page, 0)).toBe(3);
  expect((await pressTo(page, host, 'F8', 1)).cursor).toEqual({ row: 1, column: 'val' });
  expect(await renderedRowId(page, 1)).toBe(999);
  expect(await pressTo(page, host, 'Alt+ArrowDown', 2)).toEqual({
    cursor: { row: 2, column: 'val' },
    said: 'Row 3 of 4: info, checked',
  });
  expect((await pressTo(page, host, 'F8', 3)).said).toBe('Row 4 of 4: error, last row');
  expect((await pressTo(page, host, 'F8', 0)).said).toBe(
    'Wrapped to the first annotation. Row 1 of 4, grp: warning, odd group',
  );

  // Errors only: two rows, and F8 visits those.
  await page.evaluate(() =>
    (window as unknown as BigWindow).__t.actions.showAnnotatedRows({ severities: ['error'] }),
  );
  await expect.poll(count).toBe(2);
  await pressTo(page, host, 'F8', 0, /^Row 1 of 2, val: error, too high$/);
  expect(await renderedRowId(page, 0)).toBe(999);
  expect((await pressTo(page, host, 'F8', 1)).said).toBe('Row 2 of 2: error, last row');
  expect(await renderedRowId(page, 1)).toBe(299_999);
});

test('under the annotated filter, removing an annotation refreshes the view in place, scroll and cursor kept', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await mountBigTable(page, { rows: 300_000 });
  // Every third row: 100,000 annotated rows, rowId 3p at position p.
  const ids = await page.evaluate(() => {
    const t = (window as unknown as BigWindow).__t;
    const anns = [];
    for (let rowId = 0; rowId < 300_000; rowId += 3) {
      anns.push({
        scope: 'row' as const,
        rowId,
        severity: 'warning' as const,
        message: `r${rowId}`,
      });
    }
    const added = t.annotations.addMany(anns);
    const errors: string[] = [];
    (window as unknown as { __errors: string[] }).__errors = errors;
    t.on('error', ({ error, source }) => errors.push(`${source}: ${error.message}`));
    t.actions.showAnnotatedRows();
    return { first: added[10]!.id };
  });
  const count = (): Promise<number> =>
    page.evaluate(() => (window as unknown as BigWindow).__t.state.filteredRows.get());
  await expect.poll(count).toBe(100_000);

  const shown = await page.evaluate(() =>
    (window as unknown as BigWindow).__t.actions.revealRow(150_000, 'grp'),
  );
  expect(shown).toEqual({ row: 50_000, column: 'grp' });
  expect(await renderedRowId(page, 50_000)).toBe(150_000);
  const scrollTop = (): Promise<number> =>
    page.evaluate(
      (host) => document.querySelector(`#${host} .dt-body-scroll`)!.scrollTop,
      BIG_TABLE_HOST_ID,
    );
  const before = await scrollTop();
  expect(before).toBeGreaterThan(0);
  // Watch the scroll position from here on: the view must never go back to the top.
  await page.evaluate((host) => {
    const scroller = document.querySelector(`#${host} .dt-body-scroll`)!;
    const w = window as unknown as { __minScroll: number };
    w.__minScroll = scroller.scrollTop;
    scroller.addEventListener('scroll', () => {
      w.__minScroll = Math.min(w.__minScroll, scroller.scrollTop);
    });
  }, BIG_TABLE_HOST_ID);

  // Far above the cursor: rowId 30, at position 10.
  await page.evaluate(
    (id) => (window as unknown as BigWindow).__t.annotations.remove(id),
    ids.first,
  );
  await expect.poll(count).toBe(99_999);
  // Each row from position 10 on moved up one: position 50,000 is rowId 150,003 now.
  await expect.poll(() => renderedRowId(page, 50_000), { timeout: 30_000 }).toBe(150_003);
  expect(Math.abs((await scrollTop()) - before)).toBeLessThan(2);
  expect(
    await page.evaluate(() => (window as unknown as { __minScroll: number }).__minScroll),
  ).toBeGreaterThan(before - 2);
  expect((await landing(page, BIG_TABLE_HOST_ID)).cursor).toEqual({ row: 50_000, column: 'grp' });
  expect(await page.evaluate(() => (window as unknown as { __errors: string[] }).__errors)).toEqual(
    [],
  );
});
