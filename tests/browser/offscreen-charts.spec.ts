/**
 * Header charts on a column scrolled away and back, and on columns that come
 * into view without being scrolled to.
 *
 * Charts are created only near the view: a chart scrolled far away is
 * destroyed, and a new one is built when its column returns. Its brush or bar
 * selection is kept nowhere but in the column's filter, so the new chart has
 * to draw it from there. That smooth wheel scrolling creates charts at all is
 * `lazy-charts.spec.ts`; a container that grows brings columns into view with
 * no scroll at all, and they need charts too.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, type TestWindow, mountTable, wheelBy, wheelIntoView } from './helpers/table';

function header(page: Page, column: string) {
  return page.locator(`#${HOST_ID} .dt-col-header[data-column="${column}"]`);
}

/** The column's filter, as state holds it. */
function filterOn(page: Page, column: string) {
  return page.evaluate(
    (column) =>
      (window as unknown as TestWindow).__dt.state.filters.get().find((f) => f.column === column) ??
      null,
    column,
  );
}

/** Headers at least partly in view whose chart is missing or not drawn yet. */
function headersWithoutCharts(page: Page): Promise<string[]> {
  return page.evaluate((hostId) => {
    const scroller = document.querySelector(`#${hostId} .dt-header-scroll`)!;
    const view = scroller.getBoundingClientRect();
    const missing: string[] = [];
    for (const h of document.querySelectorAll(`#${hostId} .dt-col-header[data-column]`)) {
      const r = h.getBoundingClientRect();
      if (r.right <= view.left || r.left >= view.right) continue;
      // A chart writes its stats in the same turn it first draws: its type
      // summary, or the detail of its brush or selection.
      const drawn =
        !!h.querySelector('.dt-col-viz canvas') &&
        !!h.querySelector('.dt-col-stats .dt-stats-line2, .dt-col-stats br');
      if (!drawn) missing.push(h.getAttribute('data-column') ?? '?');
    }
    return missing;
  }, HOST_ID);
}

/**
 * Mark the column's canvas, scroll the column far away and back, and wait
 * for a new chart: a canvas without the mark.
 */
async function scrollAwayAndBack(page: Page, column: string): Promise<void> {
  await header(page, column)
    .locator('.dt-col-viz canvas')
    .evaluate((c) => (c.dataset.probe = 'before'));
  // Within a second of the filter change, as a user would. The table used to
  // hold its scroll position for that second and undid the wheel.
  await wheelBy(page, 8_000);
  await expect(header(page, column).locator('.dt-col-viz canvas')).toHaveCount(0);
  await wheelIntoView(page, column);
  await expect(header(page, column).locator('.dt-col-viz canvas')).toHaveCount(1);
  await expect(header(page, column).locator('.dt-col-viz canvas[data-probe]')).toHaveCount(0);
}

test('a histogram brush survives its column scrolling away and back', async ({ page }) => {
  await mountTable(page, { visualizations: true });
  await wheelIntoView(page, 'c150');
  await expect.poll(() => headersWithoutCharts(page)).toEqual([]);

  const canvas = (await header(page, 'c150').locator('.dt-col-viz canvas').boundingBox())!;
  const y = canvas.y + canvas.height / 2;
  await page.mouse.move(canvas.x + canvas.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.6, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => filterOn(page, 'c150')).not.toBeNull();
  const filter = await filterOn(page, 'c150');
  expect(filter!.type).toBe('range');
  const stats = header(page, 'c150').locator('.dt-col-stats');
  await settle(page);
  const detail = await stats.textContent();

  await scrollAwayAndBack(page, 'c150');
  await expect(stats).toHaveText(detail!);
  expect(await filterOn(page, 'c150')).toEqual(filter);
});

test('a value-counts selection survives its column scrolling away and back', async ({ page }) => {
  await mountTable(page, { visualizations: true });
  // Column 151 holds text, so its chart is value counts: one stacked bar.
  await wheelIntoView(page, 'c151');
  await expect.poll(() => headersWithoutCharts(page)).toEqual([]);

  const canvas = (await header(page, 'c151').locator('.dt-col-viz canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * 0.05, canvas.y + canvas.height / 2);
  await expect.poll(() => filterOn(page, 'c151')).not.toBeNull();
  const filter = await filterOn(page, 'c151');
  const stats = header(page, 'c151').locator('.dt-col-stats');
  await settle(page);
  const detail = await stats.textContent();

  await scrollAwayAndBack(page, 'c151');
  await expect(stats).toHaveText(detail!);
  expect(await filterOn(page, 'c151')).toEqual(filter);
});

test('charts appear on the columns a growing container brings into view', async ({ page }) => {
  await mountTable(page, { visualizations: true, width: 700 });
  await wheelBy(page, 6_000);
  await expect.poll(() => headersWithoutCharts(page)).toEqual([]);

  await page.evaluate((hostId) => {
    document.getElementById(hostId)!.style.width = '1600px';
  }, HOST_ID);
  await settle(page);
  await expect.poll(() => headersWithoutCharts(page), { timeout: 10_000 }).toEqual([]);

  // The body grew with it: every header in view sits over its cells.
  const misaligned = await page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    const view = host.querySelector('.dt-header-scroll')!.getBoundingClientRect();
    const row = host.querySelector('.dt-body .dt-row:not([data-placeholder])')!;
    const out: string[] = [];
    for (const h of host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]')) {
      const r = h.getBoundingClientRect();
      if (r.right <= view.left || r.left >= view.right) continue;
      const cell = row.querySelector(`.dt-cell[data-column="${h.dataset.column}"]`);
      if (!cell || Math.abs(cell.getBoundingClientRect().left - r.left) > 0.5) {
        out.push(h.dataset.column!);
      }
    }
    return out;
  }, HOST_ID);
  expect(misaligned).toEqual([]);
});
