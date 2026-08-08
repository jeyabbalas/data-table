/**
 * axe-core against `.dt-root` with every rule enabled, in a real browser,
 * in both colour schemes, loaded and unloaded.
 *
 * The repo already runs axe under jsdom. That catches structural rules but
 * not the ones issue #84 was actually filed for: `color-contrast` needs real
 * paint, and `scrollable-region-focusable` needs real overflow — jsdom
 * reports every element as zero-sized, so both rules resolve to `incomplete`
 * and never fire.
 *
 * `incomplete` is asserted, not just `violations`. The jsdom suite reads only
 * `violations`, which is how a critical `incomplete` on `.dt-body-scroll`
 * passed silently.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { WIDE_COLUMNS, loadCsv, mountEmptyTable, openDemo, setTheme } from './helpers/demo';

/**
 * The rules issue #84 reported. An `incomplete` result here means axe could
 * not decide — for these three that is a review item, not a pass, so the
 * specs treat it as a failure.
 */
const RULES_FROM_84 = ['aria-required-children', 'color-contrast', 'scrollable-region-focusable'];

interface AxeSummary {
  violations: { id: string; impact: string | null | undefined; targets: string[] }[];
  incomplete: { id: string; targets: string[] }[];
}

async function scan(page: Page): Promise<AxeSummary> {
  // No `.withTags()` / `.withRules()` — the default rule set is every
  // non-experimental rule, which is the point.
  const results = await new AxeBuilder({ page }).include('.dt-root').analyze();
  const summarise = (nodes: typeof results.violations) =>
    nodes.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  return {
    violations: summarise(results.violations),
    incomplete: summarise(results.incomplete).map(({ id, targets }) => ({ id, targets })),
  };
}

const describeFindings = (findings: { id: string; targets: string[] }[]): string =>
  findings.map((f) => `  ${f.id}\n${f.targets.map((t) => `      ${t}`).join('\n')}`).join('\n');

function assertClean(summary: AxeSummary, label: string): void {
  expect(
    summary.violations,
    `${label} — axe violations:\n${describeFindings(summary.violations)}`,
  ).toEqual([]);

  const unresolved = summary.incomplete.filter((i) => RULES_FROM_84.includes(i.id));
  expect(
    unresolved,
    `${label} — axe could not resolve rules reported in issue #84:\n${describeFindings(unresolved)}`,
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`the unloaded table shell is axe-clean in ${theme}`, async ({ page }) => {
    // With no data, `.dt-root` is a shell carrying no grid semantics. It
    // still has to be valid on its own: `createDataTable` without a `source`
    // is the documented mount-now-load-later path, so this is a state real
    // consumers paint. It is also where a childless `role="row"` shows up.
    await mountEmptyTable(page, theme);
    assertClean(await scan(page), `unloaded shell, ${theme}`);
  });

  test(`a ${WIDE_COLUMNS}-column table is axe-clean in ${theme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await openDemo(page);
    await loadCsv(page, WIDE_COLUMNS);
    await setTheme(page, theme);
    assertClean(await scan(page), `${WIDE_COLUMNS} columns, ${theme}`);

    // …and again scrolled off column 0, which is where the body's column
    // window is actually novel: both presentational spacers non-empty, and an
    // `aria-colindex` run that neither starts at 1 nor reaches
    // `aria-colcount`. ARIA prescribes exactly that for a partially rendered
    // row, and `aria-required-children` is the rule that would object if the
    // spacers were exposed. A second scan of the same mount rather than a
    // second test: loading 266 columns of CSV is the expensive part, and the
    // state under test is one scroll away from the one already loaded.
    const scrolled = await page.evaluate(() => {
      const el = document.querySelector('.dt-body-scroll') as HTMLElement;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      return el.scrollLeft;
    });
    expect(scrolled, 'the sweep must actually move off column 0').toBeGreaterThan(0);
    const shape = await page
      .locator('.dt-body .dt-row[data-row-id]:not([data-placeholder])')
      .first()
      .evaluate((row) => ({
        cells: row.querySelectorAll('.dt-cell[data-column]').length,
        firstColIndex: Number(
          row.querySelector('.dt-cell[data-column]')?.getAttribute('aria-colindex'),
        ),
        spacers: row.querySelectorAll('[data-col-spacer]').length,
      }));
    // Refuse to scan a body that is not windowed — it would pass and prove
    // nothing.
    expect(shape.spacers).toBe(2);
    expect(shape.cells).toBeLessThan(WIDE_COLUMNS);
    expect(shape.firstColIndex).toBeGreaterThan(1);

    assertClean(await scan(page), `${WIDE_COLUMNS} columns scrolled, ${theme}`);
  });

  test(`column layout mode is axe-clean in ${theme}`, async ({ page }) => {
    // The mode adds `aria-keyshortcuts` to every header and a second
    // `role="status"` region, and lights a `role="separator"` that stays
    // unfocusable on purpose — a focusable one would need `aria-valuenow` /
    // `min` / `max` and trip `aria-required-attr`. Scanned live because that
    // last rule only fires against a real accessibility tree.
    test.setTimeout(240_000);
    await openDemo(page);
    await loadCsv(page, WIDE_COLUMNS);
    await setTheme(page, theme);

    await page.locator('.dt-grid').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+F2');
    await expect(page.locator('.dt-col-header--layout')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    assertClean(await scan(page), `column layout mode, ${theme}`);
  });
}
