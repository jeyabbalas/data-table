/**
 * JSONExport - Export table data as JSON
 *
 * Supports two output formats:
 * - **array**: Standard JSON array of objects (`[{...}, {...}]`)
 * - **ndjson**: Newline-delimited JSON (one object per line)
 *
 * Values are output as native JSON types (numbers, booleans, null) rather
 * than converting everything to strings as CSV does.
 */

import type { WorkerBridge } from '../data/WorkerBridge';
import type { TableState } from '../core/State';
import { resolveColumns, fetchAllRows } from './ExportQuery';
import type { ExportContext } from './ExportQuery';

export type { ExportContext } from './ExportQuery';

/** Options controlling JSON export behavior */
export interface JSONExportOptions {
  /** Which rows to export */
  scope: 'all' | 'filtered' | 'selected';
  /** Which columns to include */
  columns: 'all' | 'visible' | string[];
  /** Output format: JSON array or newline-delimited JSON */
  format: 'array' | 'ndjson';
  /** Pretty-print the output (array format only) */
  pretty: boolean;
}

const DEFAULT_JSON_OPTIONS: JSONExportOptions = {
  scope: 'all',
  columns: 'visible',
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
 */
export function formatRowForJSON(
  row: Record<string, unknown>,
  columns: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const col of columns) {
    result[col] = formatValueForJSON(row[col]);
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
  signal?: AbortSignal
): Promise<string> {
  if (!tableName) {
    throw new Error('No table loaded');
  }

  const opts: JSONExportOptions = { ...DEFAULT_JSON_OPTIONS, ...options };
  const columns = resolveColumns(opts.columns, context);

  if (columns.length === 0) {
    return opts.format === 'array' ? '[]' : '';
  }

  if (signal?.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  if (opts.format === 'ndjson') {
    return exportNDJSON(tableName, columns, opts, context, signal);
  }
  return exportArray(tableName, columns, opts, context, signal);
}

async function exportArray(
  tableName: string,
  columns: string[],
  opts: JSONExportOptions,
  context: ExportContext,
  signal?: AbortSignal
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
        const formatted = formatRowForJSON(row, columns);
        const json = JSON.stringify(formatted);
        rowStrings.push(opts.pretty ? `${indent}${json}` : json);
      }
    },
    signal
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
  opts: JSONExportOptions,
  context: ExportContext,
  signal?: AbortSignal
): Promise<string> {
  const lines: string[] = [];

  await fetchAllRows(
    tableName,
    columns,
    opts.scope,
    context,
    (rows) => {
      for (const row of rows) {
        const formatted = formatRowForJSON(row, columns);
        lines.push(JSON.stringify(formatted));
      }
    },
    signal
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
  signal?: AbortSignal
): Promise<string> {
  const tableName = state.tableName.get();
  if (!tableName) {
    throw new Error('No table loaded');
  }

  const context: ExportContext = {
    bridge,
    filters: state.filters.get(),
    sortColumns: state.sortColumns.get(),
    selectedRows: state.selectedRows.get(),
    visibleColumns: state.visibleColumns.get(),
    columnOrder: state.columnOrder.get(),
    schema: state.schema.get(),
  };

  return exportToJSON(tableName, options ?? {}, context, signal);
}
