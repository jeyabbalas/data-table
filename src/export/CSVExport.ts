/**
 * CSVExport - Export table data as CSV
 *
 * Supports configurable scope (all/filtered/selected rows), column selection,
 * delimiter, and null value handling. Queries DuckDB in batches to handle
 * large datasets without excessive memory usage.
 */

import type { WorkerBridge } from '../data/WorkerBridge';
import type { TableState } from '../core/State';
import { resolveColumns, fetchAllRows } from './ExportQuery';
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
 * Escape a CSV field value per RFC 4180.
 *
 * If the field contains the delimiter, a double-quote, a newline, or a
 * carriage return, the entire field is wrapped in double-quotes and any
 * embedded double-quotes are doubled.
 */
export function escapeCSVField(value: string, delimiter: string): string {
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

/**
 * Convert a DuckDB result cell to its string representation for CSV.
 *
 * Produces raw, machine-readable values (no locale formatting).
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
 */
export function rowToCSVLine(
  row: Record<string, unknown>,
  columns: string[],
  delimiter: string,
  nullValue: string
): string {
  return columns
    .map((col) => escapeCSVField(formatCellValue(row[col], nullValue), delimiter))
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
  signal?: AbortSignal
): Promise<string> {
  if (!tableName) {
    throw new Error('No table loaded');
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
    lines.push(
      columns
        .map((col) => escapeCSVField(col, opts.delimiter))
        .join(opts.delimiter)
    );
  }

  await fetchAllRows(
    tableName,
    columns,
    opts.scope,
    context,
    (rows) => {
      for (const row of rows) {
        lines.push(rowToCSVLine(row, columns, opts.delimiter, opts.nullValue));
      }
    },
    signal
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
    columnOrder: state.columnOrder.get(),
    schema: state.schema.get(),
  };

  return exportToCSV(tableName, options ?? {}, context, signal);
}
