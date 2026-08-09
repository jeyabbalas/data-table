/**
 * The header window's **anchor extension**: the columns kept mounted because
 * something is pointing at them, not because they are near the viewport.
 *
 * `tests/browser/focus-lifetime.spec.ts` covers the safety net underneath this
 * — real DOM focus is parked on `.dt-grid` before a header holding it is
 * detached, at any distance. That net is what makes a *clamped* anchor set
 * safe: a cursor parked 900 columns away must not drag 900 headers into the
 * DOM, so `extendWindowToAnchors` gives up past `MIN_OVERSCAN_COLUMNS`.
 *
 * What is left needing proof is the band between those two behaviours, and it
 * is the only part with no natural witness: inside the clamp the header stays
 * mounted where the plain window would have dropped it, and outside it the
 * extension really does stop. Both halves are asserted here against the
 * **body's** window read back from `/advanced`, because the body applies no
 * header-cursor extension — so it is the plain window, measured rather than
 * assumed.
 *
 * jsdom cannot host any of this: it reports `clientWidth === 0`, so the pixel
 * term of the window collapses and every column inside `MIN_OVERSCAN_COLUMNS`
 * is mounted whatever the anchors say.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { TIER_HOST_ID, mountTierTable, waitForTierSettled, columnName } from './helpers/wideTable';

/** Mirrors `MIN_OVERSCAN_COLUMNS` in `src/table/ColumnWindow.ts`. */
const MIN_OVERSCAN_COLUMNS = 10;

const COLS = 300;
const ROWS = 2_000;
const SEED = 23;

interface AnchorProbe {
  /** `[start, end)` of the body's window — the plain one, no header anchors. */
  bodyStart: number;
  bodyEnd: number;
  /** Index of the anchored column in `visibleColumns`. */
  index: number;
  /** Is the anchored column's header in the DOM? */
  mounted: boolean;
  /** How far outside the body window it is; 0 while it is inside. */
  distance: number;
  /** What `.dt-grid` currently names, and whether that id resolves. */
  activeDescendant: string;
  descendantResolves: boolean;
}

/**
 * Scroll to `left`, settle, and read the anchored column's situation.
 *
 * The body window is read through `/advanced` rather than counted off the DOM
 * because the numbers wanted are `start` and `end` — the window the model
 * computed, which is exactly what the header's extension is being compared
 * against.
 */
async function probe(page: Page, left: number, column: string): Promise<AnchorProbe> {
  await page.evaluate(
    ({ hostId, x }) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
      el.scrollLeft = x;
    },
    { hostId: TIER_HOST_ID, x: left },
  );
  await waitForTierSettled(page, { host: `#${TIER_HOST_ID}` });

  return page.evaluate(
    ({ hostId, col }) => {
      const table = (window as unknown as { __t: { container: unknown } }).__t;
      const container = table.container as {
        getTableBody: () => { getColumnWindow: () => { start: number; end: number } } | null;
      };
      const win = container.getTableBody()!.getColumnWindow();
      const visible = (
        window as unknown as { __t: { state: { visibleColumns: { get: () => string[] } } } }
      ).__t.state.visibleColumns.get();
      const index = visible.indexOf(col);
      const grid = document.querySelector(`#${hostId} .dt-grid`)!;
      const id = grid.getAttribute('aria-activedescendant') ?? '';
      return {
        bodyStart: win.start,
        bodyEnd: win.end,
        index,
        mounted: document.querySelector(`#${hostId} .dt-col-header[data-column="${col}"]`) !== null,
        distance:
          index < win.start ? win.start - index : index >= win.end ? index + 1 - win.end : 0,
        activeDescendant: id,
        descendantResolves: id !== '' && document.getElementById(id) !== null,
      };
    },
    { hostId: TIER_HOST_ID, col: column },
  );
}

test.describe.configure({ timeout: 180_000 });

test('the cursor column stays mounted inside the clamp and is released outside it', async ({
  page,
}) => {
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);

  // Cursor onto the header row, on the first column. It stays there for the
  // whole sweep: every scroll below is programmatic, and a property write
  // moves no cursor.
  await page.locator(`#${TIER_HOST_ID} .dt-grid`).focus();
  await page.keyboard.press('ArrowUp');
  await waitForTierSettled(page);
  const anchored = columnName(0);
  await expect(
    page.locator(`#${TIER_HOST_ID} .dt-col-header--focused[data-column="${anchored}"]`),
  ).toHaveCount(1);

  // Walk right a column at a time. `col_0` is at index 0, so the body window's
  // `start` *is* the distance, and creeping past the clamp one column per step
  // is what puts a reading either side of it.
  const inside: AnchorProbe[] = [];
  const outside: AnchorProbe[] = [];
  const readings: AnchorProbe[] = [];
  for (let step = 0; step <= 40; step++) {
    const p = await probe(page, step * 150, anchored);
    readings.push(p);
    if (p.distance === 0) continue;
    (p.distance <= MIN_OVERSCAN_COLUMNS ? inside : outside).push(p);
  }

  console.log(
    `[header-anchors] ${JSON.stringify({
      inside: inside.map((p) => ({ d: p.distance, mounted: p.mounted })),
      outside: outside.slice(0, 4).map((p) => ({ d: p.distance, mounted: p.mounted })),
    })}`,
  );

  // The sweep has to have produced both regimes, or everything below is
  // vacuous — the exact way a test like this rots when a default width or a
  // viewport size changes.
  expect(inside.length, 'no offset left the cursor inside the anchor clamp').toBeGreaterThan(0);
  expect(outside.length, 'no offset pushed the cursor past the anchor clamp').toBeGreaterThan(0);

  // Inside the clamp: mounted although the plain window dropped it. This is
  // the anchor, and nothing else in the suite asserts it.
  const droppedInside = inside.filter((p) => !p.mounted);
  expect(
    droppedInside.map((p) => p.distance),
    `${anchored} left the DOM ${droppedInside[0]?.distance} columns outside a window ` +
      `that overscans ${MIN_OVERSCAN_COLUMNS} for its cursor`,
  ).toEqual([]);

  // Outside it: released. Without this the assertion above is also satisfied
  // by a header row that never unmounts anything.
  const keptOutside = outside.filter((p) => p.mounted);
  expect(
    keptOutside.map((p) => p.distance),
    `${anchored} stayed mounted ${keptOutside[0]?.distance} columns out — the clamp does nothing`,
  ).toEqual([]);

  // And the ARIA half, at every offset: while the header is mounted the grid
  // names it, and once it is gone the attribute is dropped rather than left
  // pointing at an element that does not exist. A dangling
  // `aria-activedescendant` is the failure this whole mechanism exists to
  // avoid, so it is checked on both sides of the clamp rather than only
  // inside it.
  const dangling = readings.filter((p) => p.activeDescendant !== '' && !p.descendantResolves);
  expect(
    dangling.slice(0, 3).map((p) => ({ distance: p.distance, id: p.activeDescendant })),
    'aria-activedescendant named an element that is not in the document',
  ).toEqual([]);
});

test('a header holding real DOM focus is anchored the same way', async ({ page }) => {
  // The cursor is state; real DOM focus is not, and they reach
  // `headerAnchorColumns` by different routes. `focus-lifetime.spec.ts` proves
  // focus is never *dropped*; what is proved here is that inside the clamp it
  // is never even moved — an F2 excursion survives a small scroll intact,
  // rather than being rescued to the grid on the first pixel.
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.locator(`#${TIER_HOST_ID} .dt-grid`).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('F2');
  await waitForTierSettled(page);

  const anchored = columnName(0);
  const startedInHeader = await page.evaluate(
    (col) => document.activeElement?.closest(`.dt-col-header[data-column="${col}"]`) !== null,
    anchored,
  );
  expect(startedInHeader, 'F2 did not put real focus inside the first header').toBe(true);

  const kept: number[] = [];
  const lost: number[] = [];
  for (let step = 1; step <= 40; step++) {
    const p = await probe(page, step * 150, anchored);
    if (p.distance === 0 || p.distance > MIN_OVERSCAN_COLUMNS) continue;
    const stillInHeader = await page.evaluate(
      (col) => document.activeElement?.closest(`.dt-col-header[data-column="${col}"]`) !== null,
      anchored,
    );
    (stillInHeader ? kept : lost).push(p.distance);
  }

  console.log(`[header-anchors] focus kept at distances ${JSON.stringify(kept)}`);
  // Vacuity guard before the real assertion, and counted over both buckets:
  // asking only whether `kept` is non-empty would report a lost-focus failure
  // as "the sweep never reached the clamp", which sends the next reader to the
  // wrong place entirely.
  expect(
    kept.length + lost.length,
    'no offset put the focused header inside the anchor clamp',
  ).toBeGreaterThan(0);
  expect(lost, `real focus left ${anchored} while it was still inside the clamp`).toEqual([]);
});

test('an open layout gesture anchors its header the same way', async ({ page }) => {
  // The third route into `headerAnchorColumns`, and the one with no fallback
  // underneath it. A cursor that loses its header degrades to a dropped
  // `aria-activedescendant`; real focus degrades to `.dt-grid`. `Shift+F2` is
  // neither — `KeyboardNavigator` holds the column name in its own state, so
  // an unmounted header leaves the arrow keys resizing a node that is no
  // longer in the document, with nothing to notice it.
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: COLS, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.locator(`#${TIER_HOST_ID} .dt-grid`).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+F2');
  await waitForTierSettled(page);

  const anchored = columnName(0);
  await expect(
    page.locator(`#${TIER_HOST_ID} .dt-col-header--layout[data-column="${anchored}"]`),
  ).toHaveCount(1);

  const inside: number[] = [];
  const droppedInside: number[] = [];
  for (let step = 1; step <= 40; step++) {
    const p = await probe(page, step * 150, anchored);
    if (p.distance === 0 || p.distance > MIN_OVERSCAN_COLUMNS) continue;
    inside.push(p.distance);
    // Mounted *and* still in layout mode: the element surviving is not enough
    // if the gesture's class came off with a re-key.
    const stillInLayout = await page.evaluate(
      ({ hostId, col }) =>
        document.querySelector(`#${hostId} .dt-col-header--layout[data-column="${col}"]`) !== null,
      { hostId: TIER_HOST_ID, col: anchored },
    );
    if (!stillInLayout) droppedInside.push(p.distance);
  }

  console.log(`[header-anchors] layout gesture held at distances ${JSON.stringify(inside)}`);
  expect(inside.length, 'no offset put the gesture inside the anchor clamp').toBeGreaterThan(0);
  expect(droppedInside, `the ${anchored} layout gesture lost its header inside the clamp`).toEqual(
    [],
  );
});
