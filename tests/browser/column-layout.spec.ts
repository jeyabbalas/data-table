/**
 * Column layout mode (`Shift+F2`) driven from a real keyboard, on the
 * 266-column table from issue #84.
 *
 * jsdom cannot see any of this. It dispatches no real key events, performs no
 * sequential focus navigation, and resolves every element to zero size — which
 * is exactly how issue #84's live keyboard trap passed the entire vitest
 * suite. The unit tests prove the state machine; this proves the gesture is
 * actually reachable, that it does not grow the tab-stop census, and that one
 * `Ctrl+Z` undoes the whole thing.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { WIDE_COLUMNS, loadCsv, openDemo, settle } from './helpers/demo';

const ROOT = '.dt-root';
const LAYOUT_CLASS = 'dt-col-header--layout';

/** Column names in presented order, read off the DOM. */
function columnOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.dt-col-header')).map(
      (h) => h.getAttribute('data-column') ?? '',
    ),
  );
}

/** Rendered width of a column header, in pixels. */
function widthOf(page: Page, column: string): Promise<number> {
  return page.evaluate(
    (c) =>
      document.querySelector(`.dt-col-header[data-column="${c}"]`)?.getBoundingClientRect().width ??
      -1,
    column,
  );
}

/** Text currently sitting in the transient announcement region. */
function announcement(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.dt-announce')?.textContent?.trim() ?? '');
}

/**
 * Put the cursor on the first column header and open a layout gesture.
 *
 * The route is deliberately all-keyboard: focus the grid, `ArrowUp` to step
 * onto the header row, `Shift+F2`. If any link in that chain is broken the
 * feature is unreachable however well the state machine behaves.
 */
async function enterLayoutMode(page: Page): Promise<string> {
  await page.locator('.dt-grid').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.dt-col-header--focused')).toHaveCount(1);
  await page.keyboard.press('Shift+F2');
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(1);
  return page.evaluate(
    (cls) => document.querySelector(`.${cls}`)?.getAttribute('data-column') ?? '',
    LAYOUT_CLASS,
  );
}

test('Shift+F2 resizes and reorders a column, and Escape puts both back', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  const orderBefore = await columnOrder(page);
  const column = await enterLayoutMode(page);
  expect(column).toBe(orderBefore[0]);

  const widthBefore = await widthOf(page, column);
  expect(await announcement(page)).toContain('column layout mode');

  // Resize: three steps right, one left, net +2 steps of 16px.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => widthOf(page, column)).toBe(widthBefore + 32);
  expect(await announcement(page)).toContain('pixels wide');

  // Reorder: two positions right.
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await settle(page);

  const orderDuring = await columnOrder(page);
  expect(orderDuring.indexOf(column)).toBe(2);
  expect(await announcement(page)).toContain('moved to column 3');

  // Escape restores the entry width AND the entry position.
  await page.keyboard.press('Escape');
  await settle(page);

  expect(await columnOrder(page)).toEqual(orderBefore);
  await expect.poll(() => widthOf(page, column)).toBe(widthBefore);
  expect(await announcement(page)).toContain('cancelled');
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(0);
});

test('one Ctrl+Z undoes a whole committed gesture', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  const orderBefore = await columnOrder(page);
  const column = await enterLayoutMode(page);
  const widthBefore = await widthOf(page, column);

  // Four resize steps and a move — five state mutations the user reads as one
  // action, so they have to collapse into one undo entry.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  await settle(page);

  expect(await columnOrder(page)).not.toEqual(orderBefore);
  await expect.poll(() => widthOf(page, column)).toBe(widthBefore + 64);

  await page.keyboard.press('Control+z');
  await settle(page);

  expect(await columnOrder(page)).toEqual(orderBefore);
  await expect.poll(() => widthOf(page, column)).toBe(widthBefore);
});

test('column layout mode adds no tab stops at 266 columns', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  const before = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

  await enterLayoutMode(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await settle(page);

  const during = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

  expect(
    during,
    `column layout mode changed the tab-stop census.\n` +
      `  before (${before.length}): ${before.join(', ')}\n` +
      `  during (${during.length}): ${during.join(', ')}`,
  ).toEqual(before);

  // Real focus never left the grid — that is what keeps the census flat.
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain('dt-grid');
});

test('a pinned column refuses to move, and the gesture stays open', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await loadCsv(page, 8);

  // Pin the first column via its own button, then drive the keyboard at it.
  await page.locator('button[aria-label^="Pin "]').first().click();
  await settle(page);

  const orderBefore = await columnOrder(page);
  const column = await enterLayoutMode(page);
  expect(
    await page.evaluate((c) => {
      const el = document.querySelector(`.dt-col-header[data-column="${c}"]`);
      return el?.classList.contains('dt-col-header--pinned') ?? false;
    }, column),
  ).toBe(true);

  await page.keyboard.press('Shift+ArrowRight');
  await settle(page);

  expect(await columnOrder(page)).toEqual(orderBefore);
  expect(await announcement(page)).toContain('pinned');
  // Refusing a move must not drop the user out of the mode — resize still works.
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(1);
});

test('Tab off the grid commits the gesture instead of stranding it', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await loadCsv(page, 8);

  const column = await enterLayoutMode(page);
  const widthBefore = await widthOf(page, column);
  await page.keyboard.press('ArrowRight');

  // Tab is never intercepted, so it does what the browser says — and the next
  // stop is `.dt-header-scroll`, which lives *inside* `.dt-grid`. Walking away
  // from an open gesture has to close it either way, or the mode would still
  // be live with the cursor no longer driving it.
  await page.keyboard.press('Tab');
  await settle(page);

  expect(await page.evaluate(() => document.activeElement?.className ?? '')).not.toContain(
    'dt-grid',
  );
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(0);
  await expect.poll(() => widthOf(page, column)).toBe(widthBefore + 16);
});
