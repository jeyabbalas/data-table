/**
 * List and struct columns load, and show as text, wherever the view is.
 *
 * Arrow returns a list value as a `Vector`, which the worker could not post
 * to the main thread: every row fetch selecting a list column failed to
 * clone, and the error reply, which carried the `DataCloneError`'s numeric
 * code, left the fetch pending for good. On a wide table, a yank of the
 * horizontal scrollbar to the list columns at the far right blanked every
 * body cell; a JSON file with an array field in its first screen never
 * finished loading. Struct cells showed `[object Object]`.
 *
 * The grid now reads a nested value as bounded DuckDB text: a list past 32
 * items, or a map past 32 entries, shows its first 32 and how many more
 * there are. A long list in jsdom is only a string a test made up; here it
 * comes out of DuckDB, through the worker, into a real cell.
 *
 * Each test builds its table in-page, from generated JSON as
 * `helpers/table.ts` does from CSV, or in DuckDB from SQL, so every cell is a
 * pure function of its row. What a nested cell should show comes from DuckDB
 * itself, through the table's bridge (`helpers/nested.ts`).
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  NESTED_HOST_ID,
  PREVIEW_ITEMS,
  type NestedWindow,
  expectedCellTexts,
  mountSqlTable,
  unpaintedCharts,
  waitForFilledBody,
  watchConsoleErrors,
  wrongCells,
} from './helpers/nested';

const ROW_HEIGHT = 32;
const BLOCK_ROWS = 128;

interface MountOptions {
  /** Scalar columns before the nested ones, `c000`… Default 0. */
  scalarColumns?: number;
  rows: number;
  /** The table's columns are these, after the scalar ones, for every row `r`. */
  nested: 'lists-and-structs' | 'months-and-days';
}

/**
 * The value of each nested column for row `r`; `tags` and `point` are what
 * the wide test file's `c0976_list` and `c0051_struct` hold.
 */
function nestedRow(r: number, kind: MountOptions['nested']): Record<string, unknown> {
  if (kind === 'months-and-days') return { id: r, months: (r % 12) + 1, days: (r % 28) + 1 };
  return {
    tags: Array.from({ length: r % 4 }, (_, j) => (r * 7 + j * 13) % 100),
    labels: r % 5 === 0 ? null : [`a${r % 3}`, 'b'],
    point: { x: r / 4, y: (r % 8) / 8, tier: ['gold', 'silver', 'bronze'][r % 3] },
  };
}

/**
 * Create a table in a fixed host and load the generated JSON. Resolves with
 * whether `loadData` resolved within 30 s: it used to hang.
 */
async function mountJson(page: Page, options: MountOptions): Promise<'loaded' | 'timed out'> {
  await page.goto('./');
  const rows = Array.from({ length: options.rows }, (_, r) => {
    const row: Record<string, unknown> = {};
    const scalars = options.scalarColumns ?? 0;
    for (let i = 0; i < scalars; i++) {
      row[`c${String(i).padStart(3, '0')}`] =
        i % 3 === 1 ? `k${(r + i) % 7}` : (r * 31 + i * 17) % 1000;
    }
    return { ...row, ...nestedRow(r, options.nested) };
  });
  return page.evaluate(
    async ({ hostId, json }) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText =
        'position: fixed; left: 0; top: 0; width: 1200px; height: 600px; z-index: 1; background: white;';
      document.body.appendChild(host);
      const table = await mod.createDataTable({
        container: host,
        tableName: 'nested',
        // No IndexedDB: a restored session would make this a different test.
        persistence: false,
        visualizations: false,
      });
      (window as unknown as NestedWindow).__dt = table;
      const file = new File([json], 'nested.json', { type: 'application/json' });
      return Promise.race([
        table.loadData(file).then(() => 'loaded' as const),
        new Promise<'timed out'>((resolve) => setTimeout(() => resolve('timed out'), 30_000)),
      ]);
    },
    { hostId: NESTED_HOST_ID, json: JSON.stringify(rows) },
  );
}

/** Errors of the hang: the bridge failing to read the reply, and the row fetch failing. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  const pattern = /code\.startsWith|could not be cloned|Error fetching rows/;
  page.on('console', (message) => {
    if (message.type() === 'error' && pattern.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (pattern.test(error.message)) errors.push(error.message);
  });
  return errors;
}

test('a jump to list and struct columns at the far right of a wide table fills every cell', async ({
  page,
}) => {
  const errors = watchErrors(page);
  expect(
    await mountJson(page, { scalarColumns: 300, rows: 400, nested: 'lists-and-structs' }),
  ).toBe('loaded');
  await waitForFilledBody(page, ['c000']);

  // A thumb yank: the whole way right in one scroll.
  await page.evaluate((hostId) => {
    const scroller = document.querySelector(`#${hostId} .dt-body-scroll`)!;
    scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
  }, NESTED_HOST_ID);
  const nested = ['tags', 'labels', 'point'];
  const atRight = await waitForFilledBody(page, nested);

  // Then a block further down, which no fetch has read yet.
  await page.evaluate(
    ({ hostId, px }) => {
      document.querySelector(`#${hostId} .dt-body-scroll`)!.scrollTop += px;
    },
    { hostId: NESTED_HOST_ID, px: BLOCK_ROWS * ROW_HEIGHT },
  );
  // Placeholder or not, a row of that block is rendered.
  await page.waitForSelector(
    `#${NESTED_HOST_ID} .dt-body .dt-row[data-row-index="${BLOCK_ROWS + 4}"]`,
  );
  const below = await waitForFilledBody(page, nested);
  expect(Object.keys(below.cells).filter((id) => Number(id) >= BLOCK_ROWS).length).toBeGreaterThan(
    10,
  );

  for (const state of [atRight, below]) {
    const ids = Object.keys(state.cells);
    expect(ids.length).toBeGreaterThan(10);
    expect(wrongCells(state, await expectedCellTexts(page, nested, ids), nested)).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('a JSON file with array and object fields in its first screen loads, and shows them as text', async ({
  page,
}) => {
  const errors = watchErrors(page);
  expect(await mountJson(page, { rows: 50, nested: 'lists-and-structs' })).toBe('loaded');
  const nested = ['tags', 'labels', 'point'];
  const body = await waitForFilledBody(page, nested);
  const expected = await expectedCellTexts(page, nested, Object.keys(body.cells));
  expect(wrongCells(body, expected, nested)).toEqual([]);
  // The cells are DuckDB's text, then, not JavaScript's: row 0's empty list
  // is `[]`, not ``, and row 2's struct is not `[object Object]`.
  expect(expected['0']!.tags).toBe('[]');
  expect(expected['2']!.point).toMatch(/^\{'x': /);

  // Read outside the grid, the values come back as arrays and objects.
  const values = await page.evaluate(async () => {
    const { actions } = (window as unknown as NestedWindow).__dt;
    return {
      tags: (await actions.getColumnValues('tags', { limit: 4 })) as unknown[],
      point: (await actions.getColumnValues('point', { limit: 2 })) as unknown[],
    };
  });
  expect(values.tags).toEqual([[], [7], [14, 27], [21, 34, 47]]);
  expect(values.point).toEqual([
    { x: 0, y: 0, tier: 'gold' },
    { x: 0.25, y: 0.125, tier: 'silver' },
  ]);
  expect(errors).toEqual([]);
});

test('a table with numeric months and days columns shows their numbers', async ({ page }) => {
  expect(await mountJson(page, { rows: 50, nested: 'months-and-days' })).toBe('loaded');
  const { cells } = await waitForFilledBody(page, ['id', 'months', 'days']);
  expect(cells['13']).toEqual({ id: '13', months: '2', days: '14' });
});

/**
 * Items in row `r` of each long column of {@link LONG_SELECT}: up to 119,
 * 69, 59 and 49, so the first screen holds values on both sides of 32.
 */
const LONG_LENGTHS = {
  ints: (r: number) => (r * 37) % 120,
  words: (r: number) => (r * 13) % 70,
  attrs: (r: number) => (r * 11) % 60,
  people: (r: number) => (r * 7) % 50,
} as const;

/** Every ninth `ints` is NULL. */
const intsIsNull = (r: number) => r % 9 === 8;

/**
 * Lists of integers, of words and of structs, and a map, as long as
 * {@link LONG_LENGTHS} says; a struct; and a list column that is NULL in
 * every row, whose chart is all nulls.
 */
const LONG_SELECT = `
  CASE WHEN i % 9 = 8 THEN NULL
       ELSE list_transform(range((i * 37) % 120), j -> CAST(i * 1000 + j AS INTEGER)) END AS ints,
  list_transform(range((i * 13) % 70), j -> 'w' || j) AS words,
  map_from_entries(list_transform(range((i * 11) % 60),
    j -> {'k': 'k' || j, 'v': CAST(i + j AS INTEGER)})) AS attrs,
  list_transform(range((i * 7) % 50),
    j -> {'rid': CAST(i AS INTEGER), 'qty': CAST(j AS INTEGER)}) AS people,
  {'rid': CAST(i AS INTEGER), 'x': i / 4, 'tier': ['gold', 'silver', 'bronze'][i % 3 + 1]} AS point,
  CAST(NULL AS INTEGER[]) AS nothing`;

const LONG_NESTED = ['ints', 'words', 'attrs', 'people', 'point', 'nothing'] as const;

for (const visualizations of [false, true]) {
  test(`lists past 32 items and a map past 32 entries show their first 32 and how many more${visualizations ? ', with header charts' : ''}`, async ({
    page,
  }) => {
    const errors = watchConsoleErrors(page);
    await mountSqlTable(page, { select: LONG_SELECT, rows: 400, visualizations });
    const body = await waitForFilledBody(page, LONG_NESTED);
    const ids = Object.keys(body.cells);
    expect(ids.length).toBeGreaterThan(10);

    const schema = await page.evaluate(() =>
      (window as unknown as NestedWindow).__dt.state.schema
        .get()
        .map((c) => ({ name: c.name, type: c.type })),
    );
    for (const name of LONG_NESTED) {
      expect(schema, `${name} is typed nested`).toContainEqual({ name, type: 'nested' });
    }

    // Every cell is what DuckDB says it should be.
    expect(wrongCells(body, await expectedCellTexts(page, LONG_NESTED, ids), LONG_NESTED)).toEqual(
      [],
    );

    // N is the generator's count past 32, not only DuckDB's: each long
    // column has cells on both sides of the cut in the first screen.
    for (const [name, length] of Object.entries(LONG_LENGTHS)) {
      const close = name === 'attrs' ? '}' : ']';
      let cut = 0;
      for (const id of ids) {
        const r = Number(id);
        const text = body.cells[id]![name]!;
        if (name === 'ints' && intsIsNull(r)) {
          expect(text, `${name} of row ${r}`).toBe('null');
        } else if (length(r) > PREVIEW_ITEMS) {
          expect(
            text.endsWith(`, … +${length(r) - PREVIEW_ITEMS}${close}`),
            `${name} of row ${r}: ${text}`,
          ).toBe(true);
          cut++;
        } else {
          expect(text, `${name} of row ${r}`).not.toContain('…');
        }
      }
      expect(cut, `${name} cells cut at ${PREVIEW_ITEMS}`).toBeGreaterThan(2);
    }

    // And the head is the value's first 32 items, read off its whole text
    // rather than off the slice the grid takes.
    const whole = await page.evaluate(async (ids) => {
      const { bridge, state } = (window as unknown as NestedWindow).__dt;
      return bridge.query<{ id: number; whole: string | null }>(
        `SELECT CAST("ints" AS VARCHAR) AS whole, "__rowid__" AS id FROM "${state.tableName.get()}"` +
          ` WHERE "__rowid__" IN (${ids.join(', ')}) AND len("ints") > 32`,
      );
    }, ids);
    expect(whole.length).toBeGreaterThan(2);
    for (const { id, whole: text } of whole) {
      const items = text!.slice(1, -1).split(', ');
      expect(body.cells[String(id)]!.ints).toBe(
        `[${items.slice(0, PREVIEW_ITEMS).join(', ')}, … +${items.length - PREVIEW_ITEMS}]`,
      );
    }

    if (visualizations) {
      await expect
        .poll(() => unpaintedCharts(page, LONG_NESTED), {
          message: 'nested columns whose header chart has not drawn',
        })
        .toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}
