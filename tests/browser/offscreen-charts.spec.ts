/**
 * Header charts on a column scrolled away and back, and on columns that come
 * into view without being scrolled to.
 *
 * Charts are created only near the view: a chart scrolled far away is
 * destroyed, and a new one is built when its column returns. Its brush or bar
 * selection is kept nowhere but in the column's filter, so the new chart has
 * to draw it from there. That smooth wheel scrolling creates charts at all is
 * `lazy-charts.spec.ts`; a container that grows brings columns into view with
 * no scroll at all, and they need headers, cells and charts too.
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

/**
 * Columns in view, from the table's state, whose header is missing or has
 * no drawn chart. A chart writes its stats in the same turn it first draws:
 * its type summary, or the detail of its brush or selection.
 */
async function columnsWithoutCharts(page: Page): Promise<string[]> {
  const inView = await probe(page, 'inView');
  return page.evaluate(
    ({ hostId, inView }) =>
      inView.filter((name) => {
        const h = document.querySelector(`#${hostId} .dt-col-header[data-column="${name}"]`);
        return !(
          h?.querySelector('.dt-col-viz canvas') &&
          h.querySelector('.dt-col-stats .dt-stats-line2, .dt-col-stats br')
        );
      }),
    { hostId: HOST_ID, inView },
  );
}

/**
 * Gaps in the first data row across the body's viewport: its cells, sorted
 * by position, have to run from the left edge to the right one.
 */
function rowGaps(page: Page): Promise<string[]> {
  return page.evaluate((hostId) => {
    const body = document.querySelector<HTMLElement>(`#${hostId} .dt-body-scroll`)!;
    const view = body.getBoundingClientRect();
    const right = view.left + body.clientWidth;
    const row = Array.from(
      document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`),
    ).find((r) => r.querySelector('.dt-cell[data-column]'))!;
    const boxes = Array.from(row.querySelectorAll('.dt-cell[data-column]'), (c) =>
      c.getBoundingClientRect(),
    )
      .filter((r) => r.right > view.left && r.left < right)
      .sort((a, b) => a.left - b.left);
    const gaps: string[] = [];
    let reached = view.left;
    for (const b of boxes) {
      if (b.left > reached + 0.5) gaps.push(`${Math.round(reached)}–${Math.round(b.left)}`);
      reached = Math.max(reached, b.right);
    }
    if (reached < right - 0.5) gaps.push(`${Math.round(reached)}–${Math.round(right)}`);
    return gaps;
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
  await expect.poll(() => columnsWithoutCharts(page)).toEqual([]);

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
  await expect.poll(() => columnsWithoutCharts(page)).toEqual([]);

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

test('a growing container shows the columns it brings into view, with their charts', async ({
  page,
}) => {
  await mountTable(page, { visualizations: true, width: 700 });
  await wheelBy(page, 6_000);
  await expect.poll(() => columnsWithoutCharts(page)).toEqual([]);
  const before = (await probe(page, 'inView')).length;

  // Wider, but still inside Playwright's 1280px page.
  await page.evaluate((hostId) => {
    document.getElementById(hostId)!.style.width = '1200px';
  }, HOST_ID);
  await settle(page);
  expect((await probe(page, 'inView')).length).toBeGreaterThan(before);
  await expect.poll(() => columnsWithoutCharts(page), { timeout: 10_000 }).toEqual([]);
  expect(await rowGaps(page)).toEqual([]);

  // And each header in view sits over its cells.
  const misaligned = await page.evaluate(
    ({ hostId, inView }) => {
      const host = document.getElementById(hostId)!;
      const row = host.querySelector('.dt-body .dt-row:not([data-placeholder])')!;
      return inView.filter((name) => {
        const h = host.querySelector(`.dt-col-header[data-column="${name}"]`);
        const c = row.querySelector(`.dt-cell[data-column="${name}"]`);
        return (
          !h ||
          !c ||
          Math.abs(h.getBoundingClientRect().left - c.getBoundingClientRect().left) > 0.5
        );
      });
    },
    { hostId: HOST_ID, inView: await probe(page, 'inView') },
  );
  expect(misaligned).toEqual([]);
});

test('a chart draws nothing until its data lands, and never "No data"', async ({ page }) => {
  // Record every "No data" a canvas draws, from before the table exists. A
  // chart is laid out, and so rendered, before its first fetch lands: at load,
  // and as its column scrolls into view.
  await page.addInitScript(() => {
    const w = window as unknown as { __noData: string[] };
    w.__noData = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
      if (text === 'No data') {
        w.__noData.push(this.canvas.closest('[data-column]')?.getAttribute('data-column') ?? '?');
      }
      return fillText.call(this, text, ...rest);
    };
  });
  await mountTable(page, { visualizations: true });
  await expect.poll(() => columnsWithoutCharts(page)).toEqual([]);

  // Every column has values, so no chart has reason to draw "No data".
  await wheelBy(page, 6_000);
  await expect.poll(() => columnsWithoutCharts(page), { timeout: 10_000 }).toEqual([]);
  await wheelBy(page, 6_000, { stepPx: 150 });
  await expect.poll(() => columnsWithoutCharts(page), { timeout: 10_000 }).toEqual([]);

  expect(
    await page.evaluate(() => (window as unknown as { __noData: string[] }).__noData),
    'columns whose chart drew "No data"',
  ).toEqual([]);
});
