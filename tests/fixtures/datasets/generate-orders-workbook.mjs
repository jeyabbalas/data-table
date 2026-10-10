#!/usr/bin/env node
/**
 * Generate the Excel workbook the demo's "Orders by quarter" example loads.
 *
 * Splits csv/us_customer_orders.csv into one sheet per quarter of its order
 * date, Q1 to Q4, with the dates stored as Excel dates (`yyyy-mm-dd`) and the
 * totals as numbers formatted as dollars, the way a spreadsheet keeps them.
 * A fifth sheet, Notes, is empty: the demo's sheet picker lists only the
 * sheets with data.
 *
 * Output (path relative to this script):
 *     xlsx/us_customer_orders_by_quarter.xlsx    4 sheets of orders + 1 empty
 *
 * Run from the repository root:
 *     node tests/fixtures/datasets/generate-orders-workbook.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'csv', 'us_customer_orders.csv');
const target = join(here, 'xlsx', 'us_customer_orders_by_quarter.xlsx');

/** Days since Excel's 1900 epoch, for a `YYYY-MM-DD` date. */
const excelSerial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25_569;
};

// The file has no quoted fields; an empty field is a missing state.
const [header, ...lines] = readFileSync(source, 'utf8').trim().split('\n');
const orders = lines.map((line) => {
  const [id, state, category, total, date] = line.split(',');
  return { id: Number(id), state: state || null, category, total: Number(total), date };
});

const workbook = XLSX.utils.book_new();
for (const quarter of [1, 2, 3, 4]) {
  const rows = orders.filter((o) => Math.ceil(Number(o.date.slice(5, 7)) / 3) === quarter);
  const sheet = XLSX.utils.aoa_to_sheet([
    header.split(','),
    ...rows.map((o) => [o.id, o.state, o.category, o.total, excelSerial(o.date)]),
  ]);
  rows.forEach((_, i) => {
    const r = i + 2;
    sheet[`D${r}`].z = '"$"#,##0.00';
    sheet[`E${r}`].z = 'yyyy-mm-dd';
  });
  sheet['!cols'] = [{ wch: 9 }, { wch: 6 }, { wch: 16 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, sheet, `Q${quarter}`);
}
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Notes');

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }));
console.log(`Wrote ${target}`);
