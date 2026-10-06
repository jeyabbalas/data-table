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
import {
  NESTED_EXAMPLE,
  NESTED_EXAMPLE_STRUCTS,
  WIDE_COLUMNS,
  loadCsv,
  loadExample,
  mountEmptyTable,
  openDemo,
  setTheme,
  settle,
} from './helpers/demo';
import { openExtractPanel } from './helpers/extract';
import { escapeInspector, openWithF2 } from './helpers/inspector';
import { scrollToColumn, unpaintedCharts, waitForFilledBody } from './helpers/nested';

/**
 * The rules issue #84 reported. An `incomplete` result here means axe could
 * not decide — for these three that is a review item, not a pass, so the
 * specs treat it as a failure.
 */
const RULES_FROM_84 = ['aria-required-children', 'color-contrast', 'scrollable-region-focusable'];

interface AxeSummary {
  violations: { id: string; impact: string | null | undefined; targets: string[] }[];
  incomplete: { id: string; targets: string[] }[];
  /** Every node of every `incomplete` result, with why axe could not decide (`bgOverlap`, …). */
  undecided: { id: string; target: string; reason: string | undefined }[];
  /** Every node that passed a rule. */
  passed: string[];
}

interface ScanOptions {
  /** What to scan. Default: the table, `.dt-root`. */
  include?: string;
  /** Rules to leave out. */
  disable?: string[];
  /** Only these rules. */
  only?: string[];
}

async function scan(page: Page, options: ScanOptions = {}): Promise<AxeSummary> {
  // No `.withTags()`, and no `.withRules()` unless asked — the default rule
  // set is every non-experimental rule, which is the point.
  let builder = new AxeBuilder({ page }).include(options.include ?? '.dt-root');
  if (options.disable) builder = builder.disableRules(options.disable);
  if (options.only) builder = builder.withRules(options.only);
  const results = await builder.analyze();
  const summarise = (nodes: typeof results.violations) =>
    nodes.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  return {
    violations: summarise(results.violations),
    incomplete: summarise(results.incomplete).map(({ id, targets }) => ({ id, targets })),
    undecided: results.incomplete.flatMap((r) =>
      r.nodes.map((n) => ({
        id: r.id,
        target: n.target.join(' '),
        reason: (n.any[0]?.data as { messageKey?: string } | null | undefined)?.messageKey,
      })),
    ),
    passed: results.passes.flatMap((r) => r.nodes.map((n) => n.target.join(' '))),
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

/**
 * axe with a panel open over the table (the value inspector, the extract
 * panel), in two parts. Every rule but `color-contrast` runs over the whole
 * table: the grid, its cursor, and the dialog over it. Contrast runs over the
 * dialog alone, and when the dialog holds a tree, at each scroll position of
 * the tree in turn.
 *
 * The panel stays put while axe scrolls the table to look at each cell, and
 * the cells it slides under the panel are ones whose background axe then
 * cannot tell (`bgOverlap`): dozens a scan, none of them a finding. The
 * grid's contrast is what the scans of the bare table above check. Nor can
 * axe tell the background of an item that the tree's own scroll cuts in
 * half (`elmPartiallyObscured`), so the tree is scanned again further down
 * until every item has been wholly in view, and checked, once.
 */
async function assertDialogClean(page: Page, label: string): Promise<void> {
  assertClean(await scan(page, { disable: ['color-contrast'] }), `${label}, contrast aside`);

  const tree = page.locator('[role="dialog"] [role="tree"]');
  const hasTree = (await tree.count()) > 0;
  const { scrollHeight, clientHeight, tallest, items } = hasTree
    ? await tree.evaluate((t) => ({
        scrollHeight: t.scrollHeight,
        clientHeight: t.clientHeight,
        tallest: Math.max(...Array.from(t.children, (c) => (c as HTMLElement).offsetHeight)),
        items: t.childElementCount,
      }))
    : { scrollHeight: 0, clientHeight: 0, tallest: 0, items: 0 };
  /** The tree items whose text passed the contrast check, by position. */
  const checked = new Set<number>();
  let passes = 0;
  // Positions that overlap by more than the tallest item: every item is
  // wholly inside one of them.
  const step = Math.max(1, clientHeight - tallest - 1);
  for (let top = 0; ; top += step) {
    if (hasTree) {
      await tree.evaluate((t, top) => {
        t.scrollTop = top;
      }, top);
    }
    const at = hasTree ? `${label}, its tree scrolled to ${top}px` : label;
    const summary = await scan(page, { include: '[role="dialog"]', only: ['color-contrast'] });
    expect(
      summary.violations,
      `${at} — axe violations:\n${describeFindings(summary.violations)}`,
    ).toEqual([]);
    // Undecided only where the tree's scroll cuts an item off.
    const cut = await page.evaluate(
      (targets) => {
        const t = document.querySelector<HTMLElement>('[role="dialog"] [role="tree"]');
        if (!t) return targets.map(() => false);
        const top = t.getBoundingClientRect().top + t.clientTop;
        return targets.map((target) => {
          const item = document.querySelector(target)?.closest('[role="treeitem"]');
          if (!item || !t.contains(item)) return false;
          const box = item.getBoundingClientRect();
          return box.top < top - 0.5 || box.bottom > top + t.clientHeight + 0.5;
        });
      },
      summary.undecided.map((u) => u.target),
    );
    const unexplained = summary.undecided.filter(
      (u, i) => u.id !== 'color-contrast' || u.reason !== 'elmPartiallyObscured' || !cut[i],
    );
    expect(
      unexplained,
      `${at} — axe could not decide:\n${unexplained.map((u) => `  ${u.id} (${u.reason}) ${u.target}`).join('\n')}`,
    ).toEqual([]);
    passes += summary.passed.length;
    const passed = await page.evaluate((targets) => {
      const t = document.querySelector('[role="dialog"] [role="tree"]');
      const items = t ? Array.from(t.children) : [];
      return targets.map((target) => {
        const item = document.querySelector(target)?.closest('[role="treeitem"]');
        return item ? items.indexOf(item) : -1;
      });
    }, summary.passed);
    for (const index of passed) if (index >= 0) checked.add(index);
    if (!hasTree || top + clientHeight >= scrollHeight) break;
  }
  expect(passes, `${label} — text whose contrast axe checked`).toBeGreaterThan(0);
  if (!hasTree) return;
  expect(checked.size, `${label} — tree items whose contrast axe checked`).toBe(items);
  await tree.evaluate((t) => {
    t.scrollTop = 0;
  });
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
    // The move rebuilds the charts in view, and they rewrite their stats
    // lines in the next few frames. Scanned while they do, a line that goes
    // mid-scan has a background axe cannot determine.
    await settle(page);

    assertClean(await scan(page), `column layout mode, ${theme}`);
  });

  test(`the nested types example is axe-clean in ${theme}`, async ({ page }) => {
    // Nested columns have a header chart of their own, the nested summary,
    // which writes its own stats line, and their cells hold DuckDB's text:
    // escapes, right-to-left text, combining marks, values cut with `…`.
    // Scanned where the lists are, then where the structs are, each once
    // every chart in view has drawn and the stats lines have stopped moving.
    test.setTimeout(240_000);
    await openDemo(page);
    await loadExample(page, NESTED_EXAMPLE);
    await setTheme(page, theme);
    const root = '.dt-root';
    await expect.poll(() => unpaintedCharts(page, ['tags', 'scores'], root)).toEqual([]);
    await settle(page);
    assertClean(await scan(page), `nested types, lists, ${theme}`);

    await scrollToColumn(page, 'point', root);
    await waitForFilledBody(page, NESTED_EXAMPLE_STRUCTS, root);
    await expect.poll(() => unpaintedCharts(page, NESTED_EXAMPLE_STRUCTS, root)).toEqual([]);
    await settle(page);
    assertClean(await scan(page), `nested types, structs, ${theme}`);
  });

  test(`the value inspector is axe-clean in ${theme}`, async ({ page }) => {
    // The inspector draws its own rows (keys, values, types, counts) in its
    // own palette, over the grid. Scanned open on a struct, and on a list of
    // 2,500 items, which it shows as 25 buckets in a tree that scrolls.
    test.setTimeout(240_000);
    await openDemo(page);
    await loadExample(page, NESTED_EXAMPLE);
    await setTheme(page, theme);
    for (const cell of [
      { row: 10, column: 'point' },
      { row: 6, column: 'long_list' },
    ]) {
      await openWithF2(page, cell, 'demo');
      await settle(page);
      await assertDialogClean(page, `the inspector on ${cell.column}, ${theme}`);
      await escapeInspector(page);
    }
  });

  test(`the extract panel is axe-clean in ${theme}`, async ({ page }) => {
    // The panel draws a tree of the column's type and the fields a part
    // needs, over the grid. Scanned open on a list of structs, its position
    // field showing, and on a JSON column, which asks for a path and how to
    // read it, there with a bad path and the error it gets.
    test.setTimeout(240_000);
    await openDemo(page);
    await loadExample(page, NESTED_EXAMPLE);
    await setTheme(page, theme);

    const people = await openExtractPanel(page, 'people', 'demo');
    // length, then element › name, which asks for the element's position.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(people.getByRole('spinbutton', { name: 'Position in people' })).toBeVisible();
    await settle(page);
    await assertDialogClean(page, `the extract panel on people, ${theme}`);
    await page.keyboard.press('Escape');
    await expect(people).toBeHidden();

    const doc = await openExtractPanel(page, 'doc', 'demo');
    await page.keyboard.type('$.a.');
    await expect(doc.getByRole('textbox', { name: 'JSON path' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await settle(page);
    await assertDialogClean(page, `the extract panel on doc, ${theme}`);
    await page.keyboard.press('Escape');
    await expect(doc).toBeHidden();
  });
}
