/**
 * The value inspector: a nested or JSON cell's whole value in a dialog
 * beside the cell, as a keyboard tree.
 *
 * jsdom runs every part of it on synthetic events and stubbed geometry: the
 * tree's keys, the panel's focus hand-off, F2 through the facade. What only
 * a browser has, and these specs use:
 *
 * - real pointer gestures: a double click, and a click on the inspect icon,
 *   which the stylesheet draws and the body finds by where the click landed;
 * - sequential focus navigation, which jsdom does not implement at all, so a
 *   Tab that skipped the tree's one stop or walked out of the dialog passes
 *   there;
 * - layout: the panel placed beside its cell, and the tree scrolling its
 *   active item into view without moving the page or the table;
 * - the system clipboard, and DuckDB's exact JSON coming over the worker,
 *   megabytes of it.
 *
 * What the tree should show comes from `table.actions.getCellValue`, and
 * what the clipboard should hold from DuckDB's text of each part of the
 * value (`helpers/inspector.ts`), not from text built by hand. Each test
 * also fails on any console error.
 */

import { expect, test, type Page } from '@playwright/test';
import { NESTED_EXAMPLE, installProbes, loadExample, openDemo } from './helpers/demo';
import {
  type CellRef,
  activeItem,
  anyDialog,
  cellAt,
  cursorDom,
  escapeInspector,
  expectTopLevel,
  frames,
  inspectorOn,
  openWithF2,
  tableRoot,
  treeItems,
  valueSummary,
  waitForTreeFocus,
} from './helpers/inspector';
import {
  NESTED_HOST_ID,
  type NestedWindow,
  mountSqlTable,
  scrollToColumn,
  waitForFilledBody,
  watchConsoleErrors,
} from './helpers/nested';

/** The nested fixture's row of readable values (`SHOWCASE.DEMO`). */
const DEMO_ROW = 10;

/**
 * `id`, then a struct `s` whose tree opens three levels deep, the same in
 * every row:
 *
 * ```
 * s: struct(4), 4 fields
 *   alpha: 1
 *   beta: [integer], 3 items     1: 10 · 2: 20 · 3: 30
 *   gamma: struct(2), 2 fields   delta: "x" · epsilon: true
 *   bravo: 2
 * ```
 *
 * Ten rows in all, so the tree opens with every node expanded.
 */
const STRUCT_SELECT = `{'alpha': 1, 'beta': [10, 20, 30],
  'gamma': {'delta': 'x', 'epsilon': true}, 'bravo': 2} AS s`;

const S = {
  root: 's: struct(4), 4 fields',
  alpha: 'alpha: 1',
  beta: 'beta: [integer], 3 items',
  b1: '1: 10',
  b2: '2: 20',
  b3: '3: 30',
  gamma: 'gamma: struct(2), 2 fields',
  delta: 'delta: "x"',
  epsilon: 'epsilon: true',
  bravo: 'bravo: 2',
} as const;

/**
 * A press on the page beside the table, on an element of its own, so that
 * it presses nothing else.
 */
async function pressOutside(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('dt-outside')) return;
    const el = document.createElement('div');
    el.id = 'dt-outside';
    // Below and right of the 1200 × 600 px host, in the 1280 × 720 px page.
    el.style.cssText =
      'position: fixed; right: 0; bottom: 0; width: 60px; height: 60px; z-index: 2;';
    document.body.appendChild(el);
  });
  await page.locator('#dt-outside').click();
}

/** The labels of the visible items, in order. */
async function visibleLabels(page: Page): Promise<string[]> {
  return (await treeItems(page)).map((i) => i.label);
}

/** The panel's box, the box of the `.dt-root` it is mounted in, and the cell's. */
async function placement(page: Page, cell: CellRef, root: string) {
  return page.evaluate(
    ({ cell, root }) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      // The open one: the demo may hold others, hidden.
      const panel = Array.from(document.querySelectorAll('[role="dialog"]')).find(
        (d) => d.getClientRects().length > 0,
      )!;
      const cellEl = document.querySelector(
        `${root} .dt-body .dt-row[data-row-index="${cell.row}"] > .dt-cell[data-column="${cell.column}"]`,
      )!;
      return { panel: box(panel), root: box(panel.parentElement!), cell: box(cellEl) };
    },
    { cell, root },
  );
}

/**
 * The panel is inside its table and beside its cell, below or above it,
 * never over it.
 */
async function expectBesideCell(page: Page, cell: CellRef, root: string): Promise<void> {
  const { panel, root: table, cell: anchor } = await placement(page, cell, root);
  expect(panel.left).toBeGreaterThanOrEqual(table.left - 0.5);
  expect(panel.right).toBeLessThanOrEqual(table.right + 0.5);
  expect(panel.top).toBeGreaterThanOrEqual(table.top - 0.5);
  expect(panel.bottom).toBeLessThanOrEqual(table.bottom + 0.5);
  expect(
    panel.top >= anchor.bottom - 0.5 || panel.bottom <= anchor.top + 0.5,
    `the panel (${panel.top}–${panel.bottom}) leaves its cell (${anchor.top}–${anchor.bottom}) uncovered`,
  ).toBe(true);
}

test('opens on a nested or JSON cell from a double click, F2 or its inspect icon, with the value getCellValue reads', async ({
  page,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const root = tableRoot('demo');

  await test.step('a double click on a list', async () => {
    const tags = { row: DEMO_ROW, column: 'tags' };
    await expect(cellAt(page, tags, 'demo')).toHaveAttribute('aria-haspopup', 'dialog');
    await cellAt(page, tags, 'demo').dblclick();
    const dialog = inspectorOn(page, tags);
    await expect(dialog).toBeVisible();
    await waitForTreeFocus(page);
    await expect(dialog.getByRole('tree', { name: 'Value of tags', exact: true })).toBeVisible();
    await expectTopLevel(page, 'tags', await valueSummary(page, DEMO_ROW, 'tags', 'demo'));
    await expectBesideCell(page, tags, root);
    await escapeInspector(page);
  });

  await test.step('F2 on a struct out of view: the cell scrolls into view under the panel', async () => {
    const point = { row: DEMO_ROW, column: 'point' };
    await openWithF2(page, point, 'demo');
    await expectTopLevel(page, 'point', await valueSummary(page, DEMO_ROW, 'point', 'demo'));
    const inView = await page.evaluate(
      ({ root, column, row }) => {
        const scroller = document.querySelector(`${root} .dt-body-scroll`)!;
        const view = scroller.getBoundingClientRect();
        const cell = document
          .querySelector(
            `${root} .dt-row[data-row-index="${row}"] > .dt-cell[data-column="${column}"]`,
          )!
          .getBoundingClientRect();
        return cell.left >= view.left - 0.5 && cell.right <= view.left + scroller.clientWidth + 0.5;
      },
      { root, ...point },
    );
    expect(inView, 'the struct cell scrolled into view').toBe(true);
    await expectBesideCell(page, point, root);
    await escapeInspector(page);
  });

  await test.step('a double click on a JSON cell', async () => {
    const doc = { row: DEMO_ROW, column: 'doc' };
    await scrollToColumn(page, 'doc', root);
    await waitForFilledBody(page, ['doc'], root);
    await cellAt(page, doc, 'demo').dblclick();
    await expect(inspectorOn(page, doc)).toBeVisible();
    await waitForTreeFocus(page);
    await expectTopLevel(page, 'doc', await valueSummary(page, DEMO_ROW, 'doc', 'demo'));
    await escapeInspector(page);
  });

  await test.step('a click on the inspect icon of a map, which leaves the selection alone', async () => {
    // `int_keys` holds the keys 2, 1, 10 in that order: an object would
    // put 1 and 2 first.
    const intKeys = { row: DEMO_ROW, column: 'int_keys' };
    await scrollToColumn(page, 'int_keys', root);
    await waitForFilledBody(page, ['int_keys'], root);
    await page.evaluate(() =>
      (
        window as unknown as { __dtDemo: { table: NestedWindow['__dt'] } }
      ).__dtDemo.table.actions.selectRow(2),
    );
    const cell = cellAt(page, intKeys, 'demo');
    const box = (await cell.boundingBox())!;
    // The icon, which the stylesheet draws on hover 4 px from the cell's end.
    const icon = { x: box.width - 14, y: box.height / 2 };
    await cell.hover({ position: icon });
    expect(
      await cell.evaluate((el) => getComputedStyle(el, '::before').width),
      'the inspect icon shows on hover',
    ).toBe('20px');
    await cell.click({ position: icon });
    await expect(inspectorOn(page, intKeys)).toBeVisible();
    await waitForTreeFocus(page);
    await expectTopLevel(page, 'int_keys', await valueSummary(page, DEMO_ROW, 'int_keys', 'demo'));
    const state = await page.evaluate(() => {
      const t = (window as unknown as { __dtDemo: { table: NestedWindow['__dt'] } }).__dtDemo.table;
      return { selected: [...t.state.selectedRows.get()], cursor: t.state.focusedCell.get() };
    });
    expect(state).toEqual({ selected: [2], cursor: intKeys });
    await escapeInspector(page);
  });

  await test.step('neither a scalar nor a NULL opens it', async () => {
    await scrollToColumn(page, 'id', root);
    await waitForFilledBody(page, ['label', 'tags'], root);
    const scalar = { row: DEMO_ROW, column: 'label' };
    const nullList = { row: 0, column: 'tags' };
    await expect(cellAt(page, nullList, 'demo')).toHaveText('null');
    for (const cell of [scalar, nullList]) {
      await expect(cellAt(page, cell, 'demo')).not.toHaveAttribute('aria-haspopup');
      await cellAt(page, cell, 'demo').dblclick();
      await frames(page);
      await expect(
        anyDialog(page),
        `a double click on ${cell.column} of row ${cell.row}`,
      ).toHaveCount(0);

      await page.evaluate(
        (cell) =>
          (
            window as unknown as { __dtDemo: { table: NestedWindow['__dt'] } }
          ).__dtDemo.table.actions.setFocusedCell(cell),
        cell,
      );
      await page.locator(`${root} .dt-grid`).focus();
      await page.keyboard.press('F2');
      await frames(page);
      await expect(anyDialog(page), `F2 on ${cell.column} of row ${cell.row}`).toHaveCount(0);
    }
  });

  await test.step('Escape leaves the page where it is, the grid’s top above the window', async () => {
    // Focus goes back to the grid, which is taller than the window: a plain
    // focus() on it scrolled the page to bring its top into view, by up to
    // 200 px here. escapeInspector checks the page does not move.
    await page.evaluate((root) => {
      window.scrollBy(0, document.querySelector(root)!.getBoundingClientRect().top + 150);
    }, root);
    const row = await page.evaluate((root) => {
      const scroller = document.querySelector(`${root} .dt-body-scroll`)!.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight, scroller.bottom);
      const rows = Array.from(document.querySelectorAll(`${root} .dt-body .dt-row[data-row-id]`));
      // The lowest row wholly in view whose `tags` the inspector opens on.
      const target = rows.reverse().find((r) => {
        const box = r.getBoundingClientRect();
        return (
          box.top >= Math.max(0, scroller.top) &&
          box.bottom <= bottom &&
          r.querySelector('.dt-cell--inspectable[data-column="tags"]')
        );
      });
      return Number(target!.getAttribute('data-row-index'));
    }, root);
    const tags = { row, column: 'tags' };
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await cellAt(page, tags, 'demo').dblclick();
    await expect(inspectorOn(page, tags)).toBeVisible();
    await waitForTreeFocus(page);
    await escapeInspector(page);
    await expect(cellAt(page, tags, 'demo')).toBeInViewport();
  });

  expect(errors).toEqual([]);
});

test('the tree answers the APG keys, Tab stays in the dialog, and Escape gives the cursor back', async ({
  page,
}) => {
  const errors = watchConsoleErrors(page);
  await mountSqlTable(page, { rows: 50, select: STRUCT_SELECT });
  await waitForFilledBody(page, ['id', 's']);

  // From here on, the keyboard only.
  await page.locator(`#${NESTED_HOST_ID} .dt-grid`).focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowRight');
  const cell = { row: 0, column: 's' };
  expect((await cursorDom(page, 'mounted')).focusedCell).toEqual(cell);
  await page.keyboard.press('F2');
  const dialog = inspectorOn(page, cell);
  await expect(dialog).toBeVisible();
  await waitForTreeFocus(page);
  await expect(dialog.getByRole('tree', { name: 'Value of s', exact: true })).toBeVisible();

  // Everything starts open: ten rows.
  const all = [S.root, S.alpha, S.beta, S.b1, S.b2, S.b3, S.gamma, S.delta, S.epsilon, S.bravo];
  expect(await visibleLabels(page)).toEqual(all);
  expect(await activeItem(page)).toMatchObject({
    label: S.root,
    level: 1,
    posinset: 1,
    setsize: 1,
    expanded: true,
  });

  /** Press `key`, then expect the active item to be `label`, at `level`, `posinset` of `setsize`. */
  const press = async (
    key: string,
    want: {
      label: string;
      level: number;
      posinset: number;
      setsize: number;
      expanded?: boolean | null;
    },
  ): Promise<void> => {
    // Named keys are pressed; characters are typed, a word in one go.
    if (/^[A-Z][A-Za-z]+$/.test(key)) await page.keyboard.press(key);
    else await page.keyboard.type(key);
    expect(await activeItem(page), `after ${key}`).toMatchObject(want);
  };

  await press('ArrowDown', { label: S.alpha, level: 2, posinset: 1, setsize: 4, expanded: null });
  await press('ArrowDown', { label: S.beta, level: 2, posinset: 2, setsize: 4, expanded: true });
  // → on an open node goes to its first child; ← on a child goes to its parent.
  await press('ArrowRight', { label: S.b1, level: 3, posinset: 1, setsize: 3 });
  await press('End', { label: S.bravo, level: 2, posinset: 4, setsize: 4 });
  await press('ArrowUp', { label: S.epsilon, level: 3, posinset: 2, setsize: 2 });
  await press('ArrowLeft', { label: S.gamma, level: 2, posinset: 3, setsize: 4, expanded: true });
  // ← closes an open node, → opens it again, Enter toggles it.
  await press('ArrowLeft', { label: S.gamma, level: 2, posinset: 3, setsize: 4, expanded: false });
  expect(await visibleLabels(page)).toEqual(all.filter((l) => l !== S.delta && l !== S.epsilon));
  await press('ArrowRight', { label: S.gamma, level: 2, posinset: 3, setsize: 4, expanded: true });
  expect(await visibleLabels(page)).toEqual(all);
  await press('Enter', { label: S.gamma, level: 2, posinset: 3, setsize: 4, expanded: false });
  await press('Home', { label: S.root, level: 1, posinset: 1, setsize: 1 });
  // Type-ahead: a letter goes to the next item that starts with it.
  await press('b', { label: S.beta, level: 2, posinset: 2, setsize: 4 });
  await press('ArrowLeft', { label: S.beta, level: 2, posinset: 2, setsize: 4, expanded: false });
  expect(await visibleLabels(page)).toEqual([S.root, S.alpha, S.beta, S.gamma, S.bravo]);
  // `*` opens every sibling at the active item's level.
  await press('*', { label: S.beta, level: 2, posinset: 2, setsize: 4, expanded: true });
  expect(await visibleLabels(page)).toEqual(all);
  await press('Home', { label: S.root, level: 1, posinset: 1, setsize: 1 });
  // Letters typed in quick succession are one word: "br" goes past beta, to bravo.
  await press('br', { label: S.bravo, level: 2, posinset: 4, setsize: 4 });
  // The same letter again goes on to the next item that starts with it, and wraps.
  await press('ArrowUp', { label: S.epsilon, level: 3, posinset: 2, setsize: 2 });
  await press('b', { label: S.bravo, level: 2, posinset: 4, setsize: 4 });
  await press('b', { label: S.beta, level: 2, posinset: 2, setsize: 4 });

  // Tab: round the dialog's controls, the tree one stop among them, and
  // never out; Shift+Tab: the same stops the other way round.
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement!;
      return {
        inDialog: !!el.closest('[role="dialog"]'),
        name:
          el.getAttribute('role') === 'treeitem'
            ? `treeitem ${el.getAttribute('aria-label')}`
            : `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent}`,
      };
    });
  const start = (await focused()).name;
  const forward: string[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const now = await focused();
    expect(now.inDialog, `Tab ${i + 1} left the dialog for ${now.name}`).toBe(true);
    forward.push(now.name);
    if (now.name === start) break;
  }
  expect(forward.at(-1), 'Tab came back round to the tree').toBe(start);
  expect(
    forward.filter((n) => n.startsWith('treeitem')),
    'the tree is one stop',
  ).toEqual([start]);
  expect(forward).toEqual(
    expect.arrayContaining(['button Close value inspector', 'button Copy JSON', 'button Close']),
  );
  const backward: string[] = [];
  for (let i = 0; i < forward.length; i++) {
    await page.keyboard.press('Shift+Tab');
    const now = await focused();
    expect(now.inDialog, `Shift+Tab ${i + 1} left the dialog for ${now.name}`).toBe(true);
    backward.push(now.name);
  }
  expect(backward).toEqual([...forward.slice(0, -1).reverse(), start]);

  // Escape: closed, and the grid has focus with the cursor where it was.
  await escapeInspector(page);
  expect(await cursorDom(page, 'mounted')).toEqual({
    focusedCell: cell,
    gridFocused: true,
    activeDescendant: cell,
  });
  expect(errors).toEqual([]);
});

/** Items in row 0's `big`; every other row holds one. */
const BIG_ITEMS = 2500;

test(`a list of ${BIG_ITEMS.toLocaleString('en-US')} items comes in buckets of 100, which open at once`, async ({
  page,
}, testInfo) => {
  const errors = watchConsoleErrors(page);
  // Item k (1-based) of row 0 is 7(k − 1) + 3: no item's text is its position.
  await mountSqlTable(page, {
    rows: 50,
    select: `CASE WHEN i = 0 THEN list_transform(range(${BIG_ITEMS}), j -> CAST(j * 7 + 3 AS INTEGER))
      ELSE [CAST(i AS INTEGER)] END AS big`,
  });
  await waitForFilledBody(page, ['big']);

  // When each key went down, and when the tree first had focus.
  await page.evaluate(() => {
    const w = window as unknown as { __dtTimes: Record<string, number> };
    const times: Record<string, number> = (w.__dtTimes = {});
    document.addEventListener('keydown', (e) => (times[e.key] = performance.now()), true);
    document.addEventListener(
      'focusin',
      (e) => {
        if ((e.target as Element).getAttribute('role') === 'treeitem')
          times.treeFocus ??= performance.now();
      },
      true,
    );
  });
  const cell = { row: 0, column: 'big' };
  // The first open in the page: it loads the panel's chunk too.
  await openWithF2(page, cell, 'mounted');
  const firstOpen = await page.evaluate(() => {
    const t = (window as unknown as { __dtTimes: Record<string, number> }).__dtTimes;
    return t.treeFocus! - t.F2!;
  });

  const buckets = Array.from(
    { length: BIG_ITEMS / 100 },
    (_, b) => `[${b * 100 + 1} … ${b * 100 + 100}]`,
  );
  const items = await treeItems(page);
  expect(items[0]).toMatchObject({
    label: `big: [integer], ${BIG_ITEMS.toLocaleString('en-US')} items`,
    level: 1,
  });
  expect(items.slice(1).map((i) => i.label)).toEqual(buckets);
  for (const [i, item] of items.slice(1).entries()) {
    expect(item).toMatchObject({
      level: 2,
      posinset: i + 1,
      setsize: buckets.length,
      expanded: false,
    });
  }

  // Down to the 13th bucket, and open it.
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowDown');
  expect(await activeItem(page)).toMatchObject({ label: '[1201 … 1300]', posinset: 13 });
  await page.evaluate(() => {
    const w = window as unknown as { __dtTimes: Record<string, number> };
    const tree = document.querySelector('[role="dialog"] [role="tree"]')!;
    const observer = new MutationObserver(() => {
      if (tree.childElementCount < 126) return;
      observer.disconnect();
      w.__dtTimes.expanded = performance.now();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => (w.__dtTimes.painted = performance.now())),
      );
    });
    observer.observe(tree, { childList: true });
  });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => (window as unknown as { __dtTimes: Record<string, number> }).__dtTimes.painted,
  );
  const expand = await page.evaluate(() => {
    const t = (window as unknown as { __dtTimes: Record<string, number> }).__dtTimes;
    return { dom: t.expanded! - t.ArrowRight!, painted: t.painted! - t.ArrowRight! };
  });

  // Its 100 items, right after it, each with its value.
  const values = (await page.evaluate(() =>
    (window as unknown as NestedWindow).__dt.actions.getCellValue(0, 'big'),
  )) as number[];
  expect(values).toHaveLength(BIG_ITEMS);
  const opened = await treeItems(page);
  const at = opened.findIndex((i) => i.label === '[1201 … 1300]');
  expect(opened[at]).toMatchObject({ expanded: true, selected: true });
  const children = opened.slice(at + 1, at + 101);
  expect(children.map((c) => c.label)).toEqual(
    Array.from({ length: 100 }, (_, i) => `${1201 + i}: ${values[1200 + i]}`),
  );
  for (const [i, child] of children.entries()) {
    expect(child).toMatchObject({ level: 3, posinset: i + 1, setsize: 100, expanded: null });
  }
  expect(opened[at + 101]!.label).toBe('[1301 … 1400]');
  await page.keyboard.press('ArrowRight');
  expect(await activeItem(page)).toMatchObject({ label: `1201: ${values[1200]}`, level: 3 });

  // End reaches the last item by scrolling the tree, and the tree alone.
  const scrolls = () =>
    page.evaluate((hostId) => {
      const tree = document.querySelector<HTMLElement>('[role="dialog"] [role="tree"]')!;
      const body = document.querySelector(`#${hostId} .dt-body-scroll`)!;
      const view = tree.getBoundingClientRect();
      const top = view.top + tree.clientTop;
      const item = document.activeElement!.getBoundingClientRect();
      return {
        tree: tree.scrollTop,
        activeInView: item.top >= top - 0.5 && item.bottom <= top + tree.clientHeight + 0.5,
        others: [window.scrollX, window.scrollY, body.scrollLeft, body.scrollTop],
      };
    }, NESTED_HOST_ID);
  const before = await scrolls();
  await page.keyboard.press('End');
  expect(await activeItem(page)).toMatchObject({ label: '[2401 … 2500]', posinset: 25 });
  const atEnd = await scrolls();
  expect(atEnd.tree).toBeGreaterThan(before.tree);
  expect(atEnd).toMatchObject({ activeInView: true, others: before.others });
  await page.keyboard.press('Home');
  expect(await activeItem(page)).toMatchObject({ level: 1 });
  const atHome = await scrolls();
  expect(atHome.tree).toBeLessThan(atEnd.tree);
  expect(atHome).toMatchObject({ activeInView: true, others: before.others });

  // And again, with the chunk loaded.
  await escapeInspector(page);
  await page.evaluate(() => {
    delete (window as unknown as { __dtTimes: Record<string, number> }).__dtTimes.treeFocus;
  });
  await openWithF2(page, cell, 'mounted');
  const reopen = await page.evaluate(() => {
    const t = (window as unknown as { __dtTimes: Record<string, number> }).__dtTimes;
    return t.treeFocus! - t.F2!;
  });

  const ms = {
    firstOpen: Math.round(firstOpen),
    reopen: Math.round(reopen),
    expandDom: Math.round(expand.dom),
    expandPainted: Math.round(expand.painted),
  };
  testInfo.annotations.push({ type: 'inspector ms', description: JSON.stringify(ms) });
  // Generous: measured at 270 ms to open the first time (in development,
  // where Vite compiles the panel's chunk on request), 20 ms after that,
  // and 2 ms to build a bucket's rows, 12 ms to paint them.
  expect(ms.firstOpen, 'F2 to a focused tree, the first time').toBeLessThanOrEqual(3_000);
  expect(ms.reopen, 'F2 to a focused tree, the chunk loaded').toBeLessThanOrEqual(1_000);
  expect(ms.expandPainted, '→ on a bucket to its 100 rows painted').toBeLessThanOrEqual(500);
  expect(errors).toEqual([]);
});

/**
 * Edge values: `edge` a struct of numbers JSON cannot hold or rounds, a
 * FLOAT, escaped text and a list; `m` a map whose keys JavaScript would
 * reorder or misread; `huge` 3,000 strings of 1,000 characters in row 1,
 * 9,000 in row 2.
 */
const EDGE_SELECT = `
  {'big': CAST(9007199254740993 AS BIGINT), 'neg': CAST('-9223372036854775808' AS BIGINT),
   'dec': CAST(1.50 AS DECIMAL(10, 2)), 'nan': CAST('NaN' AS DOUBLE), 'inf': CAST('inf' AS DOUBLE),
   'f': CAST(0.1 AS FLOAT), 'text': 'it''s "q"' || chr(10) || 'ünï', 'list': [1, 2, 3]} AS edge,
  MAP {'z': 1, 'a': 2, '__proto__': 3, 'size': 4, '2': 5, '1': 6} AS m,
  CASE WHEN i = 1 THEN list_transform(range(3000), j -> repeat('x', 1000))
       WHEN i = 2 THEN list_transform(range(9000), j -> repeat('y', 1000))
       ELSE ['small'] END AS huge`;

/** The characters of DuckDB's compact JSON for `n` strings of `length` characters. */
const jsonLength = (n: number, length: number) => n * (length + 2) + (n - 1) + 2;

function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test('Copy JSON puts the whole value on the clipboard as standard JSON, and says so', async ({
  page,
  context,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mountSqlTable(page, { rows: 20, select: EDGE_SELECT });
  await waitForFilledBody(page, ['edge', 'm', 'huge']);

  await test.step('numbers as DuckDB wrote them, NaN and Infinity as null', async () => {
    const dialog = await openWithF2(page, { row: 0, column: 'edge' }, 'mounted');
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click();
    const status = dialog.getByRole('status');
    await expect(status).toContainText('Copied');

    // Each field's own DuckDB text, a FLOAT and a DECIMAL as the double they
    // hold, and the clipboard parsed with every number's source text kept.
    const { want, got, lines } = await page.evaluate(async () => {
      const { bridge, state } = (window as unknown as NestedWindow).__dt;
      const [want] = await bridge.query<Record<string, unknown>>(
        `SELECT CAST(edge['big'] AS VARCHAR) AS big, CAST(edge['neg'] AS VARCHAR) AS neg,
           CAST(CAST(edge['dec'] AS DOUBLE) AS VARCHAR) AS dec,
           CAST(CAST(edge['f'] AS DOUBLE) AS VARCHAR) AS f,
           isnan(edge['nan']) AS nan, isinf(edge['inf']) AS inf, edge['text'] AS text,
           CAST(edge['list'] AS VARCHAR) AS list
         FROM "${state.tableName.get()}" WHERE "__rowid__" = 0`,
      );
      const text = await navigator.clipboard.readText();
      const parse = JSON.parse as (
        text: string,
        reviver: (key: string, value: unknown, context?: { source?: string }) => unknown,
      ) => unknown;
      const got = parse(text, (_key, value, context) => {
        if (typeof value !== 'number') return value;
        if (context?.source === undefined) throw new Error('JSON.parse gives no source text here');
        return { number: context.source };
      }) as Record<string, unknown>;
      return { want: want!, got, lines: text.split('\n') };
    });
    expect(want.nan).toBe(true);
    expect(want.inf).toBe(true);
    expect(got).toMatchObject({
      big: { number: want.big },
      neg: { number: want.neg },
      nan: null,
      inf: null,
      text: want.text,
      list: String(want.list)
        .slice(1, -1)
        .split(', ')
        .map((n) => ({ number: n })),
    });
    expect(Number((got.dec as { number: string }).number)).toBe(Number(want.dec));
    expect(Number((got.f as { number: string }).number)).toBe(Number(want.f));
    // Laid out as JSON.stringify(value, null, 2) lays it out.
    expect(lines.slice(0, 2)).toEqual(['{', `  "big": ${String(want.big)},`]);

    // The message is there for a while, not for good.
    await expect(status).not.toContainText('Copied', { timeout: 10_000 });

    // Ctrl/Cmd+C copies the active node: the list, the last field. The
    // click left focus on Copy JSON; the tree is the stop before it.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    expect(await activeItem(page)).toMatchObject({ label: 'list: [integer], 3 items' });
    await page.keyboard.press('ControlOrMeta+c');
    await expect(status).toContainText('Copied');
    expect(await readClipboard(page)).toBe(JSON.stringify([1, 2, 3], null, 2));
    await escapeInspector(page);
  });

  await test.step('a map as an object, its keys in the map’s order', async () => {
    const dialog = await openWithF2(page, { row: 0, column: 'm' }, 'mounted');
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Copied');
    const text = await readClipboard(page);
    const { keys, values } = await page.evaluate(async () => {
      const { bridge, state } = (window as unknown as NestedWindow).__dt;
      const [row] = await bridge.query<{ keys: string; values: string }>(
        `SELECT CAST(to_json(map_keys(m)) AS VARCHAR) AS keys,
           CAST(to_json(map_values(m)) AS VARCHAR) AS values
         FROM "${state.tableName.get()}" WHERE "__rowid__" = 0`,
      );
      return {
        keys: JSON.parse(row!.keys) as string[],
        values: (JSON.parse(row!.values) as number[]).map(String),
      };
    });
    // Read off the text: JSON.parse would put the keys "1" and "2" first.
    const entries = Array.from(text.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): (.*?),?$/gm), (m) => [
      JSON.parse(m[1]!) as string,
      m[2]!,
    ]);
    expect(entries).toEqual(keys.map((k, i) => [k, values[i]]));
    expect(text).toBe(
      `{\n${keys.map((k, i) => `  ${JSON.stringify(k)}: ${values[i]}`).join(',\n')}\n}`,
    );
    await escapeInspector(page);
  });

  await test.step('a value too long to show whole is shown in part, and copied whole', async () => {
    const dialog = await openWithF2(page, { row: 1, column: 'huge' }, 'mounted');
    const status = dialog.getByRole('status');
    await expect(status).toContainText(
      `Showing the first 2,097,152 of ${jsonLength(3000, 1000).toLocaleString('en-US')} characters`,
    );
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click();
    await expect(status).toContainText('Copied');
    const copied = await page.evaluate(async () => {
      const text = await navigator.clipboard.readText();
      const value = JSON.parse(text) as string[];
      return {
        items: value.length,
        same: value.every((s) => s === 'x'.repeat(1000)),
        laidOut: text === JSON.stringify(value, null, 2),
      };
    });
    expect(copied).toEqual({ items: 3000, same: true, laidOut: true });
    await escapeInspector(page);
  });

  await test.step('a value over 8 MiB of JSON is too large to copy, and copies nothing', async () => {
    const dialog = await openWithF2(page, { row: 2, column: 'huge' }, 'mounted');
    const status = dialog.getByRole('status');
    await expect(status).toContainText(
      `of ${jsonLength(9000, 1000).toLocaleString('en-US')} characters`,
    );
    await page.evaluate(() => navigator.clipboard.writeText('before the copy'));
    await dialog.getByRole('button', { name: 'Copy JSON', exact: true }).click();
    await expect(status).toContainText('Too large to copy');
    expect(await readClipboard(page)).toBe('before the copy');
    await escapeInspector(page);
  });

  expect(errors).toEqual([]);
});

test('closes when the cursor, the selection, the sort or the filters change, or on a press outside it; not on a press inside', async ({
  page,
}) => {
  const errors = watchConsoleErrors(page);
  await mountSqlTable(page, { rows: 50, select: STRUCT_SELECT });
  await waitForFilledBody(page, ['id', 's']);
  const cell = { row: 0, column: 's' };
  const act = (name: string, ...args: unknown[]) =>
    page.evaluate(
      ({ name, args }) => {
        const actions = (window as unknown as NestedWindow).__dt.actions as unknown as Record<
          string,
          (...a: unknown[]) => unknown
        >;
        actions[name]!(...args);
      },
      { name, args },
    );

  await test.step('presses inside it leave it open', async () => {
    const dialog = await openWithF2(page, cell, 'mounted');
    const box = (await dialog.boundingBox())!;
    // The title, the type badge, a tree item, a twisty, the footer's edge.
    await dialog.click({ position: { x: 24, y: 16 } });
    await dialog.click({ position: { x: box.width - 60, y: 16 } });
    await dialog.getByRole('treeitem', { name: S.alpha, exact: true }).click();
    expect(await activeItem(page)).toMatchObject({ label: S.alpha });
    const gamma = dialog.getByRole('treeitem', { name: S.gamma, exact: true });
    await gamma.locator('.dt-value-tree__twisty').click();
    await expect(gamma).toHaveAttribute('aria-expanded', 'false');
    // Measured again: the panel is shorter with gamma closed.
    const after = (await dialog.boundingBox())!;
    await dialog.click({ position: { x: 12, y: after.height - 6 } });
    await frames(page);
    await expect(inspectorOn(page, cell)).toBeVisible();
    // The cursor set again on the same cell is no move.
    await act('setFocusedCell', cell);
    await frames(page);
    await expect(inspectorOn(page, cell)).toBeVisible();
    await escapeInspector(page);
  });

  const changes: [string, () => Promise<unknown>][] = [
    ['the cursor moving to another cell', () => act('setFocusedCell', { row: 3, column: 's' })],
    ['the selection changing', () => act('selectRow', 4)],
    ['a sort', () => act('toggleSort', 'id')],
    ['a filter', () => act('addFilter', { type: 'range', column: 'id', min: 0, max: 40 })],
    ['a press on another cell', () => cellAt(page, { row: 2, column: 'id' }, 'mounted').click()],
    ['a press outside the table', () => pressOutside(page)],
  ];
  for (const [why, change] of changes) {
    await test.step(why, async () => {
      await openWithF2(page, cell, 'mounted');
      await frames(page);
      await change();
      await expect(anyDialog(page), `closed by ${why}`).toHaveCount(0);
    });
  }
  expect(errors).toEqual([]);
});

test('opening and closing it leaves the five tab stops as they were', async ({ page }) => {
  const errors = watchConsoleErrors(page);
  await installProbes(page);
  await mountSqlTable(page, { rows: 50, select: STRUCT_SELECT });
  await waitForFilledBody(page, ['id', 's']);
  const root = `#${NESTED_HOST_ID} .dt-root`;
  const census = () =>
    page.evaluate((root) => {
      const rootEl = document.querySelector(root)!;
      const inside = window.__dtA11y.tabbables().filter((el) => rootEl.contains(el));
      return {
        table: inside.filter((el) => !el.closest('[role="dialog"]')).map(window.__dtA11y.describe),
        dialog: inside.filter((el) => el.closest('[role="dialog"]')).length,
      };
    }, root);
  const before = await census();
  expect(before.table, before.table.join(', ')).toHaveLength(5);
  expect(before.dialog).toBe(0);

  const cell = { row: 0, column: 's' };
  const closings: [string, () => Promise<void>, () => Promise<void>][] = [
    [
      'F2, then Escape',
      () => openWithF2(page, cell, 'mounted').then(() => {}),
      () => page.keyboard.press('Escape'),
    ],
    [
      'a double click, then Close',
      async () => {
        await cellAt(page, cell, 'mounted').dblclick();
        await waitForTreeFocus(page);
      },
      () => inspectorOn(page, cell).getByRole('button', { name: 'Close', exact: true }).click(),
    ],
    [
      'the inspect icon, then ×',
      async () => {
        const target = cellAt(page, cell, 'mounted');
        const box = (await target.boundingBox())!;
        await target.click({ position: { x: box.width - 14, y: box.height / 2 } });
        await waitForTreeFocus(page);
      },
      () =>
        inspectorOn(page, cell)
          .getByRole('button', { name: 'Close value inspector', exact: true })
          .click(),
    ],
    [
      'F2, then a press outside the table',
      () => openWithF2(page, cell, 'mounted').then(() => {}),
      () => pressOutside(page),
    ],
  ];
  for (const [how, open, close] of closings) {
    await test.step(how, async () => {
      await open();
      await expect(inspectorOn(page, cell)).toBeVisible();
      // While it is open, the table's stops are as they were; the rest are the dialog's.
      const open_ = await census();
      expect(open_.table).toEqual(before.table);
      expect(open_.dialog).toBeGreaterThan(0);
      await close();
      await expect(anyDialog(page)).toHaveCount(0);
      expect(await census()).toEqual(before);
    });
  }
  expect(errors).toEqual([]);
});

/** What {@link holdRows} leaves on `window`. */
type HoldWindow = NestedWindow & {
  __dtHold?: { pattern: string; gate: Promise<void> | null; release: () => void; held: number };
};

/**
 * Hold every body row fetch of the block of rows `from` to `to` (a fetch by
 * `__rowid__` range, as an unsorted, unfiltered table fetches) until
 * {@link releaseRows}: the rows stay placeholders, loading, for as long as a
 * test needs them to.
 */
async function holdRows(page: Page, from: number, to: number): Promise<void> {
  await page.evaluate(
    ({ from, to }) => {
      const w = window as unknown as HoldWindow;
      const bridge = w.__dt.bridge;
      if (!w.__dtHold) {
        const query = bridge.query.bind(bridge) as (...a: unknown[]) => Promise<unknown>;
        const hold: NonNullable<HoldWindow['__dtHold']> = {
          pattern: '',
          gate: null,
          release: () => {},
          held: 0,
        };
        w.__dtHold = hold;
        bridge.query = (async (sql: string, ...rest: unknown[]) => {
          if (hold.gate && sql.includes(hold.pattern)) {
            hold.held++;
            await hold.gate;
          }
          return query(sql, ...rest);
        }) as typeof bridge.query;
      }
      const hold = w.__dtHold;
      hold.pattern = `"__rowid__" >= ${from} AND "__rowid__" < ${to}`;
      hold.held = 0;
      hold.gate = new Promise<void>((resolve) => {
        hold.release = () => {
          hold.gate = null;
          resolve();
        };
      });
    },
    { from, to },
  );
}

/** Let the fetches {@link holdRows} held go; how many there were. */
function releaseRows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hold = (window as unknown as HoldWindow).__dtHold!;
    const held = hold.held;
    hold.release();
    return held;
  });
}

/** Wait until no body row is a placeholder: every row in view has its data. */
async function waitForRows(page: Page): Promise<void> {
  await page.waitForFunction(
    (hostId) => document.querySelectorAll(`#${hostId} .dt-body [data-placeholder]`).length === 0,
    NESTED_HOST_ID,
  );
}

/**
 * Scroll far down in jumps, through more blocks than the row cache holds
 * (2,048 rows, 16 blocks of 128), each jump waited out: the first block, the
 * furthest from the view, goes first. The grid keeps focus and the cursor.
 */
async function evictFirstBlock(page: Page): Promise<void> {
  const scroller = `#${NESTED_HOST_ID} .dt-body-scroll`;
  for (let k = 1; k <= 24; k++) {
    await page.evaluate(
      ({ scroller, top }) => {
        document.querySelector(scroller)!.scrollTop = top;
      },
      { scroller, top: k * 25_000 },
    );
    await waitForRows(page);
  }
}

test('F2 on a cell whose row is still loading opens the inspector once the row is there', async ({
  page,
}) => {
  // F2 used to find the row a placeholder, and do nothing. Its fetch is held
  // at the bridge here, so the row is still loading when F2 comes, however
  // fast the machine; that something was held shows it was.
  const errors = watchConsoleErrors(page);
  const ROWS = 20_000;
  await mountSqlTable(page, { rows: ROWS, select: `[CAST(i AS INTEGER), 2, 3] AS l` });
  await waitForFilledBody(page, ['l']);
  await page.locator(`#${NESTED_HOST_ID} .dt-grid`).focus();
  const last = { row: ROWS - 1, column: 'l' };
  const fifth = { row: 5, column: 'l' };

  await test.step('Ctrl+End, then F2 at once: the last row', async () => {
    // `l` is the last column, where Ctrl+End puts the cursor. The last block
    // is cut short at the last row.
    const block = Math.floor(last.row / 128) * 128;
    await holdRows(page, block, Math.min(block + 128, ROWS));
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('F2');
    await frames(page);
    expect((await cursorDom(page, 'mounted')).focusedCell).toEqual(last);
    await expect(anyDialog(page), 'open before the row loaded').toHaveCount(0);
    expect(await releaseRows(page), 'fetches held for the last block').toBeGreaterThan(0);
    await expect(inspectorOn(page, last)).toBeVisible();
    await waitForTreeFocus(page);
    await escapeInspector(page);
  });

  await test.step('a row that has left the row cache', async () => {
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < fifth.row; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    expect((await cursorDom(page, 'mounted')).focusedCell).toEqual(fifth);
    await evictFirstBlock(page);
    await holdRows(page, 0, 128);
    // F2 brings the cursor's row back into view, to load.
    await page.keyboard.press('F2');
    await frames(page);
    await expect(anyDialog(page), 'open before the row loaded').toHaveCount(0);
    expect(await releaseRows(page), 'fetches held for the first block').toBeGreaterThan(0);
    await expect(inspectorOn(page, fifth)).toBeVisible();
    await waitForTreeFocus(page);
    await escapeInspector(page);
  });

  await test.step('the cursor moving on before the row loads: nothing opens', async () => {
    await evictFirstBlock(page);
    await holdRows(page, 0, 128);
    await page.keyboard.press('F2');
    await page.keyboard.press('ArrowDown');
    expect(await releaseRows(page), 'fetches held for the first block').toBeGreaterThan(0);
    await waitForRows(page);
    await frames(page);
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await cursorDom(page, 'mounted')).toEqual({
      focusedCell: { row: 6, column: 'l' },
      gridFocused: true,
      activeDescendant: { row: 6, column: 'l' },
    });
  });
  expect(errors).toEqual([]);
});
