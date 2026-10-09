/**
 * The demo's Excel workbooks: picked, dropped or linked, read in a worker,
 * one sheet converted to JSON for the library to load.
 *
 * A workbook of one sheet with data loads as it is; one of several asks
 * which sheet, in a dialog that leaves out the sheets with nothing in them.
 * The sheet's values keep their types: text stays text, leading zeros and
 * all, and Excel's dates and times load as DATE, TIMESTAMP and TIME. And a
 * workbook from a URL names its sheet in the page's address, so a reload
 * brings back the same sheet without asking again.
 *
 * The workbooks are written here with SheetJS, the reader the demo uses, so
 * the repository holds no binary fixture for them.
 */

import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { openDemo } from './helpers/demo';

type DemoWindow = { __dtDemo: { table: import('../../src/index').DataTable | null } };

/** Days since Excel's 1900 epoch, at a UTC date and time. */
const serial = (y: number, m: number, d: number, h = 0, min = 0, s = 0) =>
  Date.UTC(y, m - 1, d, h, min, s) / 86_400_000 + 25_569;

/** An .xlsx (or `bookType`) workbook of `sheets`, in order. */
function workbook(
  sheets: Record<string, XLSX.WorkSheet>,
  bookType: XLSX.BookType = 'xlsx',
): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return XLSX.write(book, { type: 'buffer', bookType }) as Buffer;
}

/** Three sheets with data, the second and third with dates, and an empty one. */
function quarters(): Buffer {
  const sheet = (rows: [number, string, number][]) => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['id', 'region', 'day'],
      ...rows.map(([id, region, day]) => [id, region, serial(2025, 1, day)]),
    ]);
    rows.forEach((_, i) => (ws[`C${i + 2}`]!.z = 'yyyy-mm-dd'));
    return ws;
  };
  return workbook({
    North: sheet([
      [1, 'Oslo', 3],
      [2, 'Bergen', 4],
    ]),
    South: sheet([
      [3, 'Rome', 5],
      [4, 'Naples', 6],
      [5, 'Bari', 7],
    ]),
    Empty: XLSX.utils.aoa_to_sheet([]),
    East: sheet([[6, 'Kyiv', 8]]),
  });
}

async function pickFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.setInputFiles('#file-input', { name, mimeType: '', buffer });
}

async function expectRows(page: Page, rows: string): Promise<void> {
  await expect(page.locator('#table-info')).toContainText(rows, { timeout: 90_000 });
  await expect(page.locator('#table-info')).toContainText('loaded in');
}

/** The loaded table's columns as `name TYPE`, and its rows, in order. */
async function contents(page: Page): Promise<{ columns: string[]; rows: unknown[] }> {
  return page.evaluate(async () => {
    const table = (window as unknown as DemoWindow).__dtDemo.table!;
    const name = table.state.tableName.get()!;
    const columns = table.state.schema
      .get()
      .filter((c) => !c.system)
      .map((c) => `${c.name} ${c.originalType}`);
    const rows = await table.bridge.query(
      `SELECT * EXCLUDE (__rowid__) FROM "${name}" ORDER BY __rowid__`,
    );
    return {
      columns,
      rows: JSON.parse(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? Number(v) : v))),
    };
  });
}

test('asks which sheet of a workbook with several to load, and loads that one', async ({
  page,
}) => {
  await openDemo(page);
  await pickFile(page, 'regions.xlsx', quarters());

  const dialog = page.getByRole('dialog', { name: 'Choose a sheet' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText('regions.xlsx has 3 sheets with data');
  const options = dialog.getByRole('radio');
  await expect(options).toHaveCount(3);
  await expect(dialog.locator('.sheet-option')).toHaveText([
    /North\s*2 rows × 3 columns\s*id, region, day/,
    /South\s*3 rows × 3 columns/,
    /East\s*1 row × 3 columns/,
  ]);
  await expect(options.first()).toBeChecked();
  await expect(options.first()).toBeFocused();

  // The arrow keys choose, and Enter loads.
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();

  await expectRows(page, '3 rows');
  await expect(page.locator('#table-info')).toContainText('1 date');
  expect(await contents(page)).toEqual({
    columns: ['id BIGINT', 'region VARCHAR', 'day DATE'],
    rows: [
      { id: 3, region: 'Rome', day: Date.UTC(2025, 0, 5) },
      { id: 4, region: 'Naples', day: Date.UTC(2025, 0, 6) },
      { id: 5, region: 'Bari', day: Date.UTC(2025, 0, 7) },
    ],
  });

  // A refresh restores the sheet from the demo's cache, without asking.
  await page.reload();
  await expectRows(page, '3 rows');
  await expect(dialog).toBeHidden();
});

test('loads a workbook of one sheet with data without asking, its values typed', async ({
  page,
}) => {
  await openDemo(page);
  // Data from C3, two header names that differ only in case, a blank header,
  // text that looks like numbers, a column of numbers and text, and an empty
  // column inside.
  const sheet = XLSX.utils.aoa_to_sheet([
    [],
    [],
    [null, null, 'zip', 'Name', 'name', null, 'mixed', 'flag', 'when', 'clock', null, 'note'],
    [
      null,
      null,
      '02134',
      'Ada',
      'x',
      1,
      42,
      true,
      serial(2024, 1, 15, 9, 30),
      0.5,
      null,
      'a "quote"',
    ],
    [
      null,
      null,
      '00501',
      'Linus',
      'y',
      2,
      'n/a',
      false,
      serial(2024, 2, 29, 18, 0, 5),
      0.25,
      null,
      null,
    ],
  ]);
  for (const r of [4, 5]) {
    sheet[`I${r}`]!.z = 'yyyy-mm-dd hh:mm:ss';
    sheet[`J${r}`]!.z = 'hh:mm';
  }
  await pickFile(
    page,
    'people.xlsx',
    workbook({ People: sheet, Blank: XLSX.utils.aoa_to_sheet([]) }),
  );

  await expectRows(page, '2 rows');
  await expect(page.getByRole('dialog', { name: 'Choose a sheet' })).toBeHidden();
  expect(await contents(page)).toEqual({
    columns: [
      'zip VARCHAR',
      'Name VARCHAR',
      'name_2 VARCHAR',
      'Column F BIGINT',
      'mixed VARCHAR',
      'flag BOOLEAN',
      'when TIMESTAMP',
      'clock TIME',
      'note VARCHAR',
    ],
    rows: [
      {
        zip: '02134',
        Name: 'Ada',
        name_2: 'x',
        'Column F': 1,
        mixed: '42',
        flag: true,
        when: Date.UTC(2024, 0, 15, 9, 30),
        clock: 12 * 3600 * 1e6,
        note: 'a "quote"',
      },
      {
        zip: '00501',
        Name: 'Linus',
        name_2: 'y',
        'Column F': 2,
        mixed: 'n/a',
        flag: false,
        when: Date.UTC(2024, 1, 29, 18, 0, 5),
        clock: 6 * 3600 * 1e6,
        note: null,
      },
    ],
  });
});

test('reads a legacy .xls workbook, accents and all', async ({ page }) => {
  await openDemo(page);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['région', 'prix'],
    ['Rhône', 12.5],
    ['Mâcon', 9],
  ]);
  await pickFile(page, 'vins.xls', workbook({ Vins: sheet }, 'biff8'));

  await expectRows(page, '2 rows');
  expect(await contents(page)).toEqual({
    columns: ['région VARCHAR', 'prix DOUBLE'],
    rows: [
      { région: 'Rhône', prix: 12.5 },
      { région: 'Mâcon', prix: 9 },
    ],
  });
});

test('keeps the table it has when the sheet picker is dismissed', async ({ page }) => {
  await openDemo(page);
  await pickFile(page, 'regions.xlsx', quarters());
  const dialog = page.getByRole('dialog', { name: 'Choose a sheet' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Load sheet' }).click();
  await expectRows(page, '2 rows');

  await pickFile(page, 'regions.xlsx', quarters());
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#table-info')).toContainText('2 rows');
  await expect(page.locator('#open-file-btn')).toBeEnabled();
  expect((await contents(page)).rows).toHaveLength(2);
});

test('says why a workbook it cannot read did not load', async ({ page }) => {
  await openDemo(page);
  await pickFile(page, 'broken.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
  await expect(page.locator('#table-info')).toContainText(
    'Error: Could not read broken.xlsx as a workbook',
    { timeout: 30_000 },
  );
  await expect(page.locator('#empty-error')).toContainText('broken.xlsx');
  await expect(page.locator('#open-file-btn')).toBeEnabled();
});

test('names the sheet of a linked workbook in the address, and reopens it without asking', async ({
  page,
}) => {
  const url = '/fixtures/xlsx/us_customer_orders_by_quarter.xlsx';
  await openDemo(page);
  await page.fill('#url-input', url);
  await page.click('#load-url-btn');

  const dialog = page.getByRole('dialog', { name: 'Choose a sheet' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // Q1 to Q4; the workbook's empty Notes sheet is left out.
  await expect(dialog.getByRole('radio')).toHaveCount(4);
  await dialog.locator('.sheet-option', { hasText: 'Q2' }).click();
  await dialog.getByRole('button', { name: 'Load sheet' }).click();
  await expectRows(page, '41 rows');

  const params = new URL(page.url()).searchParams;
  expect(params.get('url')).toBe(url);
  expect(params.get('sheet')).toBe('Q2');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dt-last-session')!) as unknown),
  ).toMatchObject({ type: 'url', source: url, sheet: 'Q2' });

  // The shared link downloads the workbook again and opens the same sheet.
  await page.reload();
  await expectRows(page, '41 rows');
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.get('sheet')).toBe('Q2');
});
