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
