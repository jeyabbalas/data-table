/**
 * ExportQuery - Shared query building and row-fetching logic for export modules.
 *
 * Provides SQL query builders, batching, contiguous-range optimization, and
 * column resolution used by both CSV and JSON exporters.
 */

import type { ColumnSchema, Filter, SortColumn } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { quoteIdentifier, filtersToWhereClause } from '../filters/FilterSQL';

/** Bundles all state dependencies as plain values (not Signals) */
export interface ExportContext {
  bridge: WorkerBridge;
  filters: Filter[];
  sortColumns: SortColumn[];
  selectedRows: Set<number>;
  visibleColumns: string[];
  columnOrder: string[];
  schema: ColumnSchema[];
}

/** Number of rows to fetch per query batch */
export const BATCH_SIZE = 10_000;

/** Maximum number of selected-row indices per IN clause chunk */
export const INDEX_CHUNK_SIZE = 10_000;

type RowData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

/**
 * Resolve which columns to export based on the option value.
 *
 * Returns column names in the appropriate order, validated against the schema.
 */
export function resolveColumns(
  option: 'all' | 'visible' | string[],
  context: Pick<ExportContext, 'visibleColumns' | 'columnOrder' | 'schema'>
): string[] {
  if (option === 'visible') {
    return context.visibleColumns;
  }
  if (option === 'all') {
    return context.columnOrder;
  }
  // Explicit column list — validate against schema
  const schemaNames = new Set(context.schema.map((c) => c.name));
  return option.filter((name) => schemaNames.has(name));
}

/**
 * Detect whether a sorted array of indices forms a contiguous range.
 *
 * Returns the start and length if contiguous, or null otherwise.
 * The input must already be sorted ascending.
 */
export function isContiguousRange(
  sortedIndices: number[]
): { start: number; length: number } | null {
  if (sortedIndices.length === 0) return null;
  const start = sortedIndices[0];
  const length = sortedIndices.length;
  if (sortedIndices[length - 1] - start === length - 1) {
    return { start, length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// SQL query builders
// ---------------------------------------------------------------------------

export function buildOrderByClause(sortColumns: SortColumn[]): string {
  if (sortColumns.length === 0) return '';
  const parts = sortColumns.map(
    (s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`
  );
  return ` ORDER BY ${parts.join(', ')}`;
}

export function buildBaseQuery(
  tableName: string,
  columns: string[],
  filters: Filter[],
  sortColumns: SortColumn[],
  limit: number,
  offset: number
): string {
  const columnList = columns.map(quoteIdentifier).join(', ');
  let sql = `SELECT ${columnList} FROM ${quoteIdentifier(tableName)}`;

  if (filters.length > 0) {
    const where = filtersToWhereClause(filters);
    if (where) {
      sql += ` WHERE ${where}`;
    }
  }

  sql += buildOrderByClause(sortColumns);
  sql += ` LIMIT ${limit} OFFSET ${offset}`;
  return sql;
}

export function buildSelectedRowsQuery(
  tableName: string,
  columns: string[],
  filters: Filter[],
  sortColumns: SortColumn[],
  indices: number[]
): string {
  const columnList = columns.map(quoteIdentifier).join(', ');

  let overClause: string;
  if (sortColumns.length > 0) {
    const orderParts = sortColumns.map(
      (s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`
    );
    overClause = `ORDER BY ${orderParts.join(', ')}`;
  } else {
    overClause = '';
  }

  let innerSql = `SELECT ${columnList}, ROW_NUMBER() OVER(${overClause}) - 1 AS __row_idx__ FROM ${quoteIdentifier(tableName)}`;

  if (filters.length > 0) {
    const where = filtersToWhereClause(filters);
    if (where) {
      innerSql += ` WHERE ${where}`;
    }
  }

  const inList = indices.join(', ');
  return `WITH numbered AS (${innerSql}) SELECT ${columnList} FROM numbered WHERE __row_idx__ IN (${inList}) ORDER BY __row_idx__ ASC`;
}

// ---------------------------------------------------------------------------
// Generic row fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch all rows matching the given scope, calling `onBatch` for each batch
 * of result rows. Handles batching, scope-based WHERE, contiguous-range
 * optimization for selected rows, and abort checking.
 */
export async function fetchAllRows(
  tableName: string,
  columns: string[],
  scope: 'all' | 'filtered' | 'selected',
  context: ExportContext,
  onBatch: (rows: RowData[]) => void,
  signal?: AbortSignal
): Promise<void> {
  if (scope === 'selected') {
    await fetchSelectedRows(tableName, columns, context, onBatch, signal);
  } else {
    await fetchBatchedRows(tableName, columns, scope, context, onBatch, signal);
  }
}

async function fetchBatchedRows(
  tableName: string,
  columns: string[],
  scope: 'all' | 'filtered',
  context: ExportContext,
  onBatch: (rows: RowData[]) => void,
  signal?: AbortSignal
): Promise<void> {
  const filters = scope === 'filtered' ? context.filters : [];
  let offset = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Export aborted', 'AbortError');
    }

    const sql = buildBaseQuery(
      tableName,
      columns,
      filters,
      context.sortColumns,
      BATCH_SIZE,
      offset
    );

    const rows = await context.bridge.query<RowData>(sql, signal);
    if (rows.length > 0) {
      onBatch(rows);
    }

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
}

async function fetchSelectedRows(
  tableName: string,
  columns: string[],
  context: ExportContext,
  onBatch: (rows: RowData[]) => void,
  signal?: AbortSignal
): Promise<void> {
  if (context.selectedRows.size === 0) return;

  const sortedIndices = Array.from(context.selectedRows).sort((a, b) => a - b);
  const contiguous = isContiguousRange(sortedIndices);

  if (contiguous) {
    const filters = context.filters;
    let offset = contiguous.start;
    let remaining = contiguous.length;

    while (remaining > 0) {
      if (signal?.aborted) {
        throw new DOMException('Export aborted', 'AbortError');
      }

      const limit = Math.min(remaining, BATCH_SIZE);
      const sql = buildBaseQuery(
        tableName,
        columns,
        filters,
        context.sortColumns,
        limit,
        offset
      );

      const rows = await context.bridge.query<RowData>(sql, signal);
      if (rows.length > 0) {
        onBatch(rows);
      }

      remaining -= rows.length;
      offset += rows.length;

      if (rows.length < limit) break;
    }
  } else {
    for (let i = 0; i < sortedIndices.length; i += INDEX_CHUNK_SIZE) {
      if (signal?.aborted) {
        throw new DOMException('Export aborted', 'AbortError');
      }

      const chunk = sortedIndices.slice(i, i + INDEX_CHUNK_SIZE);
      const sql = buildSelectedRowsQuery(
        tableName,
        columns,
        context.filters,
        context.sortColumns,
        chunk
      );

      const rows = await context.bridge.query<RowData>(sql, signal);
      if (rows.length > 0) {
        onBatch(rows);
      }
    }
  }
}
