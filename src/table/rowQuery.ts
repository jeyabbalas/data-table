/**
 * SQL for one block of grid rows.
 *
 * Kept free of DOM code so the real-DuckDB tests run exactly the statement
 * `TableBody.fetchBlock` sends.
 */

import {
  ROWID_COLUMN,
  isNestedType,
  type ColumnSchema,
  type Filter,
  type SortColumn,
} from '../core/types';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';

export interface RowQuery {
  tableName: string;
  /** Visible columns, in display order. */
  columns: string[];
  sortColumns: SortColumn[];
  filters: Filter[];
  /** Position of the block's first row in the sorted, filtered view. */
  offset: number;
  limit: number;
  schema?: ColumnSchema[] | undefined;
  /**
   * Fetch by a `__rowid__` range instead of by position. Only correct with
   * no filters and no user sort; `TableBody.useRowidFastPath` decides.
   */
  rowidFastPath: boolean;
}

/**
 * Whether the grid reads `column` as DuckDB's text for it. INTERVAL values
 * would otherwise arrive as Arrow MonthDayNano objects, and nested values
 * (lists, arrays, structs, maps, unions) as arrays and objects that a cell
 * shows as `1,2,3` or `[object Object]`. As text they read as they do in
 * the header chart's labels: `[56, 3, 91]`, `{'x': 1.0, 'tier': bronze}`.
 */
function readsAsText(column: ColumnSchema | undefined): boolean {
  return column !== undefined && (column.type === 'interval' || isNestedType(column.originalType));
}

/**
 * The `SELECT` list for `columns`, `__rowid__` first.
 *
 * Quotes column names and casts INTERVAL and nested columns to VARCHAR (see
 * {@link readsAsText}). Drops any accidental `__rowid__` in `columns`, which
 * is always prepended (keeps the projection deterministic).
 */
function selectList(columns: readonly string[], schema: ColumnSchema[] | undefined): string {
  const byName = new Map<string, ColumnSchema>();
  for (const col of schema ?? []) byName.set(col.name, col);
  const parts: string[] = [quoteIdentifier(ROWID_COLUMN)];
  for (const col of columns) {
    if (col === ROWID_COLUMN) continue;
    const quoted = quoteIdentifier(col);
    parts.push(readsAsText(byName.get(col)) ? `CAST(${quoted} AS VARCHAR) AS ${quoted}` : quoted);
  }
  return parts.join(', ');
}

/** A {@link buildRowColumnsQuery} request. */
export interface RowColumnsQuery {
  tableName: string;
  /** Columns to read, besides `__rowid__`. */
  columns: readonly string[];
  /** The `__rowid__` of each row to read. */
  rowids: readonly number[];
  schema?: ColumnSchema[] | undefined;
}

/**
 * SQL for more columns of rows already fetched, found by their `__rowid__`.
 *
 * For a block whose rows are cached without columns rows now render. Reading
 * the rows by id skips the filter, the sort and the `OFFSET` that fetching
 * the block again would pay for, which on a sorted table is nearly all of it.
 * The result comes in no particular order: callers match rows by id.
 */
export function buildRowColumnsQuery(query: RowColumnsQuery): string {
  const ids = query.rowids.filter((id) => Number.isSafeInteger(id));
  const table = quoteIdentifier(query.tableName);
  const rowid = quoteIdentifier(ROWID_COLUMN);
  return `SELECT ${selectList(query.columns, query.schema)} FROM ${table} WHERE ${rowid} IN (${ids.join(', ')})`;
}

/**
 * Build the SQL for one block of rows.
 *
 * Always prepends the synthetic `__rowid__` column to the projection so
 * annotations (which key on rowId) can be resolved per visible-index
 * without a second query. The column is kept hidden in the grid via
 * `system: true` on its schema entry; the extra value adds negligible
 * overhead and lands in `rowDataCache` as `row['__rowid__']`.
 */
export function buildRowQuery(query: RowQuery): string {
  const { tableName, columns, sortColumns, filters, offset, limit, schema, rowidFastPath } = query;
  const table = quoteIdentifier(tableName);
  const rowid = quoteIdentifier(ROWID_COLUMN);
  const select = `SELECT ${selectList(columns, schema)} FROM ${table}`;

  // FAST PATH — no filters, no user sort: fetch the window by a range
  // predicate on the dense synthetic __rowid__ instead of LIMIT/OFFSET.
  //
  // Premise (verified at the call sites cited): every loader materializes
  // __rowid__ densely as `row_number() OVER () - 1` (0..N-1 — parquet.ts,
  // csv.ts, json.ts), and the derived-column VIEW preserves exactly the
  // base rows (`base t LEFT JOIN helper h ON t.__rowid__ = h.__rowid__`,
  // DerivedColumnManager). With no WHERE and no user sort, positional
  // index ≡ __rowid__, so the range predicate returns exactly the OFFSET
  // window — but as a zonemap-prunable scan (~ms at any scroll depth)
  // instead of a top-(offset+limit) sort that grows with depth. The code
  // that could break the premise is the table-rebuild path in
  // worker/loaders/common.ts; fetchBlock's density valve turns any
  // violation into slow-but-correct OFFSET pagination, never wrong rows.
  if (rowidFastPath) {
    let sql = `${select} WHERE ${rowid} >= ${offset} AND ${rowid} < ${offset + limit}`;
    // Scan order is not guaranteed, even for a single index range.
    sql += ` ORDER BY ${rowid} ASC`;
    sql += ` LIMIT ${limit}`; // defensive cap only
    return sql;
  }

  // Always order with __rowid__ as the final tiebreaker. DuckDB's ORDER BY
  // is non-deterministic for ties, so without a tiebreaker two paginated
  // queries over different LIMIT/OFFSET windows (which the scroll path
  // issues per aligned block as the viewport moves, see `ensureFetched` +
  // `fetchBlock`) can permute ties differently and return *different* rows
  // for the same logical positions — duplicating some rows across blocks
  // and dropping others. The cache write at
  // `rowDataCache.set(blockStart + i, row)` then holds shuffled data and
  // the user sees row contents change while scrolling. With no user sort
  // the order is `__rowid__` alone, so filter+scroll is deterministic
  // against any DuckDB parallel-scan permutation. Skipped if the user
  // already sorts on __rowid__ (they own the order and don't want a
  // redundant tail clause).
  const order = sortColumns.map((s) => ({
    column: quoteIdentifier(s.column),
    direction: s.direction.toUpperCase(),
  }));
  if (!sortColumns.some((s) => s.column === ROWID_COLUMN)) {
    order.push({ column: rowid, direction: 'ASC' });
  }
  const orderBy = (qualifier: string): string =>
    order.map((o) => `${qualifier}${o.column} ${o.direction}`).join(', ');

  const whereClause = filters.length > 0 ? filtersToWhereClause(filters) : '';
  const where = whereClause ? ` WHERE ${whereClause}` : '';

  // Sorted/filtered fetches have no closed form for "position k", so they
  // page with LIMIT/OFFSET — but in two phases. The subquery finds the
  // block's row ids by sorting only the sort keys and __rowid__; the outer
  // query then reads the visible columns for just those rows. Paging the
  // full projection instead makes DuckDB's top-N hold offset+limit
  // complete rows: a mid-table block of a sorted 5M × 40 table exhausted
  // the 3.1 GiB WASM memory limit that way, while this form takes under a
  // second and little extra memory. The OFFSET cost still grows with depth.
  //
  // The outer ORDER BY restores the subquery's order, and names the table
  // so that a sort column the projection casts (INTERVAL or nested →
  // VARCHAR) sorts by its value, as in the subquery, rather than by the
  // text alias.
  const page = `SELECT ${rowid} FROM ${table}${where} ORDER BY ${orderBy('')} LIMIT ${limit} OFFSET ${offset}`;
  return `${select} WHERE ${rowid} IN (${page}) ORDER BY ${orderBy(`${table}.`)}`;
}
