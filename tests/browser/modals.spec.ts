/**
 * Two modal bugs that need the library's stylesheet and a browser's radio
 * groups, which jsdom has only in part.
 *
 * The SQL filter modal's Remove section is hidden by the stylesheet, and was
 * never shown: editing a filter cleared an inline `display` the stylesheet
 * did not need. And radios that share a name and have no form are one group
 * across the whole document, which a browser enforces as soon as a checked
 * radio is added to it. Named per class prefix, a second table's export
 * dialog, added with its defaults checked, unchecked the first's format and
 * scope.
 */

import { expect, test, type Page } from '@playwright/test';
import { mountTable } from './helpers/table';

test('the SQL filter modal offers Remove when editing a filter, and only then', async ({
  page,
}) => {
  await mountTable(page, { columns: 6, rows: 50 });
  const modal = page.locator('.dt-sql-filter-modal-backdrop--open');
  const remove = modal.locator('.dt-sql-filter-modal-remove');

  await page.locator('.dt-filter-expression-btn').click();
  await expect(modal).toBeVisible();
  await expect(remove).toBeHidden();
  // Escape reaches the dialog once it has focus, a frame after it opens.
  await expect(modal.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  await page.evaluate(() => {
    const w = window as unknown as { __dt: import('../../src/index').DataTable };
    w.__dt.actions.addRawSQLFilter('"c0" > 10', 'c0 over 10');
  });
  await page.locator('.dt-filter-chip-label--sql').click();
  await expect(modal).toBeVisible();
  await expect(remove).toBeVisible();

  // Reachable from the keyboard: Tab from Validate lands on it, and focus
  // stays in the dialog through the confirmation, which hides each button
  // as it is used.
  await modal.locator('.dt-sql-filter-modal-validate').focus();
  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(modal.locator('.dt-sql-filter-modal-remove-confirm-no')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(modal.locator('.dt-sql-filter-modal-remove-confirm-yes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(modal).toHaveCount(0);
  const filters = await page.evaluate(() => {
    const w = window as unknown as { __dt: import('../../src/index').DataTable };
    return w.__dt.state.filters.get().length;
  });
  expect(filters).toBe(0);
});

/** Two tables on one page, on `window.__dtA` and `window.__dtB`. */
async function mountTwoTables(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../src/index');
    const w = window as unknown as Record<string, unknown>;
    const csv = ['a,b', ...Array.from({ length: 20 }, (_, r) => `${r},${r * 2}`)].join('\n');
    for (const [key, top] of [
      ['__dtA', 0],
      ['__dtB', 320],
    ] as const) {
      const host = document.createElement('div');
      host.style.cssText = `position: fixed; left: 0; top: ${top}px; width: 800px; height: 300px; z-index: 1; background: white;`;
      document.body.appendChild(host);
      const table = await mod.createDataTable({
        container: host,
        tableName: `two_${key}`,
        persistence: false,
        visualizations: false,
      });
      await table.loadData(new File([csv], `${key}.csv`, { type: 'text/csv' }));
      w[key] = table;
    }
  });
}

test("a second table's export dialog leaves the first's format and scope checked", async ({
  page,
}) => {
  await mountTwoTables(page);
  const open = page.locator('.dt-export-backdrop--open');
  const openExport = async (key: '__dtA' | '__dtB'): Promise<void> => {
    await page.evaluate((k) => {
      const w = window as unknown as Record<string, import('../../src/index').DataTable>;
      w[k]!.openExportDialog();
    }, key);
    await expect(open).toBeVisible();
  };
  const closeExport = async (): Promise<void> => {
    await open.locator('.dt-export-close').click();
    await expect(open).toHaveCount(0);
  };

  await openExport('__dtA');
  await closeExport();

  // The second table's dialog is built now, with CSV and all rows checked.
  await openExport('__dtB');
  await closeExport();

  await openExport('__dtA');
  await expect(open.locator('input[type="radio"][value="csv"]')).toBeChecked();
  await expect(open.locator('input[type="radio"][value="all"]')).toBeChecked();
});
