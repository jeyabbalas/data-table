/**
 * Where real DOM focus lives, and what happens to it when the grid rebuilds
 * the element holding it.
 *
 * Both cases here are invisible to jsdom for the same reason: they need a
 * real browser's focus semantics. jsdom does not move focus to `<body>` when
 * the focused element is removed, and it never performs a key's default
 * action, so `Space` on a focused `<button>` neither clicks it nor competes
 * with the grid's own `Space` handler.
 */

import { expect, test } from '@playwright/test';
import { NARROW_COLUMNS, loadCsv, openDemo, settle } from './helpers/demo';

test('clicking a cell then scrolling it away keeps the grid keyboard layer alive', async ({
  page,
}) => {
  // Clicking a cell parks focus on an inert `tabindex="-1"` div — by design,
  // the grid reclaims focus lazily on the next cursor key. But the virtual
  // scroller recycles that row on scroll, focus falls to `<body>`, and the
  // keydown listener lives on `.dt-root`, so every subsequent keystroke
  // misses it and the whole keyboard layer goes dead.
  await openDemo(page);
  await loadCsv(page, NARROW_COLUMNS, 500);

  await page.locator('.dt-body .dt-row .dt-cell').first().click();
  await settle(page);

  const activeAfterClick = await page.evaluate(() =>
    window.__dtA11y.describe(document.activeElement),
  );
  expect(activeAfterClick, 'click did not put focus inside the table').not.toBe('body');

  // Scroll far enough that the clicked row is certainly recycled.
  await page.evaluate(() => {
    document.querySelector('.dt-body-scroll')!.scrollTop = 12_000;
  });
  await settle(page);

  const afterScroll = await page.evaluate(() => ({
    active: window.__dtA11y.describe(document.activeElement),
    onBody: document.activeElement === document.body,
    inRoot: window.__dtA11y.activeInside('.dt-root'),
  }));

  expect(
    afterScroll.onBody,
    `recycling the focused row dropped focus to <body> (now: ${afterScroll.active}) — ` +
      `every later keystroke misses the listener on .dt-root`,
  ).toBe(false);
  expect(afterScroll.inRoot, `focus left the table entirely (now: ${afterScroll.active})`).toBe(
    true,
  );

  // The real consequence: arrows must still drive the cursor.
  const before = await page.getAttribute('.dt-grid', 'aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  await settle(page);
  const after = await page.getAttribute('.dt-grid', 'aria-activedescendant');

  expect(after, 'ArrowDown did nothing — the grid keyboard layer is dead').not.toBe(before);
});

test('Space activates a click-focused header button instead of sorting the cursor column', async ({
  page,
}) => {
  // The grid's `Space` handler used to run for any keystroke that reached
  // the root listener, including one aimed at a header button that already
  // held real DOM focus. The result: pressing Space on "Pin alpha" sorted
  // whichever column the invisible cursor happened to sit on, and pinned
  // nothing.
  await openDemo(page);
  await loadCsv(page, NARROW_COLUMNS);

  const columns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.dt-col-header')).map((h) =>
      h.getAttribute('data-column'),
    ),
  );
  expect(columns.length).toBeGreaterThanOrEqual(2);
  const [target, cursorColumn] = columns as [string, string];

  // Put the cursor on the *second* column's header cell. Asserted through
  // the rendered cursor class rather than the `aria-activedescendant` id,
  // which is index-based and deliberately carries a random instance suffix.
  await page.locator('.dt-grid').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  const cursorOn = await page.evaluate(() =>
    document.querySelector('.dt-col-header--focused')?.getAttribute('data-column'),
  );
  expect(cursorOn, 'cursor never reached the second column of the header row').toBe(cursorColumn);

  // Now give real DOM focus to the *first* column's pin button, the way a
  // click or a modal's focus-restore would.
  const pin = page.locator(`button[aria-label="Pin ${target}"]`);
  await pin.focus();

  await page.keyboard.press(' ');
  await settle(page);

  const result = await page.evaluate(() => ({
    pinned: Array.from(document.querySelectorAll('.dt-col-header--pinned')).map((e) =>
      e.getAttribute('data-column'),
    ),
    sorted: Array.from(document.querySelectorAll('.dt-col-header'))
      .filter((e) => e.querySelector('.dt-col-sort-btn--asc, .dt-col-sort-btn--desc'))
      .map((e) => e.getAttribute('data-column')),
  }));

  expect(result.pinned, `Space did not activate the focused "Pin ${target}" button`).toContain(
    target,
  );
  expect(
    result.sorted,
    `Space also sorted ${result.sorted.join(', ')} — the grid stole a keystroke aimed at a button`,
  ).toEqual([]);
});

test('Escape from a header button returns focus to the grid, not out of the table', async ({
  page,
}) => {
  // F2 and click-focus have to be the same state. If they are not, Escape
  // from a clicked button falls through to the browser and the user loses
  // their place entirely.
  await openDemo(page);
  await loadCsv(page, NARROW_COLUMNS);

  const target = await page.evaluate(() =>
    document.querySelector('.dt-col-header')!.getAttribute('data-column'),
  );

  await page.locator(`button[aria-label="Pin ${target}"]`).focus();
  await page.keyboard.press('Escape');
  await settle(page);

  const active = await page.evaluate(() => ({
    isGrid: document.activeElement === document.querySelector('.dt-grid'),
    desc: window.__dtA11y.describe(document.activeElement),
  }));
  expect(active.isGrid, `Escape left focus on ${active.desc} instead of the grid`).toBe(true);
});
