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

const COLUMNS = 40;
const HOST_ID = 'geometry-host';
const DECLARED_WIDTH = 150;

type GeometryWindow = { __geo: import('../../src/index').DataTable };

/**
 * Mount a 40-column table in a fixed-position host `width` px wide, on a page
 * whose reset has been overridden back to content-box.
 */
async function mountWithoutReset(page: Page, width: number): Promise<void> {
  await page.goto('./');
  // Same specificity as the demo's `*` reset and later in the cascade, so it
  // wins everywhere the library does not declare box-sizing itself.
  await page.addStyleTag({ content: '*, *::before, *::after { box-sizing: content-box; }' });
  await page.evaluate(
    async ({ columns, width, hostId }) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText =
        `position: fixed; left: 0; top: 0; width: ${width}px; height: 480px;` +
        ' z-index: 10000; background: white;';
      document.body.appendChild(host);

      const names = Array.from({ length: columns }, (_, i) => `c${String(i).padStart(2, '0')}`);
      const lines = [names.join(',')];
      for (let r = 0; r < 60; r++) lines.push(names.map((_, i) => (r * 7 + i) % 97).join(','));

      const table = await mod.createDataTable({
        container: host,
        tableName: 'geometry',
        persistence: false,
        visualizations: false,
      });
      (window as unknown as GeometryWindow).__geo = table;
      await table.loadData(new File([lines.join('\n')], 'geometry.csv', { type: 'text/csv' }));
    },
    { columns: COLUMNS, width, hostId: HOST_ID },
  );
  await page.waitForFunction(
    (hostId) =>
      document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`).length > 0,
    HOST_ID,
    { timeout: 90_000 },
  );
  await settle(page);
}

interface ColumnBox {
  column: string;
  headerLeft: number;
  headerWidth: number;
  cellLeft: number;
  cellWidth: number;
}

/** Header and first-row cell boxes for every column, in presented order. */
function columnBoxes(page: Page): Promise<ColumnBox[]> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const row = host.querySelector('.dt-body .dt-row:not([data-placeholder])')!;
    return Array.from(host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]')).map(
      (header) => {
        const column = header.dataset.column!;
        const cell = Array.from(row.children).find(
          (c) => c.getAttribute('data-column') === column,
        )!;
        const h = header.getBoundingClientRect();
        const c = cell.getBoundingClientRect();
        return {
          column,
          headerLeft: h.left,
          headerWidth: h.width,
          cellLeft: c.left,
          cellWidth: c.width,
        };
      },
    );
  }, HOST_ID);
}

function expectAligned(boxes: ColumnBox[]): void {
  expect(boxes).toHaveLength(COLUMNS);
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

  // Below 550px the header's padding shrinks and the cells' does not. Under
  // content-box that moved every header 8px further left of its cells.
  await page.evaluate((hostId) => {
    document.getElementById(hostId)!.style.width = '500px';
  }, HOST_ID);
  await settle(page);
  expect(
    await page.evaluate(
      (hostId) =>
        getComputedStyle(document.querySelector(`#${hostId} .dt-col-header`)!).paddingLeft,
      HOST_ID,
    ),
  ).toBe('8px');
  expectAligned(await columnBoxes(page));
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
    const table = (window as unknown as GeometryWindow).__geo;
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
    const table = (window as unknown as GeometryWindow).__geo;
    table.actions.addFilter({ type: 'range', column: 'c00', min: 1000, max: 2000 });
  });
  await page.waitForFunction(
    () => (window as unknown as GeometryWindow).__geo.state.filteredRows.get() === 0,
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
