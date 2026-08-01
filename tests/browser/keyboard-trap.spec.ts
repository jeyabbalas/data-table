/**
 * WCAG 2.1.2 (No Keyboard Trap) for the table root.
 *
 * Issue #84's stated invariant: "a Tab from the last control before the grid
 * eventually reaches the first control after it", in both directions, with a
 * press count that does not grow with the column count.
 *
 * This cannot be tested in jsdom. jsdom implements no sequential focus
 * navigation, so `Tab` moves nothing and every walk trivially "passes" —
 * re-adding a live keyboard trap was measured to leave all ~3,650 vitest
 * tests green.
 */

import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';
import type { TabWalk } from './helpers/demo';
import { NARROW_COLUMNS, WIDE_COLUMNS, loadCsv, openDemo, tabOut } from './helpers/demo';

const ROOT = '.dt-root';

interface Crossing {
  columns: number;
  forward: TabWalk;
  reverse: TabWalk;
  inside: string[];
}

/**
 * Load a table of `columns` columns in its own browser context and walk
 * focus across it in both directions.
 *
 * A fresh context per measurement matters: the demo persists table state
 * (hidden columns, filters, widths) to IndexedDB keyed by file, and a
 * restored layout would change the tab order out from under the comparison.
 */
async function crossTable(browser: Browser, columns: number): Promise<Crossing> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openDemo(page);
    await loadCsv(page, columns);

    const inside = await page.evaluate((s) => window.__dtA11y.partition(s).inside, ROOT);

    await page.evaluate((s) => window.__dtA11y.focusLastBefore(s), ROOT);
    const forward = await tabOut(page, ROOT);

    await page.evaluate((s) => window.__dtA11y.focusFirstAfter(s), ROOT);
    const reverse = await tabOut(page, ROOT, { shift: true });

    return { columns, forward, reverse, inside };
  } finally {
    await context.close();
  }
}

const report = (c: Crossing, dir: 'forward' | 'reverse'): string =>
  `${dir} walk at ${c.columns} columns (${c.inside.length} tabbables inside .dt-root):\n` +
  c[dir].trail.join('\n');

test('Tab crosses the table in both directions, in a column-count-independent number of presses', async ({
  browser,
}) => {
  // Two full DuckDB loads, one of them 266 columns wide.
  test.setTimeout(360_000);

  const narrow = await crossTable(browser, NARROW_COLUMNS);
  const wide = await crossTable(browser, WIDE_COLUMNS);

  for (const c of [narrow, wide]) {
    expect(c.forward.presses, report(c, 'forward')).not.toBeNull();
    expect(c.reverse.presses, report(c, 'reverse')).not.toBeNull();
  }

  // The point of the ARIA grid pattern: the table is a fixed handful of tab
  // stops you step into and out of, not one stop per column.
  expect(
    wide.forward.presses,
    `forward presses differ by column count — ${NARROW_COLUMNS} cols took ` +
      `${narrow.forward.presses}, ${WIDE_COLUMNS} cols took ${wide.forward.presses}\n` +
      report(wide, 'forward'),
  ).toBe(narrow.forward.presses);

  expect(
    wide.reverse.presses,
    `reverse presses differ by column count — ${NARROW_COLUMNS} cols took ` +
      `${narrow.reverse.presses}, ${WIDE_COLUMNS} cols took ${wide.reverse.presses}\n` +
      report(wide, 'reverse'),
  ).toBe(narrow.reverse.presses);

  // Crossing costs one press per stop inside, plus one to step off the last
  // of them. Pinning the relationship — rather than a bare number — keeps the
  // documented count honest without hard-coding the demo page's layout: the
  // guides and the changeset quote this figure, and quoting it wrongly is the
  // specific failure this whole suite exists to prevent.
  for (const c of [narrow, wide]) {
    for (const dir of ['forward', 'reverse'] as const) {
      expect(
        c[dir].presses,
        `${dir} crossing at ${c.columns} columns took ${c[dir].presses} presses for ` +
          `${c.inside.length} stops — expected ${c.inside.length + 1}\n${report(c, dir)}`,
      ).toBe(c.inside.length + 1);
    }
  }
});

test('Tab moves focus forward on every press inside the table', async ({ page }) => {
  // A trap that cycles A → B → A satisfies "focus keeps moving" but never
  // leaves. Guard the shape of the failure as well as the outcome: no
  // element may be visited twice on the way out.
  await openDemo(page);
  await loadCsv(page, NARROW_COLUMNS);

  await page.evaluate((s) => window.__dtA11y.focusLastBefore(s), ROOT);
  const walk = await tabOut(page, ROOT);

  expect(
    walk.presses,
    `forward walk never left .dt-root:\n${walk.trail.join('\n')}`,
  ).not.toBeNull();

  // Compared by element identity, not by descriptor — two chips in one
  // toolbar describe identically and would look like a cycle that isn't.
  expect(
    new Set(walk.identities).size,
    `focus revisited an element:\n${walk.trail.join('\n')}`,
  ).toBe(walk.identities.length);
});
