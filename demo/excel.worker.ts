/**
 * Excel workbooks for the demo, read off the main thread with SheetJS.
 *
 * The library loads CSV, JSON and Parquet. A workbook is turned into
 * newline-delimited JSON here, one object per row, for the table to load as
 * JSON. JSON rather than CSV because it keeps each value's type: a text cell
 * holding `02134` stays text, where DuckDB's CSV sniffer would read the
 * column as integers and drop the zero.
 *
 * Messages, answered in order:
 * - `open` parses a workbook and answers with the sheets that hold data.
 * - `convert` turns one of them into NDJSON.
 *
 * Demo-only: nothing here is part of the library.
 */

import * as XLSX from 'xlsx';
// Codepage tables, for legacy .xls files whose text is not Unicode.
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';

XLSX.set_cptable(cptable);

/** A sheet with data, as the sheet picker lists it. */
export interface SheetSummary {
  name: string;
  /** Rows under the header row. */
  rows: number;
  /** Columns holding a header or a value. */
  columns: number;
  /** The column names the table will get, as {@link toNDJSON} writes them. */
  names: string[];
  /** Hidden in Excel. */
  hidden: boolean;
}

export type ExcelRequest = { type: 'open'; file: Blob } | { type: 'convert'; sheet: string };

export type ExcelResponse =
  | { type: 'sheets'; sheets: SheetSummary[] }
  | { type: 'converted'; blob: Blob; rows: number; columns: number }
  | { type: 'error'; message: string };

type Cell = XLSX.CellObject | undefined;

/** Where a sheet's data is: its header row, its data rows and its columns. */
interface Layout {
  header: number;
  rows: number[];
  columns: number[];
}

let workbook: XLSX.WorkBook | null = null;

self.onmessage = async (event: MessageEvent<ExcelRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'open') {
      workbook = null;
      workbook = XLSX.read(await request.file.arrayBuffer(), {
        type: 'array',
        dense: true,
        // Dates stay serial numbers with their number format, and are
        // converted here, without the time zone getting involved.
        cellDates: false,
        cellNF: true,
        cellFormula: false,
        cellHTML: false,
        cellStyles: false,
      });
      reply({ type: 'sheets', sheets: summarize(workbook) });
    } else {
      if (!workbook) throw new Error('No workbook is open');
      const sheet = workbook.Sheets[request.sheet];
      if (!sheet) throw new Error(`The workbook has no sheet named ${request.sheet}`);
      const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
      const { blob, rows, columns } = toNDJSON(sheet, date1904);
      reply({ type: 'converted', blob, rows, columns });
    }
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

function reply(message: ExcelResponse): void {
  self.postMessage(message);
}

function cellsOf(sheet: XLSX.WorkSheet): Cell[][] {
  return (sheet['!data'] ?? []) as Cell[][];
}

/** No value: a blank, an error, or text that is only whitespace. */
function isEmpty(cell: Cell): boolean {
  if (!cell || cell.v === undefined || cell.v === null) return true;
  if (cell.t === 'z' || cell.t === 'e') return true;
  return typeof cell.v === 'string' && cell.v.trim() === '';
}

/** A cell as Excel shows it. */
function displayText(cell: XLSX.CellObject): string {
  return cell.w ?? String(cell.v);
}

/**
 * The first row with a value is the header. Columns and rows with no value
 * at all are left out, wherever the sheet's used range starts.
 */
function layoutOf(sheet: XLSX.WorkSheet): Layout | null {
  const cells = cellsOf(sheet);
  const columns = new Set<number>();
  const rows: number[] = [];
  let header = -1;
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    if (!row) continue;
    let filled = false;
    for (let c = 0; c < row.length; c++) {
      if (!isEmpty(row[c])) {
        filled = true;
        columns.add(c);
      }
    }
    if (!filled) continue;
    if (header < 0) header = r;
    else rows.push(r);
  }
  if (header < 0) return null;
  return { header, rows, columns: [...columns].sort((a, b) => a - b) };
}

/**
 * Column names from the header row: its text with runs of whitespace made
 * one space, `Column C` for a blank one. Names are unique ignoring case, as
 * DuckDB reads them, and never the table's own `__rowid__`.
 */
function columnNames(sheet: XLSX.WorkSheet, layout: Layout): string[] {
  const headerRow = cellsOf(sheet)[layout.header] ?? [];
  const taken = new Set(['__rowid__']);
  return layout.columns.map((c) => {
    const cell = headerRow[c];
    const base = isEmpty(cell)
      ? `Column ${XLSX.utils.encode_col(c)}`
      : displayText(cell!).trim().replace(/\s+/g, ' ');
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    taken.add(name.toLowerCase());
    return name;
  });
}

function summarize(book: XLSX.WorkBook): SheetSummary[] {
  const sheets: SheetSummary[] = [];
  book.SheetNames.forEach((name, index) => {
    const sheet = book.Sheets[name];
    // Chart sheets and macro sheets hold no table.
    if (!sheet || (sheet['!type'] && sheet['!type'] !== 'sheet')) return;
    // A header with nothing under it is no table either.
    const layout = layoutOf(sheet);
    if (!layout || layout.rows.length === 0) return;
    sheets.push({
      name,
      rows: layout.rows.length,
      columns: layout.columns.length,
      names: columnNames(sheet, layout),
      hidden: Boolean(book.Workbook?.Sheets?.[index]?.Hidden),
    });
  });
  return sheets;
}

/** What a column holds, to write every value of it the same way. */
type Kind = 'empty' | 'number' | 'boolean' | 'text' | 'date' | 'datetime' | 'time' | 'mixed';

/** A number cell that Excel shows as a date or a time. */
function isDateCell(cell: XLSX.CellObject): boolean {
  return cell.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z) === true;
}

/** A date cell as an Excel serial number: days since 1900 (or 1904). */
function serialOf(cell: XLSX.CellObject): number {
  if (cell.v instanceof Date) {
    // A native date, as an OpenDocument sheet can hold: its UTC fields are
    // the ones written.
    return cell.v.getTime() / 86_400_000 + 25_569;
  }
  return Number(cell.v);
}

function kindOf(cell: XLSX.CellObject): Exclude<Kind, 'empty' | 'mixed' | 'datetime' | 'time'> {
  if (cell.t === 'b') return 'boolean';
  if (cell.t === 'd' || isDateCell(cell)) return 'date';
  if (cell.t === 'n') return 'number';
  return 'text';
}

function columnKind(cells: Cell[][], rows: number[], c: number): Kind {
  let kind: Kind = 'empty';
  let timeOnly = true;
  let withTime = false;
  for (const r of rows) {
    const cell = cells[r]?.[c];
    if (isEmpty(cell)) continue;
    const k = kindOf(cell!);
    if (kind === 'empty') kind = k;
    else if (kind !== k) return 'mixed';
    if (k === 'date') {
      const serial = serialOf(cell!);
      if (serial >= 1) timeOnly = false;
      if (Math.abs(serial - Math.round(serial)) * 86_400 >= 0.0005) withTime = true;
    }
  }
  if (kind !== 'date') return kind;
  if (timeOnly) return 'time';
  return withTime ? 'datetime' : 'date';
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** An Excel date serial as ISO text: `2025-03-31`, `2025-03-31 09:30:00`, `09:30:00`. */
function isoText(serial: number, kind: 'date' | 'datetime' | 'time', date1904: boolean): string {
  const d = XLSX.SSF.parse_date_code(serial, { date1904 }) as {
    y: number;
    m: number;
    d: number;
    H: number;
    M: number;
    S: number;
    u: number;
  } | null;
  if (!d) return '';
  const ms = Math.round(d.u * 1000);
  const time = `${pad(d.H)}:${pad(d.M)}:${pad(d.S)}${ms > 0 && ms < 1000 ? `.${pad(ms, 3)}` : ''}`;
  if (kind === 'time') return time;
  const date = `${pad(d.y, 4)}-${pad(d.m)}-${pad(d.d)}`;
  return kind === 'date' ? date : `${date} ${time}`;
}

/** One value as JSON, written as its column's kind says. */
function jsonValue(cell: Cell, kind: Kind, date1904: boolean): string {
  if (isEmpty(cell)) return 'null';
  const value = cell!.v;
  switch (kind) {
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'date':
    case 'datetime':
    case 'time':
      return JSON.stringify(isoText(serialOf(cell!), kind, date1904));
    case 'text':
      return JSON.stringify(String(value));
    default:
      // A column of several kinds is text throughout, each value as shown.
      return JSON.stringify(kindOf(cell!) === 'text' ? String(value) : displayText(cell!).trim());
  }
}

/**
 * The sheet as NDJSON. Each line is written out by hand, keys in the
 * header's order: an object literal would put a key like `2024` first.
 */
function toNDJSON(
  sheet: XLSX.WorkSheet,
  date1904: boolean,
): { blob: Blob; rows: number; columns: number } {
  const layout = layoutOf(sheet);
  if (!layout || layout.rows.length === 0) throw new Error('The sheet holds no rows of data');
  const cells = cellsOf(sheet);
  const keys = columnNames(sheet, layout).map((name) => `${JSON.stringify(name)}:`);
  const kinds = layout.columns.map((c) => columnKind(cells, layout.rows, c));
  const lines: string[] = [];
  for (const r of layout.rows) {
    const row = cells[r] ?? [];
    let line = '{';
    for (let i = 0; i < layout.columns.length; i++) {
      if (i > 0) line += ',';
      line += keys[i] + jsonValue(row[layout.columns[i]!], kinds[i]!, date1904);
    }
    lines.push(`${line}}\n`);
  }
  return {
    blob: new Blob(lines, { type: 'application/x-ndjson' }),
    rows: lines.length,
    columns: keys.length,
  };
}
