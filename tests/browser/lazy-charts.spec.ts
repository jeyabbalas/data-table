/**
 * Column-header charts are created only for headers in or near view, and
 * must appear as the user scrolls sideways — with a wheel or a trackpad,
 * not only after a jump.
 *
 * jsdom has no `IntersectionObserver`, so the unit suites create every
 * chart up front and cannot see this. An observer reports a header only
 * when it crosses one of the observer's edges, and scrolling by small steps
 * crosses them in an order a scripted `scrollLeft` jump never does: an
 * earlier implementation drew charts after jumps but left every header that
 * scrolled in smoothly without one.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadCsv, openDemo } from './helpers/demo';

const COLUMNS = 300;

/** More charts than this means creation no longer follows the viewport. */
const MAX_LIVE_CHARTS = 40;

/** One wheel notch, roughly: small enough to scroll the way a person does. */
const WHEEL_STEP_PX = 100;

/**
 * Headers at least partly inside the header viewport whose chart is
 * missing or has not drawn its data yet. A chart writes its stats line 2
 * in the same turn it first draws.
 */
async function headersWithoutCharts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scroller = document.querySelector('.dt-header-scroll')!;
    const view = scroller.getBoundingClientRect();
    const missing: string[] = [];
    for (const header of document.querySelectorAll('.dt-col-header[data-column]')) {
      const rect = header.getBoundingClientRect();
      if (rect.right <= view.left || rect.left >= view.right) continue;
      const drawn =
        !!header.querySelector('.dt-col-viz canvas') &&
        !!header.querySelector('.dt-col-stats .dt-stats-line2');
      if (!drawn) missing.push(header.getAttribute('data-column') ?? '?');
    }
    return missing;
  });
}

async function liveCharts(page: Page): Promise<number> {
  return page.locator('.dt-col-header .dt-col-viz canvas').count();
}

async function scrollLeftOf(page: Page): Promise<{ left: number; max: number }> {
  return page.evaluate(() => {
    const body = document.querySelector('.dt-body-scroll')!;
    return { left: body.scrollLeft, max: body.scrollWidth - body.clientWidth };
  });
}

/**
 * Wheel sideways over the body by `steps` notches, a frame or so apart.
 * Fails if the wheel did not move the table, which would otherwise make
 * every check after it pass without testing anything.
 */
async function wheel(page: Page, steps: number, stepPx: number): Promise<void> {
  // The demo puts the table below the fold, and a wheel event outside the
  // page viewport scrolls nothing.
  await page.evaluate(() => document.querySelector('.dt-root')!.scrollIntoView({ block: 'start' }));
  const box = (await page.locator('.dt-body-scroll').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 100));
  const before = (await scrollLeftOf(page)).left;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(stepPx, 0);
    await page.waitForTimeout(20);
  }
  await expect.poll(async () => (await scrollLeftOf(page)).left).not.toBe(before);
}

test('charts appear on every header scrolled into view with the wheel', async ({ page }) => {
  await openDemo(page);
  await loadCsv(page, COLUMNS);

  await expect.poll(() => headersWithoutCharts(page)).toEqual([]);
  expect(await liveCharts(page)).toBeLessThanOrEqual(MAX_LIVE_CHARTS);

  const { max } = await scrollLeftOf(page);
  expect(max, 'the table must be wider than its viewport').toBeGreaterThan(20 * WHEEL_STEP_PX);

  // Stop every few notches, the way a person pauses to read, until the far
  // edge. Every stop must end with a chart on every header in view.
  let stops = 0;
  for (;;) {
    await wheel(page, 6, WHEEL_STEP_PX);
    stops++;
    await expect
      .poll(() => headersWithoutCharts(page), {
        message: `headers without a chart after stop ${stops}`,
        timeout: 10_000,
      })
      .toEqual([]);
    expect(await liveCharts(page)).toBeLessThanOrEqual(MAX_LIVE_CHARTS);
    const { left } = await scrollLeftOf(page);
    if (left >= max - 1) break;
    expect(stops, 'the wheel stopped scrolling before the far edge').toBeLessThan(200);
  }
});

test('charts appear after a wheel sweep back to the start', async ({ page }) => {
  await openDemo(page);
  await loadCsv(page, COLUMNS);
  await expect.poll(() => headersWithoutCharts(page)).toEqual([]);

  // Sweep right without pausing, then come back the same way. The charts
  // passed on the way out are destroyed; the ones at the start must be
  // created again.
  await wheel(page, 40, WHEEL_STEP_PX);
  await wheel(page, 40, -WHEEL_STEP_PX);
  expect((await scrollLeftOf(page)).left).toBe(0);

  await expect.poll(() => headersWithoutCharts(page), { timeout: 10_000 }).toEqual([]);
  expect(await liveCharts(page)).toBeLessThanOrEqual(MAX_LIVE_CHARTS);
});
