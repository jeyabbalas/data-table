/**
 * CSVExport - Export table data as CSV
 *
 * Supports configurable scope (all/filtered/selected rows), column selection,
 * delimiter, and null value handling. Queries DuckDB in batches to handle
 * large datasets without excessive memory usage.
 *
 * A nested value (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) is written as
 * standard JSON: `[56,3,91]`, `{"x":1.25,"tier":"bronze"}`, a MAP as an
 * object in key order, a UNION as `{"tag":value}`. Every digit is kept, and
 * NaN and ±Infinity, which JSON cannot hold, are `null`. A JSON column is
 * written as its text, as any text.
 *
 * Dates and times are DuckDB's text (see `exportColumnRead` in
 * ExportQuery.ts), ISO 8601 with a space between date and time:
 * `2024-01-02`, `03:04:05.5`, `2024-01-02 03:04:05.123456`. A DATE or
 * TIMESTAMP is written in the form spreadsheets read; a TIMESTAMP WITH
 * TIME ZONE is in UTC and keeps its `Z` (`2024-01-02 03:04:05.5Z`), which
 * some spreadsheets show as text. `infinity` and BC dates
 * (`0044-03-15 (BC)`) are as DuckDB writes them, and the formula guard
 * writes `-infinity` as `'-infinity` (see {@link neutralizeFormulaPrefix}).
 *
 * @example
 * import { exportFromState } from '@jeyabbalas/data-table/advanced';
 *
 * const csv = await exportFromState(table.state, table.bridge, {
 *   scope: 'filtered',
 *   columns: 'all',
 *   includeHeaders: true,
 *   delimiter: ',',
 *   nullValue: '',
 * });
 * // `csv` is a string you can drop into a Blob, write to disk, etc.
 *
 * @see exportToCSV for the lower-level row-array API
 * @see exportJSONFromState
 * @see exportParquetFromState
 * @see copyToClipboard
 */

import { ExportError } from '../core/errors';
import { toStandardJson } from '../core/jsonTree';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { resolveColumns, fetchAllRows, exportJsonColumns } from './ExportQuery';
import type { ExportContext } from './ExportQuery';

// Re-export shared types so existing consumers are unaffected
export type { ExportContext } from './ExportQuery';
export { resolveColumns, isContiguousRange } from './ExportQuery';

/** Options controlling CSV export behavior */
export interface ExportOptions {
  /** Which rows to export */
  scope: 'all' | 'filtered' | 'selected';
  /** Which columns to include */
  columns: 'all' | string[];
  /** Whether to include a header row */
  includeHeaders: boolean;
  /** Field delimiter character */
  delimiter: string;
  /** String to use for NULL values */
  nullValue: string;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  scope: 'all',
  columns: 'all',
  includeHeaders: true,
  delimiter: ',',
  nullValue: '',
};

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Cells whose first character is one of these execute as a formula when the
 * CSV is opened in Excel, LibreOffice Calc, or Google Sheets — the OWASP
 * "CSV injection" / "formula injection" vector. We neutralise by prepending
 * a single quote so the spreadsheet treats the cell as text.
 *
 * `\t` and `\r` are listed because Excel's CSV importer can interpret a
 * leading tab/CR as a continuation of a previous formula cell.
 */
const FORMULA_TRIGGER_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Prepend a single quote when the cell starts with a spreadsheet formula
 * trigger character. Returns the input unchanged otherwise. Idempotent:
 * an already-escaped value (`'=...`) is left alone because the second
 * character is the trigger; only the leading character is inspected.
 */
export function neutralizeFormulaPrefix(value: string): string {
  if (value.length === 0) return value;
  const first = value.charAt(0);
  for (const trigger of FORMULA_TRIGGER_PREFIXES) {
    if (first === trigger) return `'${value}`;
  }
  return value;
}

/**
 * Escape a CSV field value per RFC 4180 plus formula-injection neutralisation.
 *
 * The formula-injection step prepends a single quote to cells whose first
 * character is `=`, `+`, `-`, `@`, `\t`, or `\r` (see {@link neutralizeFormulaPrefix}).
 * After that, RFC 4180 wrapping kicks in: if the (possibly prefixed) field
 * contains the delimiter, a double-quote, a newline, or a carriage return,
 * the entire field is wrapped in double-quotes and any embedded double-quotes
 * are doubled.
 */
export function escapeCSVField(value: string, delimiter: string): string {
  return quoteCSVField(neutralizeFormulaPrefix(value), delimiter);
}

/**
 * RFC 4180 quoting alone: wrap the field in double-quotes, doubling the
 * double-quotes inside, when it contains the delimiter, a double-quote, a
 * newline or a carriage return.
 */
function quoteCSVField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** JSON text that is a number and nothing else: `-5`, `-1.5e-7`. */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * The CSV field for a nested value, from the exact JSON text the export
 * reads it as (`jsonValueSQL`): the text made standard JSON by
 * `toStandardJson` (bare `NaN`, `Infinity` and `-Infinity` outside strings
 * become `null`; every digit is kept, so a HUGEINT keeps all 39), then
 * escaped as any field.
 *
 * Formula neutralization (see {@link neutralizeFormulaPrefix}) is kept, and
 * leaves every container alone: JSON text from DuckDB starts with `[`, `{`,
 * `"`, a digit, `-`, `t`, `f` or `n`, and only `-` is a trigger. Text that
 * starts with `-` is a number (a VARIANT holding `-5`), and a number alone,
 * with no operator, reference or `|` to carry a formula, is what a
 * spreadsheet reads as a number; prefixing it with `'` would make the cell
 * invalid JSON. So a field that is exactly a JSON number is written without
 * the prefix, and anything else goes through it as any cell does.
 */
function jsonCSVField(json: string, delimiter: string): string {
  const text = toStandardJson(json);
  return JSON_NUMBER.test(text) ? quoteCSVField(text, delimiter) : escapeCSVField(text, delimiter);
}

/**
 * Convert a DuckDB result cell to its string representation for CSV.
 *
 * Produces raw, machine-readable values (no locale formatting):
 *
 * | Input                    | Output                                        |
 * | ------------------------ | --------------------------------------------- |
 * | `null`/`undefined`       | `nullValue`                                   |
 * | `boolean`                | `'true'` / `'false'`                          |
 * | `bigint`, `number`       | `String(value)`: `9007199254740993`, `NaN`    |
 * | `string`                 | unchanged, a date or time's text among them   |
 * | a custom bridge's `Date` | ISO 8601 UTC string, `2024-06-15T12:30:00.000Z` |
 * | other                    | `String(value)`                               |
 *
 * The library's own bridge returns no `Date`: an export reads date and
 * time columns as DuckDB's text (see the module comment). A `bridge` of
 * your own in `ExportContext` may return one.
 */
export function formatCellValue(value: unknown, nullValue: string): string {
  if (value === null || value === undefined) {
    return nullValue;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

/**
 * Convert a single result row to a CSV line.
 *
 * @param jsonColumns - Columns whose values are a nested value's JSON text
 *   (`exportJsonColumns` in ExportQuery.ts), written as standard JSON; see
 *   the module comment. A NULL is `nullValue`, as in any column.
 */
export function rowToCSVLine(
  row: Record<string, unknown>,
  columns: string[],
  delimiter: string,
  nullValue: string,
  jsonColumns?: ReadonlySet<string>,
): string {
  return columns
    .map((col) => {
      const value = row[col];
      if (typeof value === 'string' && jsonColumns?.has(col)) {
        return jsonCSVField(value, delimiter);
      }
      return escapeCSVField(formatCellValue(value, nullValue), delimiter);
    })
    .join(delimiter);
}

// ---------------------------------------------------------------------------
// Main export functions
// ---------------------------------------------------------------------------

/**
 * Export table data as a CSV string.
 *
 * @param tableName - DuckDB table name
 * @param options   - Export configuration (merged with defaults)
 * @param context   - State dependencies as plain values
 * @param signal    - Optional AbortSignal for cancellation
 * @returns CSV string
 */
export async function exportToCSV(
  tableName: string,
  options: Partial<ExportOptions>,
  context: ExportContext,
  signal?: AbortSignal,
): Promise<string> {
  if (!tableName) {
    throw new ExportError('No table loaded', { code: 'NO_TABLE_LOADED' });
  }

  const opts: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const columns = resolveColumns(opts.columns, context);

  if (columns.length === 0) {
    return '';
  }

  // Check abort before starting
  if (signal?.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  const lines: string[] = [];

  // Header row
  if (opts.includeHeaders) {
    lines.push(columns.map((col) => escapeCSVField(col, opts.delimiter)).join(opts.delimiter));
  }

  // Nested columns arrive as their JSON text (see fetchAllRows).
  const jsonColumns = new Set(exportJsonColumns(columns, context.schema).keys());

  await fetchAllRows(
    tableName,
    columns,
    opts.scope,
    context,
    (rows) => {
      for (const row of rows) {
        lines.push(rowToCSVLine(row, columns, opts.delimiter, opts.nullValue, jsonColumns));
      }
    },
    signal,
  );

  return lines.join('\n');
}

/**
 * Convenience wrapper that reads Signals from a TableState and delegates
 * to `exportToCSV`.
 */
export async function exportFromState(
  state: TableState,
  bridge: WorkerBridge,
  options?: Partial<ExportOptions>,
  signal?: AbortSignal,
): Promise<string> {
  const tableName = state.tableName.get();
  if (!tableName) {
    throw new ExportError('No table loaded', { code: 'NO_TABLE_LOADED' });
  }

  const context: ExportContext = {
    bridge,
    filters: state.filters.get(),
    sortColumns: state.sortColumns.get(),
    selectedRows: state.selectedRows.get(),
    columnOrder: state.columnOrder.get(),
    schema: state.schema.get(),
  };

  return exportToCSV(tableName, options ?? {}, context, signal);
}
