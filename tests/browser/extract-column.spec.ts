/**
 * "Extract field → column": a nested or JSON column's header button opens a
 * panel that adds one part of the column as a column of its own, and the
 * value inspector adds one from the value it shows. Both go through
 * `TableContainer.extractColumn`: the column lands right after its source,
 * as one undo entry, and the cursor, the view and the live region follow it.
 *
 * jsdom runs the panel's logic and the container's wiring on synthetic
 * events. What these add: a real keyboard, through F2's control cycle onto
 * the button and through the panel's tree and fields; sequential focus, for
 * the tab-stop census; focus coming back through a table that re-renders
 * under the panel; the undo keys; the new column's histogram, painted, and a
 * brush on it that DuckDB counts the same; and, on the fixture, the JSON
 * extension the Parquet loader has to load.
 *
 * What a new column should hold comes from DuckDB: the expression the panel
 * showed for it, read beside the column in one query, row by row. Each test
 * also fails on any console error.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { NESTED_EXAMPLE, loadExample, openDemo } from './helpers/demo';
import {
  brush,
  brushCounts,
  columnAgainstExpression,
  extractButton,
  extractPanel,
  openExtractPanel,
  panelState,
} from './helpers/extract';
import {
  activeItem,
  anyDialog,
  cursorDom,
  escapeInspector,
  frames,
  inspectorOn,
  openWithF2,
  tableRoot,
} from './helpers/inspector';
import {
  NESTED_HOST_ID,
  type NestedWindow,
  WIDE_ROWS,
  WIDE_SELECT,
  expectedCellTexts,
  mountSqlTable,
  scrollToColumn,
  unpaintedCharts,
  waitForFilledBody,
  watchConsoleErrors,
} from './helpers/nested';
import { SQL_ONLY_COLUMNS } from '../helpers/nestedSql';

/** The nested fixture's row of readable values (`SHOWCASE.DEMO`). */
const DEMO_ROW = 10;

/** The fixture's columns, in file order, as its manifest records them. */
const FIXTURE_COLUMNS = (
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../fixtures/datasets/nested-stress-tests.manifest.json', import.meta.url),
      ),
      'utf8',
    ),
  ) as { parquet: { columns: { name: string; kind: string }[] } }
).parquet.columns;

type DemoWindow = { __dtDemo: { table: NestedWindow['__dt'] } };

/** The demo table's visible columns, in order. */
function visibleColumns(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as DemoWindow).__dtDemo.table.state.visibleColumns.get(),
  ]);
}

/** The table's live region for one-off announcements, as "Column point_x added". */
function announced(page: Page, root: string) {
  return page.locator(`${root} .dt-announce`);
}

/** Tab stops inside `.dt-root`: the table's own, and how many are inside an open dialog. */
function census(page: Page, root: string) {
  return page.evaluate((root) => {
    const rootEl = document.querySelector(root)!;
    const inside = window.__dtA11y.tabbables().filter((el) => rootEl.contains(el));
    return {
      table: inside.filter((el) => !el.closest('[role="dialog"]')).map(window.__dtA11y.describe),
      dialog: inside.filter((el) => el.closest('[role="dialog"]')).length,
    };
  }, `${root} .dt-root`);
}

/**
 * Record each header the table flashes, as it flashes a newly shown
 * column's: the columns, in the order their headers got the class.
 */
async function recordFlashes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __dtFlashed: string[] };
    w.__dtFlashed = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (el.classList.contains('dt-col-header--restored')) {
          w.__dtFlashed.push(el.getAttribute('data-column') ?? '?');
        }
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

function flashed(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __dtFlashed: string[] }).__dtFlashed);
}

test('the extract button is on exactly the nested and JSON headers, and the keyboard reaches it', async ({
  page,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const root = tableRoot('demo');

  await test.step('on exactly the lists, structs, maps and JSON', async () => {
    // A header far from the view is a shell, without its buttons: go along
    // the table, reading every header whose buttons are there.
    const seen = new Map<string, boolean>();
    for (const { name } of FIXTURE_COLUMNS) {
      if (seen.has(name)) continue;
      await scrollToColumn(page, name, root);
      await expect(
        page.getByRole('button', { name: `Sort by ${name}`, exact: true }),
      ).toBeVisible();
      const mounted = await page.evaluate((root) => {
        return Array.from(
          document.querySelectorAll(`${root} .dt-col-header[data-column]`),
          (h) =>
            [
              h.getAttribute('data-column')!,
              !!h.querySelector('.dt-col-sort-btn'),
              !!h.querySelector('.dt-col-extract-btn'),
            ] as const,
        );
      }, root);
      for (const [column, controls, extract] of mounted) {
        if (controls) seen.set(column, extract);
      }
    }
    expect(Object.fromEntries(seen)).toEqual(
      Object.fromEntries(FIXTURE_COLUMNS.map((c) => [c.name, c.kind !== 'scalar'])),
    );
  });

  const button = extractButton(page, 'tags');
  await scrollToColumn(page, 'id', root);
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  // Reached by F2 and the arrow keys, not by Tab.
  await expect(button).toHaveAttribute('tabindex', '-1');
  const before = await census(page, root);
  expect(before.table, before.table.join(', ')).toHaveLength(5);

  await test.step('F2 on the header, the arrow keys to the button, Enter', async () => {
    await page.locator(`${root} .dt-grid`).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowUp');
    // id, label, notes, raw_blob, tags.
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    expect((await cursorDom(page, 'demo')).focusedCell).toEqual({ row: -1, column: 'tags' });
    await page.keyboard.press('F2');
    const visited: string[] = [];
    for (let i = 0; i < 6; i++) {
      const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      visited.push(name ?? '');
      if (name === 'Extract from tags') break;
      await page.keyboard.press('ArrowRight');
    }
    expect(visited).toEqual(['Pin tags', 'Hide tags', 'Filter tags', 'Extract from tags']);
    await page.keyboard.press('Enter');
    const panel = extractPanel(page, 'tags');
    await expect(panel).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await activeItem(page)).toMatchObject({ label: 'length', level: 1 });
  });

  await test.step('while it is open, every stop the table gains is the panel’s', async () => {
    const open = await census(page, root);
    expect(open.table).toEqual(before.table);
    expect(open.dialog).toBeGreaterThan(0);
  });

  await test.step('Escape: closed, focus back on the button', async () => {
    await page.keyboard.press('Escape');
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    expect(await census(page, root)).toEqual(before);
    // And Escape again leaves the header's buttons for the grid.
    await page.keyboard.press('Escape');
    await expect(page.locator(`${root} .dt-grid`)).toBeFocused();
    expect(await census(page, root)).toEqual(before);
  });
  expect(errors).toEqual([]);
});

test('the panel by keyboard: a struct’s fields, a list’s position, a map’s key', async ({
  page,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);

  await test.step('nested_struct › owner › contact › email, the name following', async () => {
    const panel = await openExtractPanel(page, 'nested_struct', 'demo');
    await expect(
      panel.getByRole('tree', { name: 'Parts of nested_struct', exact: true }),
    ).toBeVisible();
    const steps: [string, Record<string, unknown>, string][] = [
      [
        '',
        { label: 'owner: struct(2)', level: 1, posinset: 1, setsize: 2, expanded: false },
        'nested_struct_owner',
      ],
      ['ArrowRight', { label: 'owner: struct(2)', expanded: true }, 'nested_struct_owner'],
      [
        'ArrowDown',
        { label: 'name: varchar', level: 2, posinset: 1, setsize: 2 },
        'nested_struct_owner_name',
      ],
      [
        'ArrowDown',
        { label: 'contact: struct(3)', level: 2, posinset: 2, expanded: false },
        'nested_struct_owner_contact',
      ],
      [
        'ArrowRight',
        { label: 'contact: struct(3)', expanded: true },
        'nested_struct_owner_contact',
      ],
      [
        'ArrowDown',
        { label: 'email: varchar', level: 3, posinset: 1, setsize: 3 },
        'nested_struct_owner_contact_email',
      ],
      ['ArrowLeft', { label: 'contact: struct(3)', level: 2 }, 'nested_struct_owner_contact'],
      ['ArrowDown', { label: 'email: varchar', level: 3 }, 'nested_struct_owner_contact_email'],
    ];
    for (const [key, item, name] of steps) {
      if (key) await page.keyboard.press(key);
      expect(await activeItem(page), `after ${key}`).toMatchObject(item);
      expect((await panelState(panel)).name, `the name after ${key}`).toBe(name);
    }
    expect(await panelState(panel)).toEqual({
      name: 'nested_struct_owner_contact_email',
      expression: `"nested_struct"['owner']['contact']['email']`,
      error: null,
      canAdd: true,
    });
    await page.keyboard.press('Escape');
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(extractButton(page, 'nested_struct')).toBeFocused();
    await expect(extractButton(page, 'nested_struct')).toHaveAttribute('aria-expanded', 'false');
  });

  await test.step('people › element › name: the element’s position, 1 at first', async () => {
    const panel = await openExtractPanel(page, 'people', 'demo');
    expect(await activeItem(page)).toMatchObject({ label: 'length', level: 1 });
    expect(await panelState(panel)).toMatchObject({
      name: 'people_length',
      expression: 'len("people")',
    });
    // The element starts open: its fields are next.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await activeItem(page)).toMatchObject({ label: 'name: varchar', level: 2 });
    const position = panel.getByRole('spinbutton', { name: 'Position in people', exact: true });
    await expect(position).toHaveValue('1');
    expect(await panelState(panel)).toEqual({
      name: 'people_1_name',
      expression: `"people"[1]['name']`,
      error: null,
      canAdd: true,
    });
    // Tab goes on from the tree to the position.
    await page.keyboard.press('Tab');
    await expect(position).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('2');
    expect(await panelState(panel)).toMatchObject({
      name: 'people_2_name',
      expression: `"people"[2]['name']`,
      canAdd: true,
    });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('0');
    expect(await panelState(panel)).toMatchObject({
      error: 'Enter a whole number, 1 or more',
      canAdd: false,
    });
    await expect(position).toHaveAttribute('aria-invalid', 'true');
    await expect(position).toHaveAccessibleDescription('Enter a whole number, 1 or more');
    await page.keyboard.press('Escape');
    await expect(extractButton(page, 'people')).toBeFocused();
  });

  await test.step('attrs › value: the map key, asked for', async () => {
    const panel = await openExtractPanel(page, 'attrs', 'demo');
    expect(await activeItem(page)).toMatchObject({ label: 'size', level: 1 });
    expect(await panelState(panel)).toMatchObject({
      name: 'attrs_size',
      expression: 'cardinality("attrs")',
    });
    await page.keyboard.press('ArrowDown');
    expect(await activeItem(page)).toMatchObject({ label: 'value: integer', level: 1 });
    const key = panel.getByRole('textbox', { name: 'Key in attrs', exact: true });
    await expect(key).toHaveValue('');
    await expect(key).toHaveAttribute('aria-required', 'true');
    // Empty, not yet wrong: the error says what to type, and the field is
    // marked once Enter finds it still empty.
    await expect(key).not.toHaveAttribute('aria-invalid');
    expect(await panelState(panel)).toMatchObject({ error: 'Enter a key', canAdd: false });
    await page.keyboard.press('Tab');
    await expect(key).toBeFocused();
    await expect(key).toHaveAccessibleDescription('Enter a key');
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(panel).toBeVisible();
    await page.keyboard.type('width');
    await expect(key).not.toHaveAttribute('aria-invalid');
    expect(await panelState(panel)).toEqual({
      name: 'attrs_width',
      expression: `map_extract_value("attrs", 'width')`,
      error: null,
      canAdd: true,
    });
    await page.keyboard.press('Escape');
    await expect(extractButton(page, 'attrs')).toBeFocused();
  });
  expect(errors).toEqual([]);
});

test('a JSON column’s panel takes a path, says where a bad one goes wrong, and refuses a name taken in another case', async ({
  page,
}) => {
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const panel = await openExtractPanel(page, 'doc', 'demo');
  // No tree to pick from: the path goes straight into the column.
  await expect(panel.getByRole('tree')).toHaveCount(0);
  const path = panel.getByRole('textbox', { name: 'JSON path', exact: true });
  await expect(path).toBeFocused();
  expect(await panelState(panel)).toMatchObject({
    name: 'doc_string',
    expression: `json_extract_string("doc", '$')`,
    canAdd: true,
  });

  await page.keyboard.type('$["a.b"]');
  await panel
    .getByRole('combobox', { name: 'Read as', exact: true })
    .selectOption({ label: 'Number' });
  expect(await panelState(panel)).toEqual({
    name: 'doc_a_b',
    expression: `TRY_CAST(json_extract_string("doc", '$."a.b"') AS DOUBLE)`,
    error: null,
    canAdd: true,
  });

  await path.fill('$.a.');
  expect(await panelState(panel)).toMatchObject({
    expression: '',
    error: 'Not a JSON path: check character 5',
    canAdd: false,
  });
  await expect(path).toHaveAttribute('aria-invalid', 'true');
  await expect(path).toHaveAccessibleDescription(/Not a JSON path: check character 5$/);
  await expect(panel.getByRole('button', { name: 'Add column', exact: true })).toBeDisabled();

  await path.fill('$.score');
  const name = panel.getByRole('textbox', { name: 'Column name', exact: true });
  await name.fill('ID');
  expect(await panelState(panel)).toMatchObject({
    expression: `TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)`,
    error: 'A column named "id" already exists',
    canAdd: false,
  });
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription('A column named "id" already exists');
  await name.fill('score');
  expect(await panelState(panel)).toMatchObject({ name: 'score', error: null, canAdd: true });

  await page.keyboard.press('Escape');
  await expect(anyDialog(page)).toHaveCount(0);
  await expect(extractButton(page, 'doc')).toBeFocused();
  expect(errors).toEqual([]);
});

test('added from the panel: after its source, what its expression reads, the cursor on its header, announced, one undo entry each way', async ({
  page,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const root = tableRoot('demo');
  await recordFlashes(page);

  let expression = '';
  await test.step('point › x, by Enter on it', async () => {
    const panel = await openExtractPanel(page, 'point', 'demo');
    expect(await activeItem(page)).toMatchObject({ label: 'x: double' });
    const state = await panelState(panel);
    expect(state).toMatchObject({ name: 'point_x', canAdd: true });
    expression = state.expression;
    // Enter on an end node of the tree adds the column.
    await page.keyboard.press('Enter');
    await expect(anyDialog(page)).toHaveCount(0);
    await expect.poll(() => visibleColumns(page)).toContain('point_x');
    const order = await visibleColumns(page);
    expect(order.slice(order.indexOf('point'), order.indexOf('point') + 2)).toEqual([
      'point',
      'point_x',
    ]);
    await expect(announced(page, root)).toHaveText('Column point_x added');
    expect(await cursorDom(page, 'demo')).toEqual({
      focusedCell: { row: -1, column: 'point_x' },
      gridFocused: true,
      activeDescendant: { row: -1, column: 'point_x' },
    });
    expect(await flashed(page)).toContain('point_x');
    await expect(page.locator(`${root} .dt-col-header[data-column="point_x"]`)).toBeInViewport();
  });

  await test.step('its values are what its expression reads', async () => {
    expect(expression).toBe(`"point"['x']`);
    // Every seventh row, and the showcase rows, NULLs among them.
    const check = await columnAgainstExpression(
      page,
      'demo',
      'point_x',
      expression,
      '"__rowid__" < 12 OR "__rowid__" % 7 = 0',
    );
    expect(check.wrong).toEqual([]);
    expect(check.compared).toBeGreaterThan(140);
    expect(check.nulls).toBeGreaterThan(0);
  });

  await test.step('point › y after it: point, point_x, point_y', async () => {
    const panel = await openExtractPanel(page, 'point', 'demo');
    await page.keyboard.press('ArrowDown');
    expect(await activeItem(page)).toMatchObject({ label: 'y: double' });
    await panel.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect.poll(() => visibleColumns(page)).toContain('point_y');
    const order = await visibleColumns(page);
    expect(order.slice(order.indexOf('point'), order.indexOf('point') + 3)).toEqual([
      'point',
      'point_x',
      'point_y',
    ]);
    await expect(announced(page, root)).toHaveText('Column point_y added');
    await expect(page.locator(`${root} .dt-grid`)).toBeFocused();
  });

  await test.step('Ctrl/Cmd+Z takes point_y away, Ctrl/Cmd+Shift+Z brings it back', async () => {
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => visibleColumns(page)).not.toContain('point_y');
    expect(await visibleColumns(page)).toContain('point_x');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => visibleColumns(page)).toContain('point_y');
    const order = await visibleColumns(page);
    expect(order.slice(order.indexOf('point'), order.indexOf('point') + 3)).toEqual([
      'point',
      'point_x',
      'point_y',
    ]);
  });

  await test.step('point_x has a histogram, and a brush on it counts what SQL counts', async () => {
    await scrollToColumn(page, 'point_x', root);
    await expect.poll(() => unpaintedCharts(page, ['point_x'], root)).toEqual([]);
    await brush(page, 'point_x', 'demo');
    await expect
      .poll(async () => {
        const { shown, sql } = await brushCounts(page, 'demo', 'point_x', `"point"['x']`);
        return shown === sql ? 'the same' : `shown ${shown}, SQL ${sql}`;
      })
      .toBe('the same');
    const { sql, total } = await brushCounts(page, 'demo', 'point_x', `"point"['x']`);
    expect(sql).toBeGreaterThan(0);
    expect(sql).toBeLessThan(total);
  });
  expect(errors).toEqual([]);
});

test('added from the value inspector: a field, a length, a size, a union’s tag, by button, “+” and Ctrl/Cmd+Enter', async ({
  page,
}) => {
  test.slow();
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const root = tableRoot('demo');

  /** After an add from the inspector: `name` right after `after`, announced, the cursor on the same row in it. */
  const expectAdded = async (name: string, after: string) => {
    await expect(anyDialog(page)).toHaveCount(0);
    await expect.poll(() => visibleColumns(page)).toContain(name);
    const order = await visibleColumns(page);
    expect(order[order.indexOf(name) - 1], `${name} comes right after ${after}`).toBe(after);
    await expect(announced(page, root)).toHaveText(`Column ${name} added`);
    // The cell's element comes with the new column's data, a fetch later:
    // aria-activedescendant names it once it is there.
    await expect
      .poll(() => cursorDom(page, 'demo'))
      .toEqual({
        focusedCell: { row: DEMO_ROW, column: name },
        gridFocused: true,
        activeDescendant: { row: DEMO_ROW, column: name },
      });
  };

  await test.step('Add as column, on a struct field', async () => {
    const dialog = await openWithF2(page, { row: DEMO_ROW, column: 'point' }, 'demo');
    // The root offers nothing; its last field, tier, its value.
    await expect(dialog.getByRole('button', { name: /^Add/ })).toHaveCount(0);
    await page.keyboard.press('End');
    expect(await activeItem(page)).toMatchObject({ label: 'tier: "gold"' });
    await expect(dialog.getByRole('button', { name: /^Add/ })).toHaveText(['Add as column']);
    await dialog.getByRole('button', { name: 'Add as column', exact: true }).click();
    await expectAdded('point_tier', 'point');
    expect(
      await columnAgainstExpression(page, 'demo', 'point_tier', `"point"['tier']`, 'true'),
    ).toMatchObject({ compared: 1000, wrong: [] });
  });

  await test.step('the “+” a row shows under the pointer', async () => {
    const dialog = await openWithF2(page, { row: DEMO_ROW, column: 'point' }, 'demo');
    const x = dialog.getByRole('treeitem', { name: 'x: 1.5', exact: true });
    const plus = x.locator('.dt-value-tree__add');
    await expect(plus).toBeHidden();
    await x.hover();
    await expect(plus).toBeVisible();
    await expect(plus).toHaveAttribute('title', 'Add as column');
    await plus.click();
    // After the column already taken from point.
    await expectAdded('point_x', 'point_tier');
  });

  await test.step('Add length as column, on a list', async () => {
    const dialog = await openWithF2(page, { row: DEMO_ROW, column: 'tags' }, 'demo');
    await dialog.getByRole('button', { name: 'Add length as column', exact: true }).click();
    await expectAdded('tags_length', 'tags');
    expect(
      await columnAgainstExpression(page, 'demo', 'tags_length', 'len("tags")', 'true'),
    ).toMatchObject({ compared: 1000, wrong: [] });
  });

  await test.step('Add size as column, on a map', async () => {
    const dialog = await openWithF2(page, { row: DEMO_ROW, column: 'attrs' }, 'demo');
    await dialog.getByRole('button', { name: 'Add size as column', exact: true }).click();
    await expectAdded('attrs_size', 'attrs');
    expect(
      await columnAgainstExpression(page, 'demo', 'attrs_size', 'cardinality("attrs")', 'true'),
    ).toMatchObject({ compared: 1000, wrong: [] });
  });

  await test.step('Ctrl/Cmd+Enter on a map entry', async () => {
    await openWithF2(page, { row: DEMO_ROW, column: 'attrs' }, 'demo');
    await page.keyboard.press('ArrowDown');
    expect(await activeItem(page)).toMatchObject({ label: 'width: 12' });
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectAdded('attrs_width', 'attrs_size');
    expect(
      await columnAgainstExpression(page, 'demo', 'attrs_width', `"attrs"['width']`, 'true'),
    ).toMatchObject({ compared: 1000, wrong: [] });
  });

  await test.step('Add tag as column, on a UNION', async () => {
    // A UNION comes from SQL only: one of nestedSql.ts's, over the fixture's id.
    const union = SQL_ONLY_COLUMNS.find((c) => c.name === 'union_pair')!;
    const added = await page.evaluate(
      (expression) =>
        (window as unknown as DemoWindow).__dtDemo.table.actions.addDerivedColumn({
          kind: 'expression',
          name: 'union_pair',
          expression,
        }),
      union.sql('"id"'),
    );
    expect(added.success).toBe(true);
    const dialog = await openWithF2(page, { row: DEMO_ROW, column: 'union_pair' }, 'demo');
    expect(await activeItem(page)).toMatchObject({ label: 'union_pair: union(2), {i: 0}' });
    await dialog.getByRole('button', { name: 'Add tag as column', exact: true }).click();
    await expectAdded('union_pair_tag', 'union_pair');
    const check = await columnAgainstExpression(
      page,
      'demo',
      'union_pair_tag',
      'union_tag("union_pair")',
      'true',
    );
    expect(check).toMatchObject({ compared: 1000, wrong: [] });
    expect(check.nulls).toBeGreaterThan(0);
  });
  expect(errors).toEqual([]);
});

test('with derivedColumns off, no header offers an extract, and the inspector adds nothing', async ({
  page,
}) => {
  const errors = watchConsoleErrors(page);
  await mountSqlTable(page, {
    rows: 50,
    derivedColumns: false,
    select: `{'x': CAST(i AS DOUBLE), 'tier': 'gold'} AS s, [CAST(i AS INTEGER), 2] AS l,
      MAP {'k': CAST(i AS INTEGER)} AS m, CAST('{"a": 1}' AS JSON) AS doc`,
  });
  await waitForFilledBody(page, ['s', 'l', 'm', 'doc']);
  // The headers have their buttons, all but the extract one.
  for (const column of ['s', 'l', 'm', 'doc']) {
    await expect(page.getByRole('button', { name: `Filter ${column}`, exact: true })).toBeVisible();
  }
  await expect(page.locator('.dt-col-extract-btn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Extract from/ })).toHaveCount(0);

  const schema = () =>
    page.evaluate(() =>
      (window as unknown as NestedWindow).__dt.state.schema.get().map((c) => c.name),
    );
  const columns = await schema();
  const dialog = await openWithF2(page, { row: 3, column: 's' }, 'mounted');
  await page.keyboard.press('ArrowDown');
  expect(await activeItem(page)).toMatchObject({ label: 'x: 3.0' });
  await expect(dialog.getByRole('button')).toHaveText(['', 'Copy JSON', 'Close']);
  await expect(dialog.locator('.dt-value-tree__add')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Enter');
  await frames(page);
  await expect(inspectorOn(page, { row: 3, column: 's' })).toBeVisible();
  expect(await schema()).toEqual(columns);
  await escapeInspector(page);
  expect(errors).toEqual([]);
});

test(`on ${WIDE_ROWS.toLocaleString('en-US')} rows × 46 columns, a struct field extracted gets a histogram, and a brush DuckDB counts the same`, async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchConsoleErrors(page);
  await mountSqlTable(page, { rows: WIDE_ROWS, select: WIDE_SELECT, visualizations: true });
  await waitForFilledBody(page, ['id']);
  const root = tableRoot('mounted');

  const panel = await openExtractPanel(page, 'point', 'mounted');
  expect(await activeItem(page)).toMatchObject({ label: 'rid: integer' });
  await page.keyboard.press('ArrowDown');
  expect(await activeItem(page)).toMatchObject({ label: 'x: double' });
  expect(await panelState(panel)).toMatchObject({ name: 'point_x', expression: `"point"['x']` });
  const added = Date.now();
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => [...(window as unknown as NestedWindow).__dt.state.visibleColumns.get()]),
    )
    .toContain('point_x');
  const shown = Date.now() - added;
  await expect.poll(() => unpaintedCharts(page, ['point_x'], root)).toEqual([]);
  const painted = Date.now() - added;
  testInfo.annotations.push({
    type: 'extract ms',
    description: JSON.stringify({ columnShown: shown, chartPainted: painted }),
  });

  const check = await columnAgainstExpression(
    page,
    'mounted',
    'point_x',
    `"point"['x']`,
    '"__rowid__" % 9973 = 0',
  );
  expect(check.wrong).toEqual([]);
  expect(check.compared).toBe(Math.ceil(WIDE_ROWS / 9973));

  await brush(page, 'point_x', 'mounted');
  await expect
    .poll(async () => {
      const { shown, sql } = await brushCounts(page, 'mounted', 'point_x', `"point"['x']`);
      return shown === sql ? 'the same' : `shown ${shown}, SQL ${sql}`;
    })
    .toBe('the same');
  const { sql, total } = await brushCounts(page, 'mounted', 'point_x', `"point"['x']`);
  expect(total).toBe(WIDE_ROWS);
  expect(sql).toBeGreaterThan(0);
  expect(sql).toBeLessThan(total);
  // The cursor is on the header, and the body's rows are all there.
  expect((await cursorDom(page, 'mounted')).focusedCell).toEqual({ row: -1, column: 'point_x' });
  await expect(page.locator(`#${NESTED_HOST_ID} .dt-body [data-placeholder]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('json_list shows a JSON null as null as soon as the fixture loads', async ({ page }) => {
  // Read before anything else could load DuckDB's JSON extension: no
  // inspector, no export, no exact read. The Parquet loader loads it for a
  // table that holds JSON; without it, row 2 read `[1, NULL, 'null']`.
  const errors = watchConsoleErrors(page);
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  const root = tableRoot('demo');
  await scrollToColumn(page, 'json_list', root);
  const body = await waitForFilledBody(page, ['json_list'], root);
  expect(body.cells['2']!.json_list).toBe('[1, NULL, null]');
  // And it is DuckDB's text for the value.
  const expected = await expectedCellTexts(page, ['json_list'], ['2'], 'demo');
  expect(expected['2']!.json_list).toBe('[1, NULL, null]');
  expect(errors).toEqual([]);
});
