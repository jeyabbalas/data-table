/**
 * Derived columns added, edited and removed while they are out of view, and
 * undo and redo of each.
 *
 * A derived column is appended at the right end of a wide table, far from
 * wherever the user is. Its cells must show the current expression whenever
 * they scroll in: rows fetched before an edit are stale, and a renderer that
 * only refreshes what is on screen must not keep them.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { settle } from './helpers/demo';
import {
  HOST_ID,
  type TestWindow,
  mountTable,
  probe,
  wheelBy,
  wheelIntoView,
} from './helpers/table';

/**
 * An expression whose value in row `r` is `prefix` followed by the row's
 * `c000` times ten, which the generated data makes `(r * 31) % 1000`. Text,
 * so the cell shows it without number formatting.
 */
function expression(prefix: string): string {
  return `'${prefix}' || CAST(c000 * 10 AS INTEGER)`;
}

/** Rows whose `d` cell does not read `prefix` + `(r * 31) % 1000`. */
function staleCells(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(
    ({ hostId, prefix }) => {
      const out: string[] = [];
      const rows = document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`);
      for (const row of rows) {
        const r = Number(row.getAttribute('data-row-index'));
        const text = row.querySelector('.dt-cell[data-column="d"]')?.textContent ?? '(no cell)';
        if (text !== `${prefix}${(r * 31) % 1000}`) out.push(`${r}: ${text}`);
      }
      return rows.length === 0 ? ['(no rows)'] : out;
    },
    { hostId: HOST_ID, prefix },
  );
}

function act<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ({ fn, args }) =>
      (
        (window as unknown as TestWindow).__dt.actions as unknown as Record<
          string,
          (...a: unknown[]) => unknown
        >
      )[fn]!(...args),
    { fn, args },
  ) as Promise<T>;
}

/** Scroll `d` out of view, run `change`, then scroll it back and check its cells. */
async function changeOffScreen(
  page: Page,
  change: () => Promise<unknown>,
  prefix: string | null,
): Promise<void> {
  if ((await probe(page, 'column', 'd'))?.inView) await wheelBy(page, -20_000, { stepPx: 2_000 });
  await change();
  await settle(page);
  const inSchema = await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.state.schema.get().some((c) => c.name === 'd'),
  );
  expect(inSchema, 'd is a column of the table').toBe(prefix !== null);
  if (prefix === null) return;
  await wheelIntoView(page, 'd');
  await expect.poll(() => staleCells(page, prefix)).toEqual([]);
}

test('a derived column added, edited, removed and restored off-screen shows current values', async ({
  page,
}) => {
  await mountTable(page);
  const added = await act<{ success: boolean }>(page, 'addDerivedColumn', {
    kind: 'expression',
    name: 'd',
    expression: expression('a'),
  });
  expect(added.success).toBe(true);
  await settle(page);
  expect((await probe(page, 'order')).at(-1)).toBe('d');
  await wheelIntoView(page, 'd');
  await expect.poll(() => staleCells(page, 'a')).toEqual([]);

  await changeOffScreen(page, () => act(page, 'undo'), null);
  await changeOffScreen(page, () => act(page, 'redo'), 'a');
  const replaced = { kind: 'expression', name: 'd', expression: expression('b') };
  await changeOffScreen(page, () => act(page, 'replaceDerivedColumn', 'd', replaced), 'b');
  await changeOffScreen(page, () => act(page, 'undo'), 'a');
  await changeOffScreen(page, () => act(page, 'redo'), 'b');
  await changeOffScreen(page, () => act(page, 'removeDerivedColumn', 'd'), null);
  await changeOffScreen(page, () => act(page, 'undo'), 'b');
  await changeOffScreen(page, () => act(page, 'redo'), null);
});

test('a derived column added from the + button is scrolled into view', async ({ page }) => {
  await mountTable(page);
  await wheelBy(page, 8_000);

  await page.locator(`#${HOST_ID} .dt-add-column-btn`).click();
  const modal = page.locator('.dt-derived-modal-body');
  await expect(modal).toBeVisible();
  await modal.locator('input.dt-filter-input').first().fill('d');
  await modal.locator('.cm-content').click();
  await page.keyboard.type(expression('a'));
  await page.locator('.dt-derived-modal-validate').click();
  const create = page.locator('.dt-derived-modal-create');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(modal).toBeHidden();

  // The body smooth-scrolls to the right end once the column renders. The
  // header jumps there at once, so wait for the body to arrive.
  await expect
    .poll(
      async () => {
        const { left, max } = await probe(page, 'scroll');
        return max - left;
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(1);
  await settle(page);
  expect((await probe(page, 'column', 'd'))!.inView).toBe(true);
  await expect.poll(() => staleCells(page, 'a')).toEqual([]);
});

test('undoing a derived column added or renamed in view asks DuckDB for no column it lacks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mountTable(page);
  for (const name of ['d1', 'd2']) {
    const added = await act<{ success: boolean }>(page, 'addDerivedColumn', {
      kind: 'expression',
      name,
      expression: expression(name),
    });
    expect(added.success).toBe(true);
  }
  await settle(page);
  await wheelIntoView(page, 'd2');

  // Undo the add of d2: the schema loses it before the column list does, and
  // the body is kept through both.
  await act(page, 'undo');
  await settle(page);
  expect(await probe(page, 'order')).not.toContain('d2');

  // And a rename, undone.
  const renamed = await act<{ success: boolean }>(page, 'updateDerivedColumn', 'd1', {
    kind: 'expression',
    name: 'd3',
    expression: expression('d3'),
  });
  expect(renamed.success).toBe(true);
  await settle(page);
  await wheelIntoView(page, 'd3');
  await act(page, 'undo');
  await settle(page);
  expect(await probe(page, 'order')).toContain('d1');

  expect(errors.filter((e) => /Binder Error|not found/i.test(e))).toEqual([]);
});

test('rows scrolled to while a derived-column change runs are read once it lands, and none fail', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mountTable(page);
  const added = await act<{ success: boolean }>(page, 'addDerivedColumn', {
    kind: 'expression',
    name: 'd',
    expression: expression('a'),
  });
  expect(added.success).toBe(true);
  await settle(page);

  // Removing the only derived column drops its VIEW. Hold DuckDB's answer to
  // the DROP: the VIEW is gone, and the state still names it.
  type HoldWindow = TestWindow & { __held: (() => void)[] };
  await page.evaluate(() => {
    const w = window as unknown as HoldWindow;
    w.__held = [];
    const query = w.__dt.bridge.query.bind(w.__dt.bridge);
    w.__dt.bridge.query = (async (sql: string, ...rest: unknown[]) => {
      const result = await (query as (...a: unknown[]) => Promise<unknown>)(sql, ...rest);
      if (/^DROP VIEW/i.test(sql)) await new Promise<void>((resolve) => w.__held.push(resolve));
      return result;
    }) as typeof w.__dt.bridge.query;
    void w.__dt.actions.removeDerivedColumn('d');
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HoldWindow).__held.length))
    .toBe(1);

  // Sideways and down, to columns and rows no block holds yet.
  await wheelBy(page, 6_000);
  await page.mouse.wheel(0, 5_000);
  await page.waitForTimeout(1_000);
  const failedWhileHeld = errors.filter((e) => e.includes('Error fetching rows')).length;

  await page.evaluate(() => {
    for (const resolve of (window as unknown as HoldWindow).__held.splice(0)) resolve();
  });
  await settle(page);
  // Each used to be issued again as soon as the last failed: thousands of
  // times here, as many as the machine answered.
  expect(failedWhileHeld).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        (hostId) =>
          document.querySelectorAll(
            `#${hostId} .dt-body .dt-row[data-placeholder], #${hostId} .dt-body .dt-cell--pending`,
          ).length,
        HOST_ID,
      ),
    )
    .toBe(0);
  expect(errors.filter((e) => e.includes('Error fetching rows'))).toEqual([]);
});

test('rows scrolled to and sorted while a derived column is being added load at once', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const ROWS = 5_000;
  await mountTable(page, { columns: 40, rows: ROWS });
  await settle(page);

  // Add a vector column, and hold DuckDB's answer to the first INSERT into
  // its helper table. The add is in flight, and the table the rows come from
  // untouched: an add changes it with one CREATE OR REPLACE VIEW at its end.
  type HoldWindow = TestWindow & {
    __held: (() => void)[];
    __add: Promise<{ success: boolean }>;
  };
  await page.evaluate((rows) => {
    const w = window as unknown as HoldWindow;
    w.__held = [];
    let held = false;
    const query = w.__dt.bridge.query.bind(w.__dt.bridge);
    w.__dt.bridge.query = (async (sql: string, ...rest: unknown[]) => {
      const result = await (query as (...a: unknown[]) => Promise<unknown>)(sql, ...rest);
      if (!held && /^INSERT INTO "__dt_vec_/.test(sql)) {
        held = true;
        await new Promise<void>((resolve) => w.__held.push(resolve));
      }
      return result;
    }) as typeof w.__dt.bridge.query;
    w.__add = w.__dt.actions.addDerivedColumn({
      kind: 'vector',
      name: 'v',
      vectorType: 'float',
      values: Array.from({ length: rows }, (_, i) => i / 10),
    });
  }, ROWS);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HoldWindow).__held.length))
    .toBe(1);

  const unloaded = () =>
    page.evaluate(
      (hostId) =>
        document.querySelectorAll(
          `#${hostId} .dt-body .dt-row[data-placeholder], #${hostId} .dt-body .dt-cell--pending`,
        ).length,
      HOST_ID,
    );

  // Down, to rows no block holds yet: they load while the add runs.
  const box = (await page.locator(`#${HOST_ID} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 40_000);
  await expect
    .poll(() =>
      page.evaluate(
        (hostId) => document.querySelector(`#${hostId} .dt-body-scroll`)!.scrollTop,
        HOST_ID,
      ),
    )
    .toBeGreaterThan(10_000);
  await expect.poll(unloaded).toBe(0);

  // Sorted: the rows in view are read again, sorted, while the add runs.
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setSort([{ column: 'c00', direction: 'desc' }]),
  );
  await expect.poll(unloaded).toBe(0);
  expect(await page.evaluate(() => (window as unknown as HoldWindow).__held.length)).toBe(1);

  const added = await page.evaluate(() => {
    const w = window as unknown as HoldWindow;
    for (const resolve of w.__held.splice(0)) resolve();
    return w.__add;
  });
  expect(added.success).toBe(true);
  await settle(page);
  expect(errors.filter((e) => e.includes('Error fetching rows'))).toEqual([]);
});
