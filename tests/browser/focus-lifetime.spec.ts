/**
 * Where real DOM focus lives, and what happens to it when the grid removes
 * the element holding it.
 *
 * Every case here is invisible to jsdom for the same reason: they need a real
 * browser's focus semantics. jsdom does not move focus to `<body>` when the
 * focused element is removed, and it never performs a key's default action,
 * so `Space` on a focused `<button>` neither clicks it nor competes with the
 * grid's own `Space` handler.
 *
 * The second half of the file is the column axis. Both grid rows are windowed
 * now, so a horizontal scroll removes header elements exactly the way a
 * vertical one recycles rows — and a header is a far worse thing to remove,
 * because it is where `F2` puts real DOM focus, where `Shift+F2` runs a
 * multi-keystroke gesture, and what `aria-activedescendant` names while the
 * cursor is on the header row.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NARROW_COLUMNS, WIDE_COLUMNS, loadCsv, openDemo, settle } from './helpers/demo';

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

// =========================================
// The column axis: focus across a windowed header row
// =========================================

const LAYOUT_CLASS = 'dt-col-header--layout';

/** Where real focus is, said in terms this file can assert on. */
function focusState(page: Page): Promise<{
  onGrid: boolean;
  onBody: boolean;
  connected: boolean;
  header: string | null;
  describe: string;
}> {
  return page.evaluate(() => {
    const active = document.activeElement;
    const header = active?.closest?.('.dt-col-header') ?? null;
    return {
      onGrid: active === document.querySelector('.dt-grid'),
      onBody: active === document.body,
      // A detached element can still be `document.activeElement` for a tick in
      // some engines; `isConnected` is what separates "focus survived" from
      // "focus is pointing at garbage".
      connected: active?.isConnected === true,
      header: header?.getAttribute('data-column') ?? null,
      describe: window.__dtA11y.describe(active),
    };
  });
}

/** Scroll the grid horizontally and wait for both rows to settle on it. */
async function scrollTo(page: Page, left: number): Promise<void> {
  await page.evaluate((x) => {
    document.querySelector('.dt-body-scroll')!.scrollLeft = x;
  }, left);
  await settle(page);
}

/** Is a column's header currently mounted? */
function headerMounted(page: Page, column: string): Promise<boolean> {
  return page.evaluate(
    (c) => document.querySelector(`.dt-col-header[data-column="${c}"]`) !== null,
    column,
  );
}

test('F2 focus is handed to the grid, never dropped, as its header scrolls away', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // The row axis has had this rescue since `TableBody.moveFocusToGridBeforeRemoval`;
  // windowing the header row created a second way to remove a focused element,
  // and this is the one that matters more. `F2` is the documented escape hatch
  // into a header's buttons, so a scroll that drops focus to `<body>` does not
  // merely lose a highlight — the root `keydown` listener stops seeing
  // keystrokes and the entire keyboard layer goes dead, silently.
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  await page.locator('.dt-grid').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.dt-col-header--focused')).toHaveCount(1);
  await page.keyboard.press('F2');
  await settle(page);

  const start = await focusState(page);
  expect(start.header, `F2 left focus on ${start.describe} rather than in a header`).not.toBeNull();
  const anchored = start.header!;

  // Sweep rather than pick one offset. Where the anchor stops holding is a
  // function of the viewport width and `MIN_OVERSCAN_COLUMNS`, and the
  // invariant is deliberately phrased so that it does not need to know: at
  // every offset focus is either still in the same header or on `.dt-grid`.
  // Never `<body>`, and never an element that has left the document.
  for (const left of [600, 2_400, 9_000, 24_000, 39_000]) {
    await scrollTo(page, left);
    const state = await focusState(page);
    expect(state.onBody, `at scrollLeft ${left}: focus fell to <body>`).toBe(false);
    expect(state.connected, `at scrollLeft ${left}: focus is on a detached element`).toBe(true);
    expect(
      state.onGrid || state.header === anchored,
      `at scrollLeft ${left}: focus is on ${state.describe}, neither ${anchored}'s header nor the grid`,
    ).toBe(true);
  }

  // The rescue is a rescue, not a leak: by the far end of a 266-column table
  // the anchored header is long gone from the DOM. Without this the assertions
  // above would also pass for an implementation that simply never unmounts.
  expect(
    await headerMounted(page, anchored),
    `${anchored} is still mounted 39,000 px away — the anchor never released`,
  ).toBe(false);

  // And the keyboard layer is still live, which is the whole point of parking
  // focus on the grid rather than letting it fall.
  const before = await page.evaluate(
    () => document.querySelector('.dt-grid')?.getAttribute('aria-activedescendant') ?? '',
  );
  await page.keyboard.press('ArrowDown');
  await settle(page);
  const after = await page.evaluate(
    () => document.querySelector('.dt-grid')?.getAttribute('aria-activedescendant') ?? '',
  );
  expect(after, 'ArrowDown did nothing — the keyboard layer died with the header').not.toBe(before);
});

test('the header cursor never names an element that is not in the document', async ({ page }) => {
  test.setTimeout(240_000);
  // `aria-activedescendant` is a promise to assistive technology that the id
  // it names resolves. A cursor walk is where a windowed row breaks it: each
  // `ArrowRight` scrolls the cursor into view, which recomputes the window and
  // re-mounts the row, and the attribute has to be written *after* the header
  // it names exists — `refreshColumnWindow` does the header axis before the
  // body's pass calls back into `syncActiveDescendant` for exactly this.
  //
  // What this does *not* cover is the anchor extension: a cursor driven by
  // arrow keys is always scrolled into view, so it never falls outside the
  // plain window. `header-anchors.spec.ts` scrolls programmatically, which is
  // the only way to separate the two.
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  await page.locator('.dt-grid').focus();
  await page.keyboard.press('ArrowUp');
  await settle(page);

  const broken: Array<{ step: number; id: string; focused: string | null }> = [];
  // Well past the ~17-column window, so the run covers both the frames where
  // the cursor is inside it and the frames where it has just left.
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press('ArrowRight');
    const state = await page.evaluate(() => {
      const grid = document.querySelector('.dt-grid')!;
      const id = grid.getAttribute('aria-activedescendant') ?? '';
      const target = id ? document.getElementById(id) : null;
      const focused = document.querySelector('.dt-col-header--focused');
      return {
        id,
        resolves: target !== null,
        // The id must name the header the cursor class is on, not merely
        // *some* element — a stale id that happens to resolve is worse than
        // one that does not.
        agrees:
          target !== null && focused !== null && (target === focused || focused.contains(target)),
        focused: focused?.getAttribute('data-column') ?? null,
      };
    });
    if (!state.resolves || !state.agrees)
      broken.push({ step, id: state.id, focused: state.focused });
  }

  expect(
    broken.slice(0, 5),
    `aria-activedescendant broke: ${JSON.stringify(broken.slice(0, 5))}`,
  ).toEqual([]);

  // The walk actually left the initial window — otherwise nothing above was
  // exercised.
  const cursorColumn = await page.evaluate(
    () => document.querySelector('.dt-col-header--focused')?.getAttribute('data-column') ?? '',
  );
  expect(cursorColumn, 'the cursor never moved').not.toBe('');
  expect(await headerMounted(page, cursorColumn)).toBe(true);
});

test('an open layout gesture survives the re-renders it causes', async ({ page }) => {
  test.setTimeout(240_000);
  // Twelve resize steps are twelve width writes, and a width write is what
  // moves the column window: the header running the gesture has to be the same
  // *element* after each one, or the gesture's state machine is pointing at a
  // node that has left the document. That is a property of the keyed reconcile
  // rather than of the anchor set — the header stays in view throughout, since
  // resizing does not scroll. The tail of the test covers the release.
  await openDemo(page);
  await loadCsv(page, WIDE_COLUMNS);

  await page.locator('.dt-grid').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.dt-col-header--focused')).toHaveCount(1);
  await page.keyboard.press('Shift+F2');
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(1);

  const column = await page.evaluate(
    (cls) => document.querySelector(`.${cls}`)?.getAttribute('data-column') ?? '',
    LAYOUT_CLASS,
  );
  expect(column).not.toBe('');

  // Drive the gesture the way a user would — repeated arrow keys, each of
  // which resizes and re-renders — and check after every one that the header
  // running the gesture is still the same element in the same mode.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowRight');
    const live = await page.evaluate((cls) => {
      const el = document.querySelector(`.${cls}`);
      return {
        count: document.querySelectorAll(`.${cls}`).length,
        column: el?.getAttribute('data-column') ?? null,
      };
    }, LAYOUT_CLASS);
    expect(live.count, `after ${i + 1} resize steps: layout headers in the DOM`).toBe(1);
    expect(live.column, `after ${i + 1} resize steps: the gesture changed column`).toBe(column);
  }

  await page.keyboard.press('Escape');
  await settle(page);
  await expect(page.locator(`.${LAYOUT_CLASS}`)).toHaveCount(0);

  // Closing the gesture releases the anchor: the header is now ordinary, and
  // scrolling away unmounts it like any other.
  await scrollTo(page, 39_000);
  expect(
    await headerMounted(page, column),
    `${column} stayed mounted after its gesture closed — the anchor leaked`,
  ).toBe(false);
  const state = await focusState(page);
  expect(state.onBody, `Escape plus a scroll left focus on ${state.describe}`).toBe(false);
});
