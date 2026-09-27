/**
 * Column geometry on a host page without a `box-sizing` reset.
 *
 * Everything that places a column adds widths from `columnWidths` up: the
 * header against the body, keyboard scroll-into-view, pinned offsets, the
 * horizontal scroll extent. Those sums are only true when a column occupies
 * exactly its declared width. The demo's global `* { box-sizing: border-box }`
 * made that so for every other spec in this suite; a host page without such a
 * reset got content-box cells 25px wider than the arithmetic, and none of the
 * resulting drift was visible to a test. These specs strip the reset and
 * mount a table directly, so the library's own stylesheet is all that stands
 * between the declared width and the occupied one.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

const COLUMNS = 40;
const DECLARED_WIDTH = 150;

/**
 * Mount a 40-column table in a host `width` px wide, on a page whose reset
 * has been overridden back to content-box.
 */
function mountWithoutReset(page: Page, width: number): Promise<void> {
  return mountTable(page, { columns: COLUMNS, rows: 60, width, height: 480, contentBox: true });
}

interface ColumnBox {
  column: string;
  headerLeft: number;
  headerWidth: number;
  cellLeft: number;
  cellWidth: number;
}

/**
 * Header and cell boxes for every column the first body row renders, in
 * presented order, and where that row and the header row end. A row renders
 * only the columns near the view, with spacers for the rest, so its end is
 * where the spacers' arithmetic shows.
 */
function columnBoxes(
  page: Page,
): Promise<{ boxes: ColumnBox[]; rowEnd: number; headerEnd: number }> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const row = host.querySelector('.dt-body .dt-row:not([data-placeholder])')!;
    const headers = host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]');
    const boxes = Array.from(row.querySelectorAll<HTMLElement>('.dt-cell[data-column]'), (cell) => {
      const column = cell.dataset.column!;
      const header = Array.from(headers).find((h) => h.dataset.column === column)!;
      const h = header.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      return {
        column,
        headerLeft: h.left,
        headerWidth: h.width,
        cellLeft: c.left,
        cellWidth: c.width,
      };
    });
    return {
      boxes,
      rowEnd: row.lastElementChild!.getBoundingClientRect().right,
      headerEnd: headers[headers.length - 1]!.getBoundingClientRect().right,
    };
  }, HOST_ID);
}

function expectAligned({
  boxes,
  rowEnd,
  headerEnd,
}: {
  boxes: ColumnBox[];
  rowEnd: number;
  headerEnd: number;
}): void {
  // The view and a viewport either side, at the least.
  expect(boxes.length).toBeGreaterThanOrEqual(6);
  expect(rowEnd, 'the row ends where the header row does').toBeCloseTo(headerEnd, 0);
  for (const box of boxes) {
    expect(box.headerWidth, `${box.column} header width`).toBeCloseTo(DECLARED_WIDTH, 0);
    expect(box.cellWidth, `${box.column} cell width`).toBeCloseTo(DECLARED_WIDTH, 0);
    expect(box.headerLeft, `${box.column} header over its cells`).toBeCloseTo(box.cellLeft, 0);
  }
}

test('a column occupies its declared width, and its header sits over its cells', async ({
  page,
}) => {
  await mountWithoutReset(page, 1200);
  expectAligned(await columnBoxes(page));
});

test('headers stay over their cells in a table narrower than 550px', async ({ page }) => {
  // Below 550px the header's padding shrinks and the cells' does not. Under
  // content-box that moved every header 8px further left of its cells.
  await mountWithoutReset(page, 500);
  expect(
    await page.evaluate(
      (hostId) =>
        getComputedStyle(document.querySelector(`#${hostId} .dt-col-header`)!).paddingLeft,
      HOST_ID,
    ),
  ).toBe('8px');
  expectAligned(await columnBoxes(page));
});

test('rows sit at multiples of the row height, and the table fits its container', async ({
  page,
}) => {
  await mountWithoutReset(page, 1200);
  const rows = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const tops = Array.from(
      host.querySelectorAll('.dt-body .dt-row:not([data-placeholder])'),
      (row) => row.getBoundingClientRect(),
    );
    return {
      offsets: tops.slice(0, 12).map((r) => r.top - tops[0]!.top),
      heights: tops.slice(0, 12).map((r) => r.height),
      table: host.querySelector('.dt-table-wrapper')!.getBoundingClientRect().height,
      host: host.getBoundingClientRect().height,
    };
  }, HOST_ID);
  rows.offsets.forEach((offset, k) => expect(offset, `row ${k}`).toBeCloseTo(k * 32, 0));
  rows.heights.forEach((height, k) => expect(height, `row ${k}`).toBeCloseTo(32, 0));
  expect(rows.table).toBeCloseTo(rows.host, 0);

  // Walking the cursor down past the viewport has to keep its row in view:
  // the scroller aims at row * rowHeight, which is where the row now is.
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
  await settle(page);
  const cursor = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const scroller = host.querySelector<HTMLElement>('.dt-body-scroll')!;
    const box = host.querySelector('.dt-cell--focused')!.getBoundingClientRect();
    const top = scroller.getBoundingClientRect().top;
    return { top: box.top - top, bottom: box.bottom - top, height: scroller.clientHeight };
  }, HOST_ID);
  expect(cursor.top).toBeGreaterThanOrEqual(-0.5);
  expect(cursor.bottom).toBeLessThanOrEqual(cursor.height + 0.5);
});

test('End scrolls the last column fully into view', async ({ page }) => {
  await mountWithoutReset(page, 1200);
  await page.locator(`#${HOST_ID} .dt-grid`).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await settle(page);

  const view = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const scroller = host.querySelector('.dt-body-scroll')!.getBoundingClientRect();
    const cell = host.querySelector('.dt-cell--focused')!;
    const box = cell.getBoundingClientRect();
    return {
      column: cell.getAttribute('data-column'),
      left: box.left - scroller.left,
      right: box.right - scroller.left,
      // clientWidth, not the rect: the vertical scrollbar is not viewport.
      width: host.querySelector('.dt-body-scroll')!.clientWidth,
    };
  }, HOST_ID);
  expect(view.column).toBe(`c${COLUMNS - 1}`);
  expect(view.left).toBeGreaterThanOrEqual(0);
  expect(view.right).toBeLessThanOrEqual(view.width + 0.5);
});

test('a resize drag grows the column from its declared width', async ({ page }) => {
  await mountWithoutReset(page, 1200);
  const handle = page.locator(
    `#${HOST_ID} .dt-col-header[data-column="c02"] .dt-col-resize-handle`,
  );
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 1, y);
  await page.mouse.up();

  const widths = await page.evaluate((hostId) => {
    const table = (window as unknown as TestWindow).__dt;
    const header = document.querySelector(`#${hostId} .dt-col-header[data-column="c02"]`)!;
    return {
      declared: table.state.columnWidths.get().get('c02'),
      occupied: header.getBoundingClientRect().width,
    };
  }, HOST_ID);
  expect(widths.declared).toBe(DECLARED_WIDTH + 1);
  expect(widths.occupied).toBeCloseTo(DECLARED_WIDTH + 1, 0);
});

test('a filter that matches no rows keeps the scroll extent as wide as the header', async ({
  page,
}) => {
  await mountWithoutReset(page, 1200);
  await page.evaluate(() => {
    const table = (window as unknown as TestWindow).__dt;
    table.actions.addFilter({ type: 'range', column: 'c00', min: 1000, max: 2000 });
  });
  await page.waitForFunction(
    () => (window as unknown as TestWindow).__dt.state.filteredRows.get() === 0,
  );
  await settle(page);

  // With no rows the body's scroll extent comes from the width spacer alone,
  // which is the sum of declared widths. It has to reach as far as the
  // header row, or the last headers cannot be scrolled to.
  const extent = await page.evaluate(
    ({ hostId, last }) => {
      const host = document.getElementById(hostId)!;
      const row = host.querySelector('.dt-header-row')!.getBoundingClientRect();
      const lastHeader = host.querySelector(`.dt-col-header[data-column="${last}"]`)!;
      return {
        rows: host.querySelectorAll('.dt-body .dt-row').length,
        body: host.querySelector('.dt-body-scroll')!.scrollWidth,
        // Where the headers end, not the row box: the row is given the summed
        // width inline, and headers wider than the sum overflow it.
        header: lastHeader.getBoundingClientRect().right - row.left,
      };
    },
    { hostId: HOST_ID, last: `c${COLUMNS - 1}` },
  );
  expect(extent.rows).toBe(0);
  expect(extent.body).toBeCloseTo(COLUMNS * DECLARED_WIDTH, 0);
  expect(extent.header).toBeCloseTo(extent.body, 0);
});
