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
  });
}
