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
 */

import type { DuckDBTypeNode } from '../core/duckdbType';
import { ExportError } from '../core/errors';
import { materialize, parseJsonTree } from '../core/jsonTree';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { resolveColumns, fetchAllRows, exportJsonColumns } from './ExportQuery';
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
 * | `Date`             | ISO 8601 UTC string (e.g. `"2024-06-15T12:30:00.000Z"`) |
 * | other              | `String(value)` (best-effort)                       |
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
 * Convert a result row to a JSON-safe object containing only the requested
 * columns in the specified order.
 *
 * @param jsonColumns - Columns whose values are a nested value's JSON text,
 *   each with its parsed DuckDB type (`exportJsonColumns` in
 *   ExportQuery.ts). Each is written as a real structure, read by
 *   `materialize` in its `'export'` mode: see the module comment. A NULL is
 *   `null`.
 */
export function formatRowForJSON(
  row: Record<string, unknown>,
  columns: string[],
  jsonColumns?: ReadonlyMap<string, DuckDBTypeNode>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const col of columns) {
    const value = row[col];
    const type = jsonColumns?.get(col);
    const formatted =
      type !== undefined && typeof value === 'string'
        ? materialize(parseJsonTree(value).root, type, 'export')
        : formatValueForJSON(value);
    if (col === '__proto__') {
      // Assigning would set the object's prototype, not a key.
      Object.defineProperty(result, col, {
        value: formatted,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      result[col] = formatted;
    }
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

  // Nested columns arrive as their JSON text (see fetchAllRows).
  const jsonColumns = exportJsonColumns(columns, context.schema);

  if (opts.format === 'ndjson') {
    return exportNDJSON(tableName, columns, jsonColumns, opts, context, signal);
  }
  return exportArray(tableName, columns, jsonColumns, opts, context, signal);
}

async function exportArray(
  tableName: string,
  columns: string[],
  jsonColumns: ReadonlyMap<string, DuckDBTypeNode>,
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
        const formatted = formatRowForJSON(row, columns, jsonColumns);
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
        const formatted = formatRowForJSON(row, columns, jsonColumns);
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
