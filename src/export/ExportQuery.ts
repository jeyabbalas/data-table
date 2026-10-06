/**
 * ExportQuery - Shared query building and row-fetching logic for export modules.
 *
 * Provides SQL query builders, batching, contiguous-range optimization, and
 * column resolution used by both CSV and JSON exporters.
 *
 * CSV and JSON exports read some columns as text rather than as the values
 * Arrow returns (see {@link exportColumnRead}): nested values as exact JSON,
 * and a few scalars as DuckDB's text. Parquet export reads every column as
 * it is, since a Parquet file holds nested values natively.
 */

import { containsKind, dataTypeOf, parseDuckDBType, type DuckDBTypeNode } from '../core/duckdbType';
import { ROWID_COLUMN, type ColumnSchema, type Filter, type SortColumn } from '../core/types';
import { jsonValueSQL } from '../data/valueSql';
import type { WorkerBridge } from '../data/WorkerBridge';
import { quoteIdentifier, filtersToWhereClause } from '../filters/FilterSQL';

/** Bundles all state dependencies as plain values (not Signals) */
export interface ExportContext {
  bridge: WorkerBridge;
  filters: Filter[];
  sortColumns: SortColumn[];
  selectedRows: Set<number>;
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
 * When `option === 'all'`, library-synthesized system columns (e.g.
 * `__rowid__`) are excluded so default exports round-trip cleanly. Callers
 * that want system columns must pass them in an explicit string array.
 */
export function resolveColumns(
  option: 'all' | string[],
  context: Pick<ExportContext, 'columnOrder' | 'schema'>,
): string[] {
  if (option === 'all') {
    const systemNames = new Set(context.schema.filter((c) => c.system === true).map((c) => c.name));
    return systemNames.size === 0
      ? context.columnOrder
      : context.columnOrder.filter((n) => !systemNames.has(n));
  }
  // Explicit column list — validate against schema, but do NOT filter system
  // columns: the caller has explicitly opted in.
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
  sortedIndices: number[],
): { start: number; length: number } | null {
  if (sortedIndices.length === 0) return null;
  // After length===0 early-return, [0] and [length-1] are non-null.
  const start = sortedIndices[0]!;
  const length = sortedIndices.length;
  if (sortedIndices[length - 1]! - start === length - 1) {
    return { start, length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// How each column is read
// ---------------------------------------------------------------------------

/**
 * Scalar types a CSV or JSON export reads as DuckDB's text, by the
 * upper-case name `parseDuckDBType` gives them. Arrow carries their values
 * in a form no file can use: an INTERVAL as an `Int32Array` that does not
 * hold it (apache-arrow 17), and a BLOB, BIT, GEOMETRY or BIGNUM as bytes,
 * which a CSV cell would print as `170,187`. An ENUM value read through the
 * worker's cancellable query path (`conn.send`, as every `bridge.query`
 * runs) comes back `null` (duckdb-wasm 1.33), while its text is exact.
 */
const TEXT_SCALAR_NAMES: ReadonlySet<string> = new Set([
  'INTERVAL',
  'BLOB',
  'BYTEA',
  'BINARY',
  'VARBINARY',
  'BIT',
  'BITSTRING',
  'BIT VARYING',
  'GEOMETRY',
  'BIGNUM',
  'VARINT',
  'ENUM',
]);

/** How a CSV or JSON export reads a column: see {@link exportColumnRead}. */
export type ExportColumnRead = 'raw' | 'text' | 'json';

/**
 * How a CSV or JSON export reads `column`:
 *
 * - `'json'`: a nested value (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT), as
 *   exact JSON text from `jsonValueSQL`: `[1.25,2.5]`, `{"x":1,"tier":"b"}`,
 *   `{"num":42}` for a UNION. Arrow's own nested values are wrong for
 *   DECIMAL, HUGEINT and INTERVAL inside them, and a VARIANT cannot cross
 *   Arrow at all.
 * - `'text'`: INTERVAL, BLOB, BIT, GEOMETRY, BIGNUM and ENUM, as DuckDB's
 *   text, `CAST(c AS VARCHAR)`; see {@link TEXT_SCALAR_NAMES}.
 * - `'raw'`: everything else, as the query returns it. A JSON column is
 *   already text, and stays as it is.
 *
 * The type is read from `originalType`; a column the library types
 * `'nested'` is read as JSON whatever that says.
 */
export function exportColumnRead(column: ColumnSchema): ExportColumnRead {
  // `originalType` is required by the type, but a schema built by hand in
  // JavaScript may leave it out.
  const node = parseDuckDBType(column.originalType ?? '');
  if (column.type === 'nested' || dataTypeOf(node) === 'nested') return 'json';
  if (node.kind === 'scalar') return TEXT_SCALAR_NAMES.has(node.name) ? 'text' : 'raw';
  // A type the parser could not read follows the library's type for it.
  return node.kind === 'unknown' && column.type === 'interval' ? 'text' : 'raw';
}

/**
 * The columns of `columns` that an export reads as JSON text (see
 * {@link exportColumnRead}), each with its parsed type, for the exporters
 * to turn that text into cells. Parsed once per export, not once per row.
 */
export function exportJsonColumns(
  columns: readonly string[],
  schema: readonly ColumnSchema[],
): Map<string, DuckDBTypeNode> {
  const byName = new Map(schema.map((column) => [column.name, column] as const));
  const types = new Map<string, DuckDBTypeNode>();
  for (const name of columns) {
    const column = byName.get(name);
    if (column && exportColumnRead(column) === 'json') {
      types.set(name, parseDuckDBType(column.originalType ?? ''));
    }
  }
  return types;
}

/**
 * The select list for `columns`. Without `schema`, every column is read as
 * it is (the Parquet path, and callers from before projections existed).
 * With it, each column is read as {@link exportColumnRead} says, under its
 * own name: `CAST(to_json("tags") AS VARCHAR) AS "tags"`. A column the
 * schema does not know is read as it is.
 */
function selectList(
  columns: readonly string[],
  schema: readonly ColumnSchema[] | undefined,
): string {
  if (!schema) return columns.map(quoteIdentifier).join(', ');
  const byName = new Map(schema.map((column) => [column.name, column] as const));
  return columns
    .map((name) => {
      const quoted = quoteIdentifier(name);
      const column = byName.get(name);
      if (!column) return quoted;
      switch (exportColumnRead(column)) {
        case 'json':
          return `${jsonValueSQL(column, quoted)} AS ${quoted}`;
        case 'text':
          return `CAST(${quoted} AS VARCHAR) AS ${quoted}`;
        default:
          return quoted;
      }
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// SQL query builders
// ---------------------------------------------------------------------------

/**
 * The sort keys of an export query, each column qualified with the table,
 * and `__rowid__ ASC` last unless the user already sorts on it:
 * `"t"."name" ASC, "t"."__rowid__" ASC`.
 *
 * @param sortKeyColumns - Columns ordered by `create_sort_key(…)` instead,
 *   for a window: see {@link buildSelectedRowsQuery}.
 */
function orderByList(
  sortColumns: SortColumn[],
  tableName: string,
  sortKeyColumns?: ReadonlySet<string>,
): string {
  const table = quoteIdentifier(tableName);
  const parts = sortColumns.map((s) => {
    const column = `${table}.${quoteIdentifier(s.column)}`;
    const direction = s.direction.toUpperCase();
    // NULLS LAST is DuckDB's default order for both directions, as the
    // grid's plain ORDER BY gets it.
    return sortKeyColumns?.has(s.column)
      ? `create_sort_key(${column}, '${direction} NULLS LAST')`
      : `${column} ${direction}`;
  });
  if (!sortColumns.some((s) => s.column === ROWID_COLUMN)) {
    parts.push(`${table}.${quoteIdentifier(ROWID_COLUMN)} ASC`);
  }
  return parts.join(', ');
}

/** Whether `column`'s type is, or holds, a VARIANT: see {@link buildSelectedRowsQuery}. */
function holdsVariant(column: ColumnSchema): boolean {
  const node = parseDuckDBType(column.originalType ?? '');
  return node.kind === 'unknown'
    ? /\bVARIANT\b/i.test(node.sqlType)
    : containsKind(node, 'variant');
}

/**
 * Build an `ORDER BY` clause for export queries on `tableName`.
 *
 * Always appends `__rowid__ ASC` as the final tiebreaker (skipping the
 * append if the user already sorts on `__rowid__`). DuckDB's ORDER BY is
 * non-deterministic for ties, so without a tiebreaker:
 * - `fetchBatchedRows` issues `LIMIT … OFFSET …` queries with monotonically
 *   increasing OFFSET; ties at batch boundaries can duplicate or skip rows
 *   in the resulting CSV/JSON file.
 * - `buildSelectQuery` (single-shot Parquet export) produces files that
 *   differ in row order within tie groups across re-exports
 *   (reproducibility issue).
 *
 * Every column is qualified with the table: `ORDER BY "t"."tags" ASC,
 * "t"."__rowid__" ASC`. A column the select list reads as text keeps its
 * own name as the alias (`CAST(to_json("tags") AS VARCHAR) AS "tags"`), and
 * an unqualified `ORDER BY "tags"` binds to that alias, sorting rows by the
 * JSON text (`[10]` before `[9]`) rather than by the value as the grid does.
 * The table's name works for a derived-column VIEW as for a table.
 *
 * Mirrors the idiom used in `Actions.getColumnValues` (Actions.ts:1769) and
 * the loader's table-recreation paths (worker/loaders/common.ts).
 */
export function buildOrderByClause(sortColumns: SortColumn[], tableName: string): string {
  return ` ORDER BY ${orderByList(sortColumns, tableName)}`;
}

/**
 * Build a SELECT query without LIMIT/OFFSET.
 * Used by Parquet export where DuckDB handles the entire result set via COPY.
 *
 * @param schema - Read columns as {@link exportColumnRead} says; without
 *   it, every column is read as it is.
 */
export function buildSelectQuery(
  tableName: string,
  columns: string[],
  filters: Filter[],
  sortColumns: SortColumn[],
  schema?: readonly ColumnSchema[],
): string {
  let sql = `SELECT ${selectList(columns, schema)} FROM ${quoteIdentifier(tableName)}`;

  if (filters.length > 0) {
    const where = filtersToWhereClause(filters);
    if (where) {
      sql += ` WHERE ${where}`;
    }
  }

  sql += buildOrderByClause(sortColumns, tableName);
  return sql;
}

/**
 * Build one batch of an export: `LIMIT` rows from `OFFSET` in the sorted,
 * filtered view.
 *
 * Two steps, in one query: a subquery picks the batch's rows by
 * `__rowid__`, then the outer SELECT reads the columns of those rows only,
 * sorted again the same way:
 *
 * ```sql
 * SELECT CAST(to_json("emb") AS VARCHAR) AS "emb" FROM "t"
 * WHERE "t"."__rowid__" IN (SELECT "t"."__rowid__" FROM "t" WHERE … ORDER BY … LIMIT 10000 OFFSET 30000)
 * ORDER BY …
 * ```
 *
 * In a single SELECT, DuckDB computes the select list for every row of the
 * view before `ORDER BY … LIMIT` keeps the batch: `to_json` of every
 * nested value, some 15,000 characters for a `FLOAT[768]`, to keep 10,000
 * of them. A 10-row clipboard copy at row 30,000 of 100,000 such rows took
 * 4 s, and is now a few milliseconds. The order ends with `__rowid__`, so
 * it is total, and sorting the batch's rows again gives them in the same
 * order, ties included.
 *
 * @param schema - Read columns as {@link exportColumnRead} says; without
 *   it, every column is read as it is.
 */
export function buildBaseQuery(
  tableName: string,
  columns: string[],
  filters: Filter[],
  sortColumns: SortColumn[],
  limit: number,
  offset: number,
  schema?: readonly ColumnSchema[],
): string {
  const table = quoteIdentifier(tableName);
  const rowid = `${table}.${quoteIdentifier(ROWID_COLUMN)}`;
  const orderBy = buildOrderByClause(sortColumns, tableName);

  let page = `SELECT ${rowid} FROM ${table}`;
  if (filters.length > 0) {
    const where = filtersToWhereClause(filters);
    if (where) {
      page += ` WHERE ${where}`;
    }
  }
  page += `${orderBy} LIMIT ${limit} OFFSET ${offset}`;

  return `SELECT ${selectList(columns, schema)} FROM ${table} WHERE ${rowid} IN (${page})${orderBy}`;
}

/**
 * Build a query for the rows at `indices` (0-based positions in the sorted,
 * filtered view), in that view's order.
 *
 * A sort column whose type is or holds a VARIANT is ordered in the window
 * by `create_sort_key(c, 'ASC NULLS LAST')`: a window's ORDER BY compares
 * VARIANT values one by one and throws on two of different kinds ("Can't
 * compare values of type BIGINT and type VARCHAR", DuckDB 1.5.4), where a
 * plain ORDER BY, as the grid sorts, orders them by their sort keys. The
 * key gives the same order. The sort columns' types are looked up in
 * `sortSchema`; with neither it nor `schema`, every sort column is ordered
 * as it is.
 *
 * @param schema - Read columns as {@link exportColumnRead} says, in the
 *   outer SELECT only: the `numbered` CTE reads them as they are, so that
 *   `ROW_NUMBER()` numbers rows by the values. Without it, every column is
 *   read as it is.
 * @param sortSchema - Where to find the sort columns' types. Defaults to
 *   `schema`. A caller that reads the columns as they are passes it alone:
 *   `getColumnValues`, which reads the value itself in a query around this
 *   one, and the Parquet export, which writes every column natively.
 */
export function buildSelectedRowsQuery(
  tableName: string,
  columns: string[],
  filters: Filter[],
  sortColumns: SortColumn[],
  indices: number[],
  schema?: readonly ColumnSchema[],
  sortSchema: readonly ColumnSchema[] | undefined = schema,
): string {
  const columnList = columns.map(quoteIdentifier).join(', ');

  // Always seed the OVER clause with `__rowid__` ASC as the final
  // tiebreaker. The same non-determinism that affects ORDER BY also
  // affects ROW_NUMBER(): without it, `__row_idx__` is assigned to ties
  // in arbitrary order, so a user's selection set (which keys on these
  // indices) drifts across runs. Skipped if the user already sorts on
  // `__rowid__` (their direction stays authoritative). Qualified with the
  // table as in buildOrderByClause.
  const sortKeyColumns = new Set<string>();
  if (sortSchema) {
    for (const sort of sortColumns) {
      const column = sortSchema.find((c) => c.name === sort.column);
      if (column && holdsVariant(column)) sortKeyColumns.add(sort.column);
    }
  }
  const overClause = `ORDER BY ${orderByList(sortColumns, tableName, sortKeyColumns)}`;

  let innerSql = `SELECT ${columnList}, ROW_NUMBER() OVER(${overClause}) - 1 AS __row_idx__ FROM ${quoteIdentifier(tableName)}`;

  if (filters.length > 0) {
    const where = filtersToWhereClause(filters);
    if (where) {
      innerSql += ` WHERE ${where}`;
    }
  }

  const inList = indices.join(', ');
  return `WITH numbered AS (${innerSql}) SELECT ${selectList(columns, schema)} FROM numbered WHERE __row_idx__ IN (${inList}) ORDER BY __row_idx__ ASC`;
}

// ---------------------------------------------------------------------------
// Generic row fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch all rows matching the given scope, calling `onBatch` for each batch
 * of result rows. Handles batching, scope-based WHERE, contiguous-range
 * optimization for selected rows, and abort checking.
 *
 * Columns are read as {@link exportColumnRead} says for `context.schema`:
 * a nested column's value arrives as its JSON text, an INTERVAL, BLOB, BIT,
 * GEOMETRY, BIGNUM or ENUM value as DuckDB's text.
 */
export async function fetchAllRows(
  tableName: string,
  columns: string[],
  scope: 'all' | 'filtered' | 'selected',
  context: ExportContext,
  onBatch: (rows: RowData[]) => void,
  signal?: AbortSignal,
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
  signal?: AbortSignal,
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
      offset,
      context.schema,
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
  signal?: AbortSignal,
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
        offset,
        context.schema,
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
        chunk,
        context.schema,
      );

      const rows = await context.bridge.query<RowData>(sql, signal);
      if (rows.length > 0) {
        onBatch(rows);
      }
    }
  }
}
