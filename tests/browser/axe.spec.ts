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
import type { Locator, Page } from '@playwright/test';
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
  tallDemoTable,
} from './helpers/demo';
import { openExtractPanel } from './helpers/extract';
import { escapeInspector, openWithF2 } from './helpers/inspector';
import { scrollToColumn, unpaintedCharts, waitForFilledBody } from './helpers/nested';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

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
  /** Every node whose contrast axe checked and passed. */
  contrastPassed: string[];
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
    contrastPassed: results.passes
      .filter((r) => r.id === 'color-contrast')
      .flatMap((r) => r.nodes.map((n) => n.target.join(' '))),
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
 *
 * Returns the elements whose contrast axe checked, as axe's selectors.
 */
async function assertDialogClean(page: Page, label: string): Promise<string[]> {
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
  const contrasted: string[] = [];
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
    contrasted.push(...summary.passed);
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
  expect(contrasted.length, `${label} — text whose contrast axe checked`).toBeGreaterThan(0);
  if (!hasTree) return contrasted;
  expect(checked.size, `${label} — tree items whose contrast axe checked`).toBe(items);
  await tree.evaluate((t) => {
    t.scrollTop = 0;
  });
  return contrasted;
}

/**
 * axe over a modal: every rule, contrast among them, over the dialog alone.
 * The table portals its modals to `<body>`, outside `.dt-root`, where the
 * scans above do not look. Returns the elements whose contrast axe checked.
 */
async function assertModalClean(page: Page, label: string): Promise<string[]> {
  const summary = await scan(page, { include: '[role="dialog"]' });
  assertClean(summary, label);
  expect(
    summary.contrastPassed.length,
    `${label} — text whose contrast axe checked`,
  ).toBeGreaterThan(0);
  return summary.contrastPassed;
}

/**
 * Fail unless the element `selector` finds is among those whose contrast
 * axe checked: a scan that skipped it would pass whatever its colour.
 */
async function expectContrastChecked(
  page: Page,
  checked: string[],
  selector: string,
  label: string,
): Promise<void> {
  const found = await page.evaluate(
    ({ checked, selector }) => {
      const el = document.querySelector(selector);
      return el !== null && checked.some((target) => document.querySelector(target) === el);
    },
    { checked, selector },
  );
  expect(found, `${label} — axe checked the contrast of ${selector}`).toBe(true);
}

/** Switch a table {@link mountTable} made to `theme`, and wait for it to repaint. */
async function setTableTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as TestWindow).__dt.setColorScheme(t);
  }, theme);
  await expect(page.locator(`#${HOST_ID} .dt-root`)).toHaveAttribute('data-dt-color-scheme', theme);
  await settle(page);
}

/** Empty a CodeMirror editor from the keyboard, leaving it focused, its placeholder shown. */
async function emptyEditor(page: Page, editor: Locator): Promise<void> {
  await editor.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect(editor.locator('.cm-placeholder')).toBeVisible();
  await expect(editor.locator('.cm-editor')).toHaveClass(/cm-focused/);
}

/**
 * Hover a button and check its text's contrast as painted then. The page a
 * table is mounted on here gives `button:hover` a blue fill, which outranks
 * a library class's own background (0,1,1 against 0,1,0) unless the class's
 * own `:hover` sets one.
 */
async function assertHoveredContrast(page: Page, selector: string, label: string): Promise<void> {
  const button = page.locator(selector);
  const hovered = (): Promise<boolean> => button.evaluate((el) => el.matches(':hover'));
  await button.hover();
  expect(await hovered(), `${label} — under the pointer`).toBe(true);
  // Its colours ease in (`transition`): read them once they have settled.
  await button.evaluate((el) => Promise.allSettled(el.getAnimations().map((a) => a.finished)));
  const summary = await scan(page, { include: selector, only: ['color-contrast'] });
  // Not scrolled from under the pointer while axe looked.
  expect(await hovered(), `${label} — still under the pointer`).toBe(true);
  assertClean(summary, `${label}, hovered`);
  expect(
    summary.contrastPassed.length,
    `${label}, hovered — text whose contrast axe checked`,
  ).toBeGreaterThan(0);
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

  test(`the filter bar and the hidden-columns gutter are axe-clean in ${theme} with their chips overflowing`, async ({
    page,
  }) => {
    // Each toolbar's chips scroll in one row under its buttons, pinned at the
    // row's end, and the roving stop can rest on one of those buttons. A
    // region that overflows passes `scrollable-region-focusable` only if it
    // holds something in the tab order: the filter bar's chips failed it
    // while the stop rested on Expression, beside them, as it does by
    // default. The chips that pass under the buttons have their contrast
    // checked like any other.
    await mountTable(page, { columns: 120, rows: 50 });
    await setTableTheme(page, theme);
    await page.evaluate(() => {
      const { actions } = (window as unknown as TestWindow).__dt;
      const name = (i: number) => `c${String(i).padStart(3, '0')}`;
      for (let i = 20; i < 100; i++) actions.hideColumn(name(i));
      for (let i = 0; i < 16; i++) actions.addFilter({ type: 'not-null', column: name(i) });
    });
    await settle(page);
    // The gutter's stop on "Show all"; the bar's stays on Expression.
    await page.locator(`#${HOST_ID} .dt-hidden-show-all`).focus();
    const toolbars = await page.evaluate((host) => {
      const root = document.getElementById(host)!;
      const overflows = (selector: string) => {
        const el = root.querySelector<HTMLElement>(selector)!;
        return el.scrollWidth > el.clientWidth;
      };
      const stop = (selector: string) =>
        root.querySelector(`${selector} [tabindex="0"]`)?.className ?? null;
      return {
        filterOverflows: overflows('.dt-filter-scroll'),
        hiddenOverflows: overflows('.dt-hidden-scroll'),
        filterStop: stop('.dt-filter-bar'),
        hiddenStop: stop('.dt-hidden-gutter'),
      };
    }, HOST_ID);
    expect(toolbars).toEqual({
      filterOverflows: true,
      hiddenOverflows: true,
      filterStop: 'dt-filter-expression-btn',
      hiddenStop: 'dt-hidden-show-all',
    });
    assertClean(await scan(page), `overflowing toolbars, ${theme}`);
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
    // Room below the header for the whole panel: a field its body scrolls
    // out of view is one whose background axe cannot tell.
    await tallDemoTable(page);

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

  // The filter panel, the preset panel and the derived-column editor float
  // over the table inside `.dt-root`, each a non-modal dialog named by its
  // title. The page the table is mounted on styles its own buttons (white
  // text on blue), which a control that sets no colour of its own shows.

  test(`the filter panel is axe-clean in ${theme}`, async ({ page }) => {
    // A number column's field, then a text column's, which has other controls.
    await mountTable(page, { columns: 6, rows: 50 });
    await setTableTheme(page, theme);
    const panel = page.locator(`#${HOST_ID} .dt-filter-panel`);
    for (const column of ['c0', 'c1']) {
      await page
        .locator(`#${HOST_ID} .dt-col-header[data-column="${column}"] .dt-col-filter-btn`)
        .click();
      await expect(panel).toBeVisible();
      await settle(page);
      await assertDialogClean(page, `the filter panel on ${column}, ${theme}`);
      await expect(panel).toHaveAccessibleName(`Filter: ${column}`);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    }
  });

  test(`the preset panel and its delete confirmation are axe-clean in ${theme}`, async ({
    page,
  }) => {
    await mountTable(page, { columns: 6, rows: 50 });
    await setTableTheme(page, theme);
    await page.evaluate(() => {
      (window as unknown as TestWindow).__dt.actions.addRawSQLFilter('"c0" > 10', 'c0 over 10');
    });
    await page.locator(`#${HOST_ID} .dt-filter-presets-btn`).click();
    const panel = page.locator(`#${HOST_ID} .dt-filter-preset-panel`);
    await expect(panel).toBeVisible();
    await panel.getByPlaceholder('Preset name').fill('Over 10');
    await panel.locator('.dt-filter-preset-save-btn').click();
    await expect(panel.locator('.dt-filter-preset-item')).toHaveCount(1);
    await settle(page);
    await assertDialogClean(page, `the preset panel, ${theme}`);
    await expect(panel).toHaveAccessibleName('Filter Presets');

    // The confirmation's No takes focus: the bare action button, which once
    // showed the page's white button text on the white panel, and then the
    // page's blue under the pointer.
    await panel.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'No', exact: true })).toBeFocused();
    const no = `#${HOST_ID} .dt-filter-preset-delete-confirm > .dt-filter-preset-action-btn:not(.dt-filter-preset-action-btn--delete)`;
    const label = `the preset delete confirmation, ${theme}`;
    const checked = await assertDialogClean(page, label);
    await expectContrastChecked(page, checked, no, label);
    await assertHoveredContrast(page, no, `${label}: No`);
  });

  test(`the SQL filter and derived-column modals are axe-clean in ${theme}, their placeholders showing`, async ({
    page,
  }) => {
    // Each editor focused and empty: its placeholder showing on the
    // dialog's surface, its line the one the cursor is on.
    await mountTable(page, { columns: 6, rows: 50 });
    await setTableTheme(page, theme);

    await page.locator(`#${HOST_ID} .dt-filter-expression-btn`).click();
    const sql = page.getByRole('dialog', { name: 'New Expression Filter' });
    await expect(sql).toBeVisible();
    await emptyEditor(page, sql);
    await settle(page);
    const sqlChecked = await assertModalClean(page, `the SQL filter modal, ${theme}`);
    await expectContrastChecked(
      page,
      sqlChecked,
      '.dt-sql-filter-modal-dialog .cm-placeholder',
      `the SQL filter modal, ${theme}`,
    );
    await page.keyboard.press('Escape');
    await expect(sql).toBeHidden();

    await page.locator(`#${HOST_ID} .dt-add-column-btn`).click();
    const derived = page.getByRole('dialog', { name: 'New Derived Column' });
    await expect(derived).toBeVisible();
    await emptyEditor(page, derived);
    await settle(page);
    const derivedChecked = await assertModalClean(page, `the derived-column modal, ${theme}`);
    await expectContrastChecked(
      page,
      derivedChecked,
      '.dt-derived-modal-dialog .cm-placeholder',
      `the derived-column modal, ${theme}`,
    );
    await page.keyboard.press('Escape');
    await expect(derived).toBeHidden();

    // Editing a filter offers Remove, whose confirmation's Cancel is the
    // twin of the preset panel's No, under the pointer too.
    await page.evaluate(() => {
      (window as unknown as TestWindow).__dt.actions.addRawSQLFilter('"c0" > 10', 'c0 over 10');
    });
    await page.locator(`#${HOST_ID} .dt-filter-chip-label--sql`).click();
    const edit = page.getByRole('dialog', { name: 'Edit Expression Filter' });
    await expect(edit).toBeVisible();
    await edit.locator('.dt-sql-filter-modal-remove').click();
    const cancel = '.dt-sql-filter-modal-dialog .dt-sql-filter-modal-remove-confirm-no';
    await expect(page.locator(cancel)).toBeFocused();
    await assertHoveredContrast(
      page,
      cancel,
      `the SQL filter modal's Remove confirmation, ${theme}: Cancel`,
    );
  });

  test(`the derived-column editor and its delete confirmation are axe-clean in ${theme}`, async ({
    page,
  }) => {
    await mountTable(page, { columns: 6, rows: 50 });
    await setTableTheme(page, theme);
    const added = await page.evaluate(() =>
      (window as unknown as TestWindow).__dt.actions.addDerivedColumn({
        kind: 'expression',
        name: 'd',
        expression: 'c0 * 2',
      }),
    );
    expect(added.success).toBe(true);
    await settle(page);

    await page.locator(`#${HOST_ID} .dt-col-header[data-column="d"] .dt-derived-icon-btn`).click();
    const panel = page.locator(`#${HOST_ID} .dt-derived-edit-panel`);
    await expect(panel).toBeVisible();
    await emptyEditor(page, panel);
    await settle(page);
    // The default placeholder is wider than this 360 px editor. It ends in
    // an ellipsis at the edge, and no longer runs on into a scroll region
    // no key can scroll (`scrollable-region-focusable`).
    const { cut, overflow } = await panel.evaluate((p) => {
      const hint = p.querySelector('.cm-placeholder')!;
      const scroller = p.querySelector('.cm-scroller')!;
      return {
        cut: hint.scrollWidth > hint.clientWidth,
        overflow: scroller.scrollWidth - scroller.clientWidth,
      };
    });
    expect(cut, 'the placeholder is cut off at the edge').toBe(true);
    expect(overflow, 'px the editor scrolls sideways').toBe(0);
    const checked = await assertDialogClean(page, `the derived-column editor, ${theme}`);
    await expectContrastChecked(
      page,
      checked,
      `#${HOST_ID} .dt-derived-edit-panel .cm-placeholder`,
      `the derived-column editor, ${theme}`,
    );
    await expect(panel).toHaveAccessibleName('Edit: d');

    await panel.locator('.dt-derived-edit-delete').click();
    await expect(panel.locator('.dt-derived-edit-delete-confirm-no')).toBeFocused();
    const label = `the derived-column editor's delete confirmation, ${theme}`;
    await assertDialogClean(page, label);
    await assertHoveredContrast(
      page,
      `#${HOST_ID} .dt-derived-edit-delete-confirm-no`,
      `${label}: Cancel`,
    );
  });
}
