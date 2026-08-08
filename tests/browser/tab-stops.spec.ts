/**
 * The tab-stop census: which elements inside `.dt-root` are reachable by
 * `Tab`, enumerated against real layout.
 *
 * jsdom cannot answer this. Tabbability depends on computed style and
 * `getClientRects()` — the responsive container queries that hide half the
 * per-column controls at narrow widths, and the `overflow: hidden` clipping
 * on the hidden-columns gutter, are both invisible without real layout.
 */

import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import {
  NARROW_COLUMNS,
  WIDE_COLUMNS,
  loadCsv,
  openDemo,
  settle,
  waitForColumnPlots,
} from './helpers/demo';

const ROOT = '.dt-root';

async function censusAt(browser: Browser, columns: number): Promise<string[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDemo(page);
    await loadCsv(page, columns);
    return await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);
  } finally {
    await context.close();
  }
}

test('the set of tab stops inside the table is identical at 4 and 266 columns', async ({
  browser,
}) => {
  test.setTimeout(360_000);

  const narrow = await censusAt(browser, NARROW_COLUMNS);
  const wide = await censusAt(browser, WIDE_COLUMNS);

  expect(
    wide,
    `tab stops grew with the column count.\n` +
      `  ${NARROW_COLUMNS} cols (${narrow.length}): ${narrow.join(', ')}\n` +
      `  ${WIDE_COLUMNS} cols (${wide.length}): ${wide.join(', ')}`,
  ).toEqual(narrow);
});

test('hiding columns does not add tab stops', async ({ page }) => {
  // The hidden-columns gutter used to emit one plain `<button>` per hidden
  // column, so hiding 250 of 266 columns added 251 tab stops — and the
  // gutter clips at 200px, making most of them focusable but unreachable.
  await openDemo(page);
  await loadCsv(page, 8);

  const before = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);
  // The internal `__rowid__` column ships hidden, so the gutter is never
  // empty to begin with — count from wherever it starts.
  const chips = page.locator('.dt-hidden-chip');
  const startingChips = await chips.count();

  // Hide six of eight. The hide button is disabled on the last visible
  // column, so this can never empty the grid. Waiting for the chip count to
  // tick up between clicks keeps a re-render from swallowing one.
  for (let i = 1; i <= 6; i++) {
    await page.locator('button[aria-label^="Hide "]:not([disabled])').first().click();
    await expect(chips).toHaveCount(startingChips + i);
    await settle(page);
  }

  const after = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

  expect(
    after.length,
    `hiding six columns changed the tab-stop count.\n` +
      `  before (${before.length}): ${before.join(', ')}\n` +
      `  after  (${after.length}): ${after.join(', ')}`,
  ).toBe(before.length);
});

test('adding filters does not add tab stops', async ({ page }) => {
  // Same shape as the gutter: the filter bar is a toolbar, so its chips must
  // share one roving tab stop rather than each contributing a remove button.
  await openDemo(page);
  await loadCsv(page, 6);
  // `if (await canvas.count() === 0) continue` below does not auto-wait, and
  // clicking a chart whose data has not landed creates no filter — so the
  // `created >= 2` assertion would fail for a reason unrelated to tab stops.
  await waitForColumnPlots(page);

  const before = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

  // Column-header plots are canvases hit-tested by coordinate, so a filter
  // comes from a real click near the first bar rather than from a DOM event.
  const chips = page.locator('.dt-filter-chip');
  const columns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.dt-col-header')).map((h) =>
      h.getAttribute('data-column'),
    ),
  );

  let created = 0;
  for (const column of columns) {
    if (created >= 3) break;
    const canvas = page
      .locator(`.dt-col-header[data-column="${column}"] .dt-col-viz canvas`)
      .first();
    if ((await canvas.count()) === 0) continue;
    const box = await canvas.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.15);
    await settle(page);
    const now = await chips.count();
    if (now > created) created = now;
  }

  // A vacuous pass here would be worse than a failure — the whole point is
  // that filters exist while the tab-stop count holds.
  expect(created, 'clicking column-header plots created no filter chips').toBeGreaterThanOrEqual(2);

  const after = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

  expect(
    after.length,
    `${created} filter chip(s) changed the tab-stop count.\n` +
      `  before (${before.length}): ${before.join(', ')}\n` +
      `  after  (${after.length}): ${after.join(', ')}`,
  ).toBe(before.length);
});
