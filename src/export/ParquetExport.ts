/**
 * ParquetExport - Export table data as Parquet
 *
 * Leverages DuckDB's native COPY TO command to produce Parquet files
 * entirely within the Web Worker. Returns the binary file as a Uint8Array.
 */

import { ExportError } from '../core/errors';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import {
  resolveColumns,
  isContiguousRange,
  buildSelectQuery,
  buildSelectedRowsQuery,
} from './ExportQuery';
import type { ExportContext } from './ExportQuery';

export type { ExportContext } from './ExportQuery';

/** Options controlling Parquet export behavior */
export interface ParquetExportOptions {
  /** Which rows to export */
  scope: 'all' | 'filtered' | 'selected';
  /** Which columns to include */
  columns: 'all' | string[];
}

const DEFAULT_PARQUET_OPTIONS: ParquetExportOptions = {
  scope: 'all',
  columns: 'all',
};

/**
 * Build the SELECT query for the Parquet COPY command.
 *
 * Exported for testability — returns the inner SQL that will be wrapped
 * in `COPY (...) TO` by the worker.
 */
export function buildParquetQuery(
  tableName: string,
  columns: string[],
  opts: ParquetExportOptions,
  context: ExportContext,
): string {
  const filters = opts.scope === 'filtered' ? context.filters : [];

  if (opts.scope === 'selected') {
    if (context.selectedRows.size === 0) {
      // Produce an empty result set with the correct schema
      return buildSelectQuery(tableName, columns, [], []) + ' WHERE FALSE';
    }

    const sortedIndices = Array.from(context.selectedRows).sort((a, b) => a - b);
    const contiguous = isContiguousRange(sortedIndices);

    if (contiguous) {
      return (
        buildSelectQuery(tableName, columns, context.filters, context.sortColumns) +
        ` LIMIT ${contiguous.length} OFFSET ${contiguous.start}`
      );
    }

    // Non-contiguous: CTE with ROW_NUMBER
    return buildSelectedRowsQuery(
      tableName,
      columns,
      context.filters,
      context.sortColumns,
      sortedIndices,
    );
  }

  // 'all' scope ignores filters; 'filtered' applies them
  return buildSelectQuery(tableName, columns, filters, context.sortColumns);
}

/**
 * Export table data as a Parquet file.
 *
 * @param tableName - DuckDB table name
 * @param options   - Export configuration (merged with defaults)
 * @param context   - State dependencies as plain values
 * @param signal    - Optional AbortSignal for cancellation
 * @returns Parquet file contents as Uint8Array
 */
export async function exportToParquet(
  tableName: string,
  options: Partial<ParquetExportOptions>,
  context: ExportContext,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!tableName) {
    throw new ExportError('No table loaded', { code: 'NO_TABLE_LOADED' });
  }

  const opts: ParquetExportOptions = { ...DEFAULT_PARQUET_OPTIONS, ...options };
  const columns = resolveColumns(opts.columns, context);

  if (columns.length === 0) {
    // Export an empty Parquet with no columns — use a dummy query
    // DuckDB requires at least one column in COPY, so return an empty buffer
    return new Uint8Array(0);
  }

  if (signal?.aborted) {
    throw new DOMException('Export aborted', 'AbortError');
  }

  const sql = buildParquetQuery(tableName, columns, opts, context);
  return context.bridge.exportToBuffer(sql, 'parquet', signal);
}

/**
 * Convenience wrapper that reads Signals from a TableState and delegates
 * to `exportToParquet`.
 */
export async function exportParquetFromState(
  state: TableState,
  bridge: WorkerBridge,
  options?: Partial<ParquetExportOptions>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
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

  return exportToParquet(tableName, options ?? {}, context, signal);
}
