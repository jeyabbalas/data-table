/**
 * JSONExport - Export table data as JSON
 *
 * Supports two output formats:
 * - **array**: Standard JSON array of objects (`[{...}, {...}]`)
 * - **ndjson**: Newline-delimited JSON (one object per line)
 *
 * Values are output as native JSON types (numbers, booleans, null) rather
 * than converting everything to strings as CSV does.
 *
 * A nested value (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) is written as a
 * real JSON structure, read from its exact JSON text by the type it has:
 * lists and arrays as arrays, structs as objects (an unnamed struct as an
 * array), a MAP as an object keyed by the key's text, a UNION as
 * `{"tag": value}`. An integer in it beyond ±(2^53−1) is its decimal
 * string, every digit kept, and NaN and ±Infinity are `null`, as
 * {@link formatValueForJSON} writes a bigint and a number. A JSON column's
 * value is written as its text, a string, as any text.
 *
 * Dates and times are ISO 8601 strings, read as DuckDB's text (see
 * `exportColumnRead` in ExportQuery.ts): `"2024-01-02"`, `"03:04:05.5"`,
 * and a timestamp with `T` between date and time,
 * `"2024-01-02T03:04:05.123456"`, a TIMESTAMP WITH TIME ZONE in UTC with
 * `Z`. `infinity`, `-infinity` and BC dates stay DuckDB's text, as do the
 * dates and times inside a nested value.
 */

import type { DuckDBTypeNode } from '../core/duckdbType';
import { ExportError } from '../core/errors';
import { setOwnProperty } from '../core/ownProperty';
import type { TableState } from '../core/State';
import { readJsonValue } from '../data/cellValue';
import type { WorkerBridge } from '../data/WorkerBridge';
import {
  resolveColumns,
  fetchAllRows,
  exportJsonColumns,
  exportTimestampColumns,
} from './ExportQuery';
import type { ExportContext } from './ExportQuery';

export type { ExportContext } from './ExportQuery';

/** Options controlling JSON export behavior */
export interface JSONExportOptions {
  /** Which rows to export */
  scope: 'all' | 'filtered' | 'selected';
  /** Which columns to include */
  columns: 'all' | string[];
  /** Output format: JSON array or newline-delimited JSON */
  format: 'array' | 'ndjson';
  /** Pretty-print the output (array format only) */
  pretty: boolean;
}

const DEFAULT_JSON_OPTIONS: JSONExportOptions = {
  scope: 'all',
  columns: 'all',
  format: 'array',
  pretty: false,
};

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/**
 * Convert a DuckDB result cell to a JSON-safe value.
 *
 * Preserves native JSON types (numbers, booleans, null) unlike CSV which
 * converts everything to strings.
 *
 * **Type-coercion table:**
 *
 * | Input              | Output                                              |
 * | ------------------ | --------------------------------------------------- |
 * | `null`/`undefined` | `null`                                              |
 * | `boolean`          | `boolean` (unchanged)                               |
 * | `bigint` in safe range | `number` (lossless up to `±2^53−1`)             |
 * | `bigint` outside safe range | `string` (decimal — preserves precision)   |
 * | `number` (`NaN`/`Infinity`) | `null` (JSON cannot represent these)       |
 * | `number`           | `number` (unchanged)                                |
 * | `string`           | `string` (unchanged), a date or time's text among them |
 * | a custom bridge's `Date` | ISO 8601 UTC string (`"2024-06-15T12:30:00.000Z"`) |
 * | other              | `String(value)` (best-effort)                       |
 *
 * The library's own bridge returns no `Date`: an export reads date and
 * time columns as DuckDB's text (see the module comment), and
 * {@link formatRowForJSON} puts a timestamp's `T` in. A `bridge` of your
 * own in `ExportContext` may return one.
 *
 * **BigInt round-trip caveat.** A value just over the safe range
 * (e.g. `9007199254740993n`) is emitted as the string `"9007199254740993"`.
 * `JSON.parse` returns it as a string, not a `BigInt` — consumers who need
 * BigInt back must explicitly post-process. Within the safe range the
 * round-trip is lossless: `BigInt(JSON.parse(str)[i].field) === original`.
 */
export function formatValueForJSON(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    // Keep as number if within safe integer range; use string otherwise
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    return String(value);
  }
  if (typeof value === 'number') {
    // JSON doesn't support NaN or Infinity
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

/**
 * A timestamp's text from DuckDB as ISO 8601 writes it, with `T` between
 * date and time: `2024-01-02 03:04:05.5` is `2024-01-02T03:04:05.5`, and
 * `12345-01-02 03:04:05Z` is `12345-01-02T03:04:05Z`. Only a space before
 * a digit becomes `T`, so `infinity` and a BC timestamp,
 * `0044-03-15 (BC) 10:00:00`, are left as DuckDB writes them, which DuckDB
 * reads back.
 */
export function isoDateTime(text: string): string {
  const space = text.indexOf(' ');
  const next = text.charCodeAt(space + 1);
  // 0x30 to 0x39: '0' to '9'.
  return space > 0 && next >= 0x30 && next <= 0x39
    ? `${text.slice(0, space)}T${text.slice(space + 1)}`
    : text;
}

/**
 * Convert a result row to a JSON-safe object containing only the requested
 * columns in the specified order.
 *
 * @param jsonColumns - Columns whose values are a nested value's JSON text,
 *   each with its parsed DuckDB type (`exportJsonColumns` in
 *   ExportQuery.ts). Each is written as a real structure, read as
 *   `materialize` reads it in its `'export'` mode (`readJsonValue`, which
 *   uses `JSON.parse` where that gives the same values): see the module
 *   comment. A NULL is `null`.
 * @param timestampColumns - Columns whose values are a timestamp's text
 *   from DuckDB (`exportTimestampColumns` in ExportQuery.ts), written with
 *   `T` between date and time by {@link isoDateTime}.
 */
export function formatRowForJSON(
  row: Record<string, unknown>,
  columns: string[],
  jsonColumns?: ReadonlyMap<string, DuckDBTypeNode>,
  timestampColumns?: ReadonlySet<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const col of columns) {
    const value = row[col];
    const type = jsonColumns?.get(col);
    let formatted: unknown;
    if (typeof value !== 'string') {
      formatted = formatValueForJSON(value);
    } else if (type !== undefined) {
      formatted = readJsonValue(value, type, 'export');
    } else {
      formatted = timestampColumns?.has(col) === true ? isoDateTime(value) : value;
    }
    setOwnProperty(result, col, formatted);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main export functions
// ---------------------------------------------------------------------------

/**
 * Export table data as a JSON string.
 *
 * @param tableName - DuckDB table name
 * @param options   - Export configuration (merged with defaults)
 * @param context   - State dependencies as plain values
 * @param signal    - Optional AbortSignal for cancellation
 * @returns JSON string (array or NDJSON format)
 */
export async function exportToJSON(
  tableName: string,
  options: Partial<JSONExportOptions>,
  context: ExportContext,
  signal?: AbortSignal,
): Promise<string> {
  if (!tableName) {
    throw new ExportError('No table loaded', { code: 'NO_TABLE_LOADED' });
  }

  const opts: JSONExportOptions = { ...DEFAULT_JSON_OPTIONS, ...options };
  const columns = resolveColumns(opts.columns, context);

  if (columns.length === 0) {
    return opts.format === 'array' ? '[]' : '';
  }

  if (signal?.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  // Nested columns arrive as their JSON text, and timestamps as DuckDB's
  // text (see fetchAllRows).
  const jsonColumns = exportJsonColumns(columns, context.schema);
  const timestampColumns = exportTimestampColumns(columns, context.schema);

  if (opts.format === 'ndjson') {
    return exportNDJSON(tableName, columns, jsonColumns, timestampColumns, opts, context, signal);
  }
  return exportArray(tableName, columns, jsonColumns, timestampColumns, opts, context, signal);
}

async function exportArray(
  tableName: string,
  columns: string[],
  jsonColumns: ReadonlyMap<string, DuckDBTypeNode>,
  timestampColumns: ReadonlySet<string>,
  opts: JSONExportOptions,
  context: ExportContext,
  signal?: AbortSignal,
): Promise<string> {
  const rowStrings: string[] = [];
  const indent = opts.pretty ? '  ' : '';
  const separator = opts.pretty ? ',\n' : ',';

  await fetchAllRows(
    tableName,
    columns,
    opts.scope,
    context,
    (rows) => {
      for (const row of rows) {
        const formatted = formatRowForJSON(row, columns, jsonColumns, timestampColumns);
        if (opts.pretty) {
          // Pretty-print each object with indentation, then indent the whole block
          const json = JSON.stringify(formatted, null, 2);
          const indented = json.replace(/\n/g, `\n${indent}`);
          rowStrings.push(`${indent}${indented}`);
        } else {
          rowStrings.push(JSON.stringify(formatted));
        }
      }
    },
    signal,
  );

  if (rowStrings.length === 0) {
    return '[]';
  }

  if (opts.pretty) {
    return `[\n${rowStrings.join(separator)}\n]`;
  }
  return `[${rowStrings.join(separator)}]`;
}

async function exportNDJSON(
  tableName: string,
  columns: string[],
  jsonColumns: ReadonlyMap<string, DuckDBTypeNode>,
  timestampColumns: ReadonlySet<string>,
  opts: JSONExportOptions,
  context: ExportContext,
  signal?: AbortSignal,
): Promise<string> {
  const lines: string[] = [];

  await fetchAllRows(
    tableName,
    columns,
    opts.scope,
    context,
    (rows) => {
      for (const row of rows) {
        const formatted = formatRowForJSON(row, columns, jsonColumns, timestampColumns);
        lines.push(JSON.stringify(formatted));
      }
    },
    signal,
  );

  return lines.join('\n');
}

/**
 * Convenience wrapper that reads Signals from a TableState and delegates
 * to `exportToJSON`.
 */
export async function exportJSONFromState(
  state: TableState,
  bridge: WorkerBridge,
  options?: Partial<JSONExportOptions>,
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

  return exportToJSON(tableName, options ?? {}, context, signal);
}
