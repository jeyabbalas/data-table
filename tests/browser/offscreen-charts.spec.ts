/**
 * Header charts on columns that come into view without being scrolled to.
 *
 * Charts are created only for headers in or near view. That smooth wheel
 * scrolling creates them is `lazy-charts.spec.ts`; a container that grows
 * brings columns into view with no scroll at all, and they need headers,
 * cells and charts too.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable, probe, wheelBy } from './helpers/table';

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
