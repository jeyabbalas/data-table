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
 * Each test builds its table in-page from generated JSON, as
 * `helpers/table.ts` does from CSV, so every cell is a pure function of its
 * row.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const HOST_ID = 'dt-nested-host';
const ROW_HEIGHT = 32;
const BLOCK_ROWS = 128;

type NestedWindow = { __dt: import('../../src/index').DataTable };

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

/** The text DuckDB gives `tags` of row `r` cast to VARCHAR. */
function tagsText(r: number): string {
  return `[${(nestedRow(r, 'lists-and-structs').tags as number[]).join(', ')}]`;
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
    { hostId: HOST_ID, json: JSON.stringify(rows) },
  );
}

interface BodyState {
  /** Body rows with data. */
  rows: number;
  /** Rows still waiting for their data. */
  placeholders: number;
  /** Cells of rows with data still waiting for their column. */
  pending: number;
  /** Text of each cell of `columns`, by row id. */
  cells: Record<string, Record<string, string | null>>;
}

function readBody(page: Page, columns: string[]): Promise<BodyState> {
  return page.evaluate(
    ({ hostId, columns }) => {
      const host = document.getElementById(hostId)!;
      const rows = Array.from(
        host.querySelectorAll<HTMLElement>('.dt-body .dt-row:not([data-placeholder])'),
      );
      const cells: Record<string, Record<string, string | null>> = {};
      for (const row of rows) {
        const texts: Record<string, string | null> = {};
        for (const column of columns) {
          const cell = row.querySelector(`.dt-cell[data-column="${column}"]`);
          texts[column] = cell ? cell.textContent : null;
        }
        cells[row.getAttribute('data-row-id')!] = texts;
      }
      return {
        rows: rows.length,
        placeholders: host.querySelectorAll('.dt-body .dt-row[data-placeholder]').length,
        pending: host.querySelectorAll('.dt-body .dt-cell--pending').length,
        cells,
      };
    },
    { hostId: HOST_ID, columns },
  );
}

/**
 * Wait until every body row has a cell for each of `columns` and every cell
 * has its data, and return the body as it was then. Requiring the cells
 * keeps a check made just after a scroll from passing on the columns the
 * view has not yet left.
 */
async function waitForFilledBody(page: Page, columns: string[]): Promise<BodyState> {
  let state: BodyState | undefined;
  await expect
    .poll(
      async () => {
        state = await readBody(page, columns);
        const mounted = Object.values(state.cells).every((texts) =>
          columns.every((column) => texts[column] !== null),
        );
        return {
          rows: state.rows > 0,
          mounted,
          placeholders: state.placeholders,
          pending: state.pending,
        };
      },
      { message: 'every body row and cell gets its data', timeout: 20_000 },
    )
    .toEqual({ rows: true, mounted: true, placeholders: 0, pending: 0 });
  return state!;
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
  }, HOST_ID);
  const nested = ['tags', 'labels', 'point'];
  const atRight = await waitForFilledBody(page, nested);

  // Then a block further down, which no fetch has read yet.
  await page.evaluate(
    ({ hostId, px }) => {
      document.querySelector(`#${hostId} .dt-body-scroll`)!.scrollTop += px;
    },
    { hostId: HOST_ID, px: BLOCK_ROWS * ROW_HEIGHT },
  );
  // Placeholder or not, a row of that block is rendered.
  await page.waitForSelector(`#${HOST_ID} .dt-body .dt-row[data-row-index="${BLOCK_ROWS + 4}"]`);
  const below = await waitForFilledBody(page, nested);
  expect(Object.keys(below.cells).filter((id) => Number(id) >= BLOCK_ROWS).length).toBeGreaterThan(
    10,
  );

  for (const state of [atRight, below]) {
    const ids = Object.keys(state.cells).map(Number);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      const { tags, labels, point } = state.cells[id]!;
      expect(tags, `tags of row ${id}`).toBe(tagsText(id));
      expect(labels, `labels of row ${id}`).toBe(id % 5 === 0 ? 'null' : `[a${id % 3}, b]`);
      expect(point, `point of row ${id}`).toMatch(/^\{'x': .*, 'tier': (gold|silver|bronze)\}$/);
    }
  }
  expect(errors).toEqual([]);
});

test('a JSON file with array and object fields in its first screen loads, and shows them as text', async ({
  page,
}) => {
  const errors = watchErrors(page);
  expect(await mountJson(page, { rows: 50, nested: 'lists-and-structs' })).toBe('loaded');
  const { cells } = await waitForFilledBody(page, ['tags', 'labels', 'point']);
  expect(cells['2']).toEqual({ tags: tagsText(2), labels: '[a2, b]', point: expect.any(String) });
  expect(cells['2']!.point).toBe("{'x': 0.5, 'y': 0.25, 'tier': bronze}");
  expect(cells['0']!.tags).toBe('[]');

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
