/**
 * Modal bugs that need the library's stylesheet, real focus and a browser's
 * radio groups, which jsdom has only in part.
 *
 * The SQL filter modal's Remove section is hidden by the stylesheet, and was
 * never shown: editing a filter cleared an inline `display` the stylesheet
 * did not need. Closing an edit dropped focus to the page, since the chip it
 * was opened from takes no focus and is rebuilt when the filter changes. And
 * radios that share a name and have no form are one group across the whole
 * document, which a browser enforces as soon as a checked radio is added to
 * it. Named per class prefix, a second table's export dialog, added with its
 * defaults checked, unchecked the first's format and scope.
 *
 * The derived-column panels' errors, and the export dialog's, are hidden by
 * the stylesheet too, and were written but never seen: showing one cleared
 * its inline `display`, which left the stylesheet's `none` in force.
 */

import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

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
  // The chip is gone; focus goes back to the filter bar, not the page.
  await expect(page.locator('.dt-filter-expression-btn')).toBeFocused();
});

test('updating an expression filter gives focus back to the filter bar', async ({ page }) => {
  await mountTable(page, { columns: 6, rows: 50 });
  const modal = page.locator('.dt-sql-filter-modal-backdrop--open');
  await page.evaluate(() => {
    const w = window as unknown as { __dt: import('../../src/index').DataTable };
    w.__dt.actions.addRawSQLFilter('"c0" > 10', 'c0 over 10');
  });

  await page.locator('.dt-filter-chip-label--sql').click();
  await expect(modal).toBeVisible();
  await modal.locator('.dt-sql-filter-modal-validate').click();
  const update = modal.locator('.dt-sql-filter-modal-apply');
  await expect(update).toBeEnabled();
  await update.click();

  await expect(modal).toHaveCount(0);
  await expect(page.locator('.dt-filter-expression-btn')).toBeFocused();
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

test('the New Derived Column panel shows why a name, its values or the column cannot be used', async ({
  page,
}) => {
  await mountTable(page, { columns: 6, rows: 5 });
  await page.locator(`#${HOST_ID} .dt-add-column-btn`).click();
  const modal = page.locator('.dt-derived-modal-backdrop--open');
  await expect(modal).toBeVisible();

  const name = modal.locator('.dt-derived-modal-section > input.dt-filter-input');
  const nameError = modal.locator('.dt-derived-modal-name-error');
  await expect(nameError).toBeHidden();

  // Another column's name in another letter case, which DuckDB would read
  // as that column.
  await name.fill('C0');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText('A column named "c0" already exists');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription('A column named "c0" already exists');

  await name.fill('__ROWID__');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText(
    'Column name "__ROWID__" is reserved for the synthetic row id',
  );

  await name.fill('');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText('Name is required');

  await name.fill('when');
  await expect(nameError).toBeHidden();
  await expect(name).not.toHaveAttribute('aria-invalid');

  // Validate with no expression: the type preview, where Validate reports,
  // says what is missing.
  await modal.locator('.dt-derived-modal-validate').click();
  const preview = modal.locator('.dt-derived-modal-type-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveText('Expression is required');

  await modal.locator('input[type="radio"][value="vector"]').check();
  const values = modal.locator('.dt-derived-modal-vector-textarea');
  const vectorError = modal.locator('.dt-derived-modal-vector-error');
  await expect(vectorError).toBeHidden();
  await values.fill('1\n2');
  await expect(vectorError).toBeVisible();
  await expect(vectorError).toHaveText('Expected 5 values, got 2');
  await expect(values).toHaveAttribute('aria-invalid', 'true');
  await expect(values).toHaveAccessibleDescription('Expected 5 values, got 2');

  await values.fill('1\n2\n3\n4\nfive');
  await expect(vectorError).toBeVisible();
  await expect(vectorError).toHaveText(
    'Line 5: "five" is not a valid integer (use whole numbers only)',
  );

  // Dates of the right shape, one of them no date at all: DuckDB refuses the
  // column, and the panel says why.
  await modal.locator('select.dt-filter-select').selectOption('date');
  await values.fill('2024-02-26\n2024-02-27\n2024-02-28\n2024-02-29\n2024-02-30');
  await expect(vectorError).toBeHidden();
  await expect(values).not.toHaveAttribute('aria-invalid');
  const create = modal.locator('.dt-derived-modal-create');
  await expect(create).toBeEnabled();
  await create.click();
  const error = modal.locator('.dt-derived-modal-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('2024-02-30');
  await expect(modal.getByRole('alert')).toContainText('2024-02-30');
});

test('the derived column edit panel shows why a name or an expression cannot be used', async ({
  page,
}) => {
  await mountTable(page, { columns: 6, rows: 5 });
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

  const name = panel.locator('.dt-derived-edit-name-input');
  const nameError = panel.locator('.dt-derived-edit-name-error');
  await expect(nameError).toBeHidden();

  await name.fill('C1');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText('A column named "c1" already exists');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAccessibleDescription('A column named "c1" already exists');

  await name.fill('__rowid__');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText(
    'Column name "__rowid__" is reserved for the synthetic row id',
  );

  await name.fill('');
  await expect(nameError).toBeVisible();
  await expect(nameError).toHaveText('Name is required');

  // Its own name in another letter case is not another column's.
  await name.fill('D');
  await expect(nameError).toBeHidden();
  await expect(name).not.toHaveAttribute('aria-invalid');

  await panel.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await panel.locator('.dt-derived-edit-validate').click();
  const preview = panel.locator('.dt-derived-edit-type-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveText('Expression is required');
});

test('the export dialog shows why a copy failed', async ({ page }) => {
  await mountTable(page, { columns: 6, rows: 5 });
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard blocked'));
    (window as unknown as TestWindow).__dt.openExportDialog();
  });
  const dialog = page.locator('.dt-export-backdrop--open');
  await expect(dialog).toBeVisible();
  const error = dialog.locator('.dt-export-error');
  await expect(error).toBeHidden();

  await dialog.locator('.dt-export-copy-btn').click();
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Clipboard blocked');
  await expect(dialog.getByRole('alert')).toHaveText('Clipboard blocked');
});
