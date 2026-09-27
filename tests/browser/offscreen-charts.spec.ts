/**
 * Header charts on columns that come into view without being scrolled to.
 *
 * Charts are created only for headers in or near view. That smooth wheel
 * scrolling creates them is `lazy-charts.spec.ts`; a container that grows
 * brings columns into view with no scroll at all, and they need charts too.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable, wheelBy } from './helpers/table';

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
