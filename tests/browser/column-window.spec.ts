/**
 * The columns `ColumnWindowController` publishes to mount, and the body rows
 * that render only those, against real layout and real wheel scrolling.
 *
 * Whatever is in view is mounted, in every frame of a sweep, and every row
 * holds exactly the mounted columns. The set stays a few viewports wide. A
 * small scroll leaves it alone. The cursor's column is in it wherever the view
 * goes. And what a sweep leaves in view shows the right values, lined up
 * under the right headers.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import {
  HOST_ID,
  type TestWindow,
  mountTable,
  probe,
  wheelBy,
  wheelIntoView,
} from './helpers/table';

/** Whether `column` is mounted, and how many body rows with data have a cell for it. */
async function mountedWithCells(
  page: Page,
  column: string,
): Promise<{ mounted: boolean; rowsWithCell: number; rows: number }> {
  const mounted = (await probe(page, 'mounted')).includes(column);
  return page.evaluate(
    ({ hostId, column, mounted }) => {
      const rows = Array.from(
        document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`),
      );
      const rowsWithCell = rows.filter((r) =>
        r.querySelector(`.dt-cell[data-column="${column}"]`),
      ).length;
      return { mounted, rowsWithCell, rows: rows.length };
    },
    { hostId: HOST_ID, column, mounted },
  );
}

/** Wheel the body with the pointer over its bottom-left corner, clear of any panel. */
async function wheelBodyCorner(page: Page, dx: number): Promise<void> {
  const box = (await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height - 40);
  await wheelBy(page, dx, { over: 'pointer' });
}

test('every column in view is mounted, in every frame of a sweep across 400 columns', async ({
  page,
}) => {
  await mountTable(page, { columns: 400, rows: 40 });
  await probe(page, 'watchWindow');
  await wheelBy(page, 30_000);
  await wheelBy(page, -15_000);
  await wheelBy(page, 60_000);
  const report = await probe(page, 'windowReport');
  expect(report.frames).toBeGreaterThan(10);
  expect(report.breaches).toEqual([]);

  // At the far right of a 1,200px view of 150px columns: the eight in view,
  // and up to a viewport's worth either side of the view where the set was
  // last recomputed.
  const mounted = await probe(page, 'mounted');
  expect(mounted.at(-1)).toBe('c399');
  expect(mounted.length).toBeLessThanOrEqual(8 * 3 + 2);
});

test('a scroll back and forth across a column or two leaves the mounted columns alone', async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  await wheelBy(page, 20_000);
  // Where a sweep stops, the set may have only the half viewport of slack
  // that a scroll keeps, and a jiggle could fairly move it. A layout change
  // recomputes it around the view, with a whole viewport either side.
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setColumnWidth('c000', 160),
  );
  await probe(page, 'watchWindow');
  for (const dx of [150, -150, 300, -300, 150, -150]) {
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(50);
  }
  const report = await probe(page, 'windowReport');
  expect(report.breaches).toEqual([]);
  expect(report.changes).toBe(0);
});

test("the cursor's column stays mounted wherever the view goes, and so does a focused cell's", async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 2, column: 'c003' }),
  );
  await wheelBy(page, 25_000);
  expect((await probe(page, 'column', 'c003'))!.inView).toBe(false);
  expect(await probe(page, 'mounted')).toContain('c003');

  // A cell clicked on holds DOM focus, and keeps its column when the cursor
  // is moved elsewhere in code.
  const column = (await probe(page, 'inView'))[2]!;
  await page
    .locator(`#${HOST_ID} .dt-row[data-row-index="1"] .dt-cell[data-column="${column}"]`)
    .click();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 1, column: 'c299' }),
  );
  await wheelBy(page, -20_000);
  expect((await probe(page, 'column', column))!.inView).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-column'))).toBe(
    column,
  );
  expect(await probe(page, 'mounted')).toEqual(expect.arrayContaining(['c299', column]));
});

test('body rows hold only the mounted columns through a sweep of 1,000 columns, and show the right values', async ({
  page,
}) => {
  await mountTable(page, { columns: 1000, rows: 60 });
  await probe(page, 'watchWindow');
  for (const dx of [40_000, -25_000, 150_000, -60_000]) {
    await wheelBy(page, dx);
    // Rows fetched without the columns now in view get them a moment later.
    await expect
      .poll(() => probe(page, 'wrongCellsInView'), { message: `after a wheel of ${dx}px` })
      .toEqual([]);
    const misaligned = await probe(page, 'cellHeaderMisalignment');
    expect(misaligned.px, `cell of ${misaligned.column} under its header`).toBeLessThan(1);
  }
  const report = await probe(page, 'windowReport');
  expect(report.frames).toBeGreaterThan(10);
  expect(report.breaches).toEqual([]);

  // A row renders the eight columns in view, a viewport either side, and
  // nothing else: some two dozen cells, not a thousand.
  const mounted = await probe(page, 'mounted');
  expect(mounted.length).toBeLessThanOrEqual(8 * 3 + 2);
  const { rows, cells } = await probe(page, 'bodyCells');
  expect(rows).toBeGreaterThan(10);
  expect(cells).toBe(rows * mounted.length);
});

test('a pinned column keeps its cells at the left edge however far the rows scroll', async ({
  page,
}) => {
  await mountTable(page, { columns: 400 });
  await page.evaluate(() => (window as unknown as TestWindow).__dt.actions.toggleColumnPin('c200'));
  await wheelBy(page, 30_000);
  expect((await probe(page, 'mounted'))[0]).toBe('c200');
  expect(await probe(page, 'wrongCellsInView')).toEqual([]);
  const misaligned = await probe(page, 'cellHeaderMisalignment');
  expect(misaligned.px, `cell of ${misaligned.column} under its header`).toBeLessThan(1);
  const pinned = await page
    .locator(`#${HOST_ID} .dt-row[data-row-index="0"] .dt-cell[data-column="c200"]`)
    .boundingBox();
  const body = await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox();
  expect(pinned!.x).toBe(body!.x);
});

test('a column set narrower than its padding keeps its cells under its header', async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  // Only code can set such a width; it is drawn at the 50px minimum.
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setColumnWidth('c005', 0),
  );
  await wheelBy(page, 20_000);
  const misaligned = await probe(page, 'cellHeaderMisalignment');
  expect(misaligned.px, `cell of ${misaligned.column} under its header`).toBeLessThan(1);
});

test('undoing a column move keeps focus in the grid when a clicked cell had it', async ({
  page,
}) => {
  await mountTable(page, { columns: 40 });
  await page.evaluate(() => {
    const { actions, state } = (window as unknown as TestWindow).__dt;
    const order = [...state.visibleColumns.get()];
    order.splice(1, 0, order.splice(8, 1)[0]!);
    actions.setColumnOrder(order);
  });
  await page.locator(`#${HOST_ID} .dt-row[data-row-index="1"] .dt-cell[data-column="c05"]`).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('.dt-grid') !== null))
    .toBe(true);
  // And the keyboard still drives the table.
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => (await probe(page, 'cursor')).focused)
    .toEqual({ row: 2, column: 'c05' });
});

test('row fetches select the columns near the view, not all 1,000', async ({ page }) => {
  await mountTable(page, { columns: 1000, rows: 400 });
  const atLoad = await probe(page, 'rowFetchWidths');
  expect(atLoad.length).toBeGreaterThan(0);
  // The eight columns in view and a viewport to their right, widened by as
  // many again and rounded out to 16: 32.
  expect(Math.max(...atLoad)).toBe(32);

  // Far along, down some rows, and back: every fetch stays near the view.
  await wheelBy(page, 60_000);
  await page.mouse.wheel(0, 6_000);
  await wheelBy(page, -30_000);
  await expect.poll(() => probe(page, 'wrongCellsInView')).toEqual([]);
  const later = await probe(page, 'rowFetchWidths');
  expect(later.length).toBeGreaterThan(0);
  expect(Math.max(...later)).toBeLessThanOrEqual(96);
});

test('on a right-to-left page the grid scrolls left to right, and cells keep their own text direction', async ({
  page,
}) => {
  await mountTable(page, { columns: 300 });
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  const styles = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const style = (selector: string) => getComputedStyle(host.querySelector(selector)!);
    return {
      grid: style('.dt-grid').direction,
      cell: style('.dt-body .dt-cell').unicodeBidi,
      name: style('.dt-col-name').unicodeBidi,
    };
  }, HOST_ID);
  expect(styles).toEqual({ grid: 'ltr', cell: 'plaintext', name: 'plaintext' });

  await wheelBy(page, 20_000);
  await expect.poll(() => probe(page, 'wrongCellsInView')).toEqual([]);
  // What is on screen, found by position rather than from state: under the
  // middle of each header in view, a cell of the same column.
  const mismatches = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const body = host.querySelector('.dt-body-scroll')!.getBoundingClientRect();
    const header = host.querySelector('.dt-header-scroll')!.getBoundingClientRect();
    const out: string[] = [];
    for (let x = body.left + 40; x < body.right - 40; x += 75) {
      const h = document.elementFromPoint(x, header.top + 10)?.closest('.dt-col-header');
      const c = document.elementFromPoint(x, body.top + 50)?.closest('.dt-cell');
      const hc = h?.getAttribute('data-column') ?? null;
      const cc = c?.getAttribute('data-column') ?? null;
      if (hc === null || hc !== cc) out.push(`${Math.round(x)}: header ${hc}, cell ${cc}`);
    }
    return out;
  }, HOST_ID);
  expect(mismatches).toEqual([]);
});

test('the cursor names its cell only once the cell has its value', async ({ page }) => {
  await mountTable(page, { columns: 1000 });
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setFocusedCell({ row: 2, column: 'c000' }),
  );
  // Every value `aria-activedescendant` takes, with what it names then.
  await page.evaluate((hostId) => {
    const grid = document.querySelector(`#${hostId} .dt-grid`)!;
    const seen: string[] = [];
    (window as unknown as { __named: string[] }).__named = seen;
    new MutationObserver(() => {
      const id = grid.getAttribute('aria-activedescendant');
      const el = id ? document.getElementById(id) : null;
      seen.push(
        el
          ? `${el.getAttribute('data-column')} "${el.textContent}"${
              el.classList.contains('dt-cell--pending') ? ' pending' : ''
            }`
          : 'none',
      );
    }).observe(grid, { attributeFilter: ['aria-activedescendant'] });
  }, HOST_ID);

  // The far end: rows were fetched with the columns near the start only.
  await page.keyboard.press('End');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __named: string[] }).__named.at(-1)))
    .toMatch(/^c999 "\S+"$/);
  const named = await page.evaluate(() => (window as unknown as { __named: string[] }).__named);
  expect(named.filter((entry) => entry.includes('pending') || entry.endsWith('""'))).toEqual([]);
});

test('on a sorted table, a fast sideways fling ends with every cell in view right', async ({
  page,
}) => {
  await mountTable(page, { columns: 400, rows: 3000 });
  await page.evaluate(() => (window as unknown as TestWindow).__dt.actions.toggleSort('c000'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector('.dt-row[data-row-index="0"]')?.getAttribute('data-row-id'),
      ),
    )
    .not.toBe('0');
  // Far past what the rows were fetched with, faster than a fetch: the
  // columns come by row id, without sorting the table again.
  const box = (await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(1200, 0);
    await page.waitForTimeout(50);
  }
  await expect.poll(() => probe(page, 'wrongCellsInView'), { timeout: 10_000 }).toEqual([]);
});

test('a column in use stays mounted, cells and all, while the wheel takes it away', async ({
  page,
}) => {
  await mountTable(page);
  const header = (column: string) =>
    page.locator(`#${HOST_ID} .dt-col-header[data-column="${column}"]`);
  const expectHeld = async (column: string) => {
    expect((await probe(page, 'column', column))!.inView).toBe(false);
    const now = await mountedWithCells(page, column);
    expect(now.mounted).toBe(true);
    expect(now.rows).toBeGreaterThan(0);
    expect(now.rowsWithCell).toBe(now.rows);
  };

  // A resize drag, with the button held while the wheel scrolls. The column
  // is one in the middle of the view: the pointer has to stay over the grid.
  await wheelBy(page, 20_000);
  const resized = (await probe(page, 'inView'))[3]!;
  let box = (await header(resized).locator('.dt-col-resize-handle').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 2 });
  await wheelBy(page, 8_000, { over: 'pointer' });
  await expectHeld(resized);
  await page.mouse.up();
  await settle(page);
  expect((await mountedWithCells(page, resized)).mounted).toBe(false);

  // A drag-reorder, likewise.
  const dragged = (await probe(page, 'inView'))[3]!;
  box = (await header(dragged).locator('.dt-col-drag-handle').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 3 });
  await wheelBy(page, -8_000, { over: 'pointer' });
  await expectHeld(dragged);
  await page.mouse.up();
  await settle(page);
  // Dropped under the pointer, in view; held no longer once it scrolls away.
  await wheelBy(page, 10_000);
  expect((await mountedWithCells(page, dragged)).mounted).toBe(false);

  // An open filter panel, and a derived-column editor: held until they
  // close, and focus has left the button they give it back to.
  const added = await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.addDerivedColumn({
      kind: 'expression',
      name: 'd_sum',
      expression: 'c000 + c002',
    }),
  );
  expect(added.success).toBe(true);
  await settle(page);
  for (const [column, button, dx] of [
    ['c200', '.dt-col-filter-btn', 8_000],
    ['d_sum', '.dt-derived-icon-btn', -8_000],
  ] as const) {
    await wheelIntoView(page, column);
    await header(column).locator(button).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => !!document.activeElement?.closest('.dt-filter-panel, .dt-derived-edit-panel'),
        ),
      )
      .toBe(true);
    await wheelBodyCorner(page, dx);
    await expectHeld(column);
    // Closing gives focus back to the button, and the column comes into view.
    await page.keyboard.press('Escape');
    await settle(page);
    expect(
      await page.evaluate(() =>
        document.activeElement?.closest('[data-column]')?.getAttribute('data-column'),
      ),
    ).toBe(column);
    // Out of controls mode: nothing is holding the column any more.
    await page.keyboard.press('Escape');
    await wheelBodyCorner(page, dx);
    expect((await mountedWithCells(page, column)).mounted, column).toBe(false);
  }

  // A panel switched to another column holds that one instead, and gives
  // focus back to the button that switched it.
  await wheelIntoView(page, 'c202');
  await header('c201').locator('.dt-col-filter-btn').click();
  await header('c202').locator('.dt-col-filter-btn').click();
  // The click leaves focus on c202's button, whose focus would hold the
  // column by itself; into the panel, so only the panel holds it.
  await page.locator(`#${HOST_ID} .dt-filter-panel-close`).focus();
  await wheelBodyCorner(page, 8_000);
  await expectHeld('c202');
  expect((await mountedWithCells(page, 'c201')).mounted).toBe(false);
  await page.keyboard.press('Escape');
  await settle(page);
  expect(
    await page.evaluate(() =>
      document.activeElement?.closest('[data-column]')?.getAttribute('data-column'),
    ),
  ).toBe('c202');
});
