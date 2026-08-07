/**
 * Column-stats display under real gestures: canvas bar clicks, drag
 * brushes, segment clicks, hover, chip removal, Escape.
 *
 * The uniform-denominator contract:
 *  - While any filter is active, line 1 of EVERY column's stats reads
 *    `F / 200 rows` with the same F.
 *  - A filter-participant column shows a committed detail below line 1:
 *    its selection label plus `X rows (p%)` measured on the unfiltered
 *    data out of the dataset total. The detail does not change when other
 *    columns' filters change.
 *  - Hover swaps only the detail region (line 1 stays visible) and, with
 *    filters active, appends a `· N match` suffix.
 *
 * jsdom cannot exercise these: bar hit-testing, brush drags, and the
 * hover cadence all depend on real canvas layout.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadCsv, openDemo, settle } from './helpers/demo';

const ROWS = 200;

function statsLocator(page: Page, column: string) {
  return page.locator(`.dt-col-header[data-column="${column}"] .dt-col-stats`);
}

async function statsText(page: Page, column: string): Promise<string> {
  return (await statsLocator(page, column).innerText()).replace(/\s+/g, ' ').trim();
}

/** The detail region: everything after line 1 (first line of the slot). */
async function detailText(page: Page, column: string): Promise<string> {
  const raw = await statsLocator(page, column).innerText();
  return raw.split('\n').slice(1).join('\n').trim();
}

async function visibleDataColumns(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.dt-col-header'))
      .map((h) => h.getAttribute('data-column'))
      .filter((c): c is string => !!c),
  );
}

/** Click near the left edge of a column's plot to select its first bar/segment. */
async function clickPlot(page: Page, column: string): Promise<void> {
  const canvas = page.locator(`.dt-col-header[data-column="${column}"] .dt-col-viz canvas`).first();
  const box = await canvas.boundingBox();
  expect(box, `no plot canvas for ${column}`).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.12, box!.y + box!.height * 0.5);
  await settle(page);
}

test('bar click: committed detail on the participant, identical line 1 everywhere', async ({
  page,
}) => {
  await openDemo(page);
  await loadCsv(page, 6);

  await clickPlot(page, 'cat_col_1');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(1);

  const catStats = await statsText(page, 'cat_col_1');
  const match = catStats.match(/^(\d+) \/ 200 rows/);
  expect(match, `line 1 missing the F / N fraction: "${catStats}"`).toBeTruthy();
  const f = match![1]!;
  expect(catStats).toContain('Category:');
  expect(catStats).toMatch(/\d+ rows \(\d+\.\d%\)/);

  for (const column of await visibleDataColumns(page)) {
    const text = await statsText(page, column);
    expect(text, `line 1 of ${column} disagrees`).toMatch(new RegExp(`^${f} / 200 rows`));
  }
});

test('drag brush: committed Bin detail, byte-stable when a second filter lands', async ({
  page,
}) => {
  await openDemo(page);
  await loadCsv(page, 6);

  const canvas = page
    .locator('.dt-col-header[data-column="num_col_0"] .dt-col-viz canvas')
    .first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const y = box!.y + box!.height * 0.5;
  await page.mouse.move(box!.x + box!.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.4, y, { steps: 3 });
  await page.mouse.move(box!.x + box!.width * 0.6, y, { steps: 3 });
  await page.mouse.up();
  await settle(page);
  await expect(page.locator('.dt-filter-chip')).toHaveCount(1);
  // Park the pointer away from the plot so hover text does not overlay the
  // committed detail we are about to capture.
  await page.mouse.move(box!.x, box!.y + box!.height + 200);
  await settle(page);

  const numStats = await statsText(page, 'num_col_0');
  expect(numStats).toMatch(/^\d+ \/ 200 rows/);
  expect(numStats).toContain('Bin:');
  const numDetailBefore = await detailText(page, 'num_col_0');
  expect(numDetailBefore).toMatch(/\d+ rows \(\d+\.\d%\)/);

  // Second filter on another column: the brush detail must not move.
  await clickPlot(page, 'cat_col_1');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(2);
  await page.mouse.move(box!.x, box!.y + box!.height + 200);
  await settle(page);

  expect(await detailText(page, 'num_col_0')).toBe(numDetailBefore);
  const combined = await statsText(page, 'num_col_0');
  const f2 = combined.match(/^(\d+) \/ 200 rows/);
  expect(f2).toBeTruthy();
  for (const column of await visibleDataColumns(page)) {
    expect(await statsText(page, column)).toMatch(new RegExp(`^${f2![1]} / 200 rows`));
  }
});

test('hover: line 1 stays visible, detail carries a match suffix while filtered', async ({
  page,
}) => {
  await openDemo(page);
  await loadCsv(page, 6);

  await clickPlot(page, 'cat_col_1');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(1);

  const canvas = page
    .locator('.dt-col-header[data-column="num_col_3"] .dt-col-viz canvas')
    .first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  // Scrub across three positions: at every sample line 1 must be intact.
  for (const fraction of [0.2, 0.5, 0.8]) {
    await page.mouse.move(box!.x + box!.width * fraction, box!.y + box!.height * 0.5);
    await page.waitForTimeout(80);
    const text = await statsText(page, 'num_col_3');
    expect(text, `line 1 vanished during hover at ${fraction}`).toMatch(/^\d+ \/ 200 rows/);
  }

  // At least the last sample shows the hover detail with the match suffix.
  const hoverText = await statsText(page, 'num_col_3');
  expect(hoverText).toContain('Bin:');
  expect(hoverText).toMatch(/\d+ match/);

  // Mouse-out restores the default type stats (no Bin detail, line 1 kept).
  await page.mouse.move(box!.x, box!.y + box!.height + 200);
  await page.waitForTimeout(120);
  const restored = await statsText(page, 'num_col_3');
  expect(restored).toMatch(/^\d+ \/ 200 rows/);
  expect(restored).not.toContain('Bin:');
  expect(restored).not.toMatch(/\d+ match/);
});

test('chip removal and Clear all restore the affected columns', async ({ page }) => {
  await openDemo(page);
  await loadCsv(page, 6);

  await clickPlot(page, 'cat_col_1');
  await clickPlot(page, 'cat_col_4');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(2);
  expect(await statsText(page, 'cat_col_1')).toContain('Category:');
  expect(await statsText(page, 'cat_col_4')).toContain('Category:');
  const cat1Detail = await detailText(page, 'cat_col_1');

  // Remove cat_col_4's chip: its detail clears, cat_col_1's stays.
  await page
    .locator('.dt-filter-chip', { hasText: 'cat_col_4' })
    .locator('.dt-filter-chip-remove')
    .click();
  await settle(page);
  await expect(page.locator('.dt-filter-chip')).toHaveCount(1);
  expect(await statsText(page, 'cat_col_4')).not.toContain('Category:');
  expect(await detailText(page, 'cat_col_1')).toBe(cat1Detail);
  expect(await statsText(page, 'cat_col_1')).toMatch(/^\d+ \/ 200 rows/);

  // Clear all (the button only renders with 2+ filters — re-add one):
  // every column returns to the unfiltered baseline.
  await clickPlot(page, 'cat_col_4');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(2);
  await page.locator('.dt-filter-clear-all').click();
  await settle(page);
  await expect(page.locator('.dt-filter-chip')).toHaveCount(0);
  for (const column of await visibleDataColumns(page)) {
    const text = await statsText(page, column);
    expect(text).toMatch(/^200 rows/);
    expect(text).not.toContain('Category:');
    expect(text).not.toContain('Bin:');
  }
});

test('Escape clears the most recent interaction first (LIFO)', async ({ page }) => {
  await openDemo(page);
  await loadCsv(page, 6);

  await clickPlot(page, 'cat_col_1');
  await clickPlot(page, 'cat_col_4');
  await expect(page.locator('.dt-filter-chip')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await settle(page);
  await expect(page.locator('.dt-filter-chip')).toHaveCount(1);
  expect(await statsText(page, 'cat_col_4')).not.toContain('Category:');
  expect(await statsText(page, 'cat_col_1')).toContain('Category:');

  await page.keyboard.press('Escape');
  await settle(page);
  await expect(page.locator('.dt-filter-chip')).toHaveCount(0);
  expect(await statsText(page, 'cat_col_1')).not.toContain('Category:');
  expect(await statsText(page, 'cat_col_1')).toMatch(/^200 rows/);
});
