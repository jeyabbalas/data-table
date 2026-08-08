/**
 * Shared utilities for data loaders
 *
 * Provides common functionality like timestamp detection and type conversion
 * that can be reused across CSV, JSON, and other loaders.
 */

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { ROWID_COLUMN } from '../../core/types';

/**
 * Optional explicit DuckDB context for loader entry points (`loadCSV`,
 * `loadJSON`, `loadParquet`). When omitted, the loaders fall back to the
 * module-level singletons in `./duckdb.ts`. Internal seam for tests that
 * drive loaders against a Node-built DuckDB without going through the
 * worker IPC.
 */
export interface LoaderContext {
  db?: AsyncDuckDB;
  conn?: AsyncDuckDBConnection;
}

/**
 * Quote a SQL identifier (table/column name) with proper escaping.
 * Wraps in double quotes and escapes embedded double quotes by doubling them.
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote a SQL string literal, escaping embedded single quotes by doubling
 * them. Used to carry a column *name* through a probe result set as data.
 */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build the canonical LOAD_RESERVED_COLUMN_NAME LoadError for a source that
 * already contains a `__rowid__` column.
 */
export function makeReservedColumnError(): Error {
  return Object.assign(
    new Error(
      'Column name "__rowid__" is reserved for the synthetic row id. Rename the source column and reload.',
    ),
    {
      code: 'LOAD_RESERVED_COLUMN_NAME',
      details: { sourceColumn: '__rowid__' },
    },
  );
}

/**
 * If an error from `CREATE TABLE AS SELECT ... __rowid__ ...` looks like a
 * DuckDB duplicate-column binder error (i.e. the source already has a
 * `__rowid__` column), rewrap it as the canonical reserved-name error.
 * Otherwise rethrow the original.
 */
export function wrapReservedColumnError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  // DuckDB phrasing varies slightly across versions ("duplicate column name",
  // "Table has duplicate column name", "duplicate alias", etc.); match on the
  // pair of signals that is specific to our injected __rowid__.
  if (/duplicate/i.test(message) && /__rowid__/.test(message)) {
    return makeReservedColumnError();
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * ISO timestamp pattern
 * Matches formats:
 * - YYYY-MM-DDTHH:MM:SS
 * - YYYY-MM-DDTHH:MM:SS.sss (with milliseconds/microseconds)
 * - YYYY-MM-DDTHH:MM:SSZ (UTC)
 * - YYYY-MM-DD HH:MM:SS (space separator)
 * - YYYY-MM-DDTHH:MM:SS+HH:MM (with timezone offset)
 */
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * ISO date pattern (date only, no time component)
 * Matches: YYYY-MM-DD
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Time pattern (24-hour format)
 * Matches:
 * - HH:MM:SS
 * - HH:MM:SS.ffffff (with microseconds)
 */
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Check if a value matches ISO timestamp format
 */
function isISOTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate it's a real timestamp by parsing
  const date = new Date(trimmed.replace(' ', 'T'));
  return !isNaN(date.getTime());
}

/**
 * Check if a value matches ISO date format (YYYY-MM-DD)
 */
function isISODate(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate it's a real date by parsing
  const date = new Date(trimmed + 'T00:00:00');
  return !isNaN(date.getTime());
}

/**
 * Check if a value matches 24-hour time format (HH:MM:SS or HH:MM:SS.ffffff)
 */
function isTimeFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    return false;
  }
  // Validate time components are in valid range
  const parts = trimmed.split(':');
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);
  const seconds = parseFloat(parts[2]!);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds < 60;
}

/**
 * Leading source rows the type probe reads.
 *
 * Detection used to sample `SELECT DISTINCT … LIMIT 100` over the **whole**
 * table, once per column per pass — a full-scan hash aggregate per
 * categorical column, three times. Bounding the sample to a head window
 * makes probe cost independent of row count, which is what lets a 5M-row
 * load stop paying for detection.
 *
 * 4,096 is large enough that a column whose leading rows are unusually
 * uniform still contributes ~40× the {@link DETECT_SAMPLE_VALUES} distinct
 * values the classifier looks at, and small enough that the read is a
 * zonemap-pruned head scan rather than a table scan. The tradeoff is
 * explicit: a column that is ISO-timestamp-shaped only *after* row 4,096
 * now stays VARCHAR. `options.format`-style escape hatches do not exist for
 * type detection, so this is documented in `docs/guides/loading-data.md`.
 */
export const DETECT_SAMPLE_ROWS = 4096;

/**
 * Columns probed per batched statement.
 *
 * The probe is one `UNION ALL` branch per column over a shared materialized
 * CTE, so a chunk reads the sample once no matter how many branches follow.
 * Chunking at all exists to keep a single statement's parse tree bounded on
 * very wide sources (the WIDE tier has 1,000 columns, 300 of them VARCHAR);
 * 64 keeps the SQL text well under any practical parser limit while still
 * collapsing a 300-column probe from 900 statements to 5.
 */
export const PROBE_CHUNK_COLUMNS = 64;

/**
 * Distinct non-NULL values examined per column.
 *
 * Unchanged from the three per-pass defaults this replaces — the
 * classification input is the same 100 distinct values it always was.
 */
export const DETECT_SAMPLE_VALUES = 100;

/**
 * Match ratio a column's sample must reach to be classified.
 *
 * Was three independent `confidenceThreshold = 0.95` default parameters on
 * three near-identical detect functions; now one constant, so the threshold
 * cannot drift per type class.
 */
export const DETECT_CONFIDENCE = 0.95;

/**
 * Which VARCHAR columns should be rewritten to which temporal type.
 *
 * Produced by {@link planTypeConversions}, consumed by the conversion
 * rewrite. The three lists are disjoint.
 */
export interface TypeConversionPlan {
  timestamp: string[];
  date: string[];
  time: string[];
}

/**
 * SQL for one batched probe: a materialized head sample of `columns`,
 * followed by one `UNION ALL` branch per column emitting
 * `(column_name, distinct_value)` pairs.
 *
 * `AS MATERIALIZED` is the load-bearing part. Without it DuckDB is free to
 * inline the CTE into each of the ~64 branches, which against a
 * `read_csv_auto(…)` relation would re-parse the source head 64 times per
 * chunk. With it the sample is read once and every branch scans the same
 * materialized result.
 *
 * `CAST(… AS VARCHAR)` makes the `UNION ALL` well-typed regardless of what
 * the caller passed — production callers only ever probe columns `DESCRIBE`
 * reported as `VARCHAR`, where the cast is identity, but the planner is
 * relation-generic and a mixed list must not produce a binder error.
 */
function buildBatchedProbeSQL(relation: string, columns: string[], where?: string): string {
  const projection = columns.map(quoteIdentifier).join(', ');
  const predicate = where ? ` WHERE ${where}` : '';
  const branches = columns.map((column) => {
    const col = quoteIdentifier(column);
    return (
      `SELECT ${quoteLiteral(column)} AS c, v FROM ` +
      `(SELECT DISTINCT CAST(${col} AS VARCHAR) AS v FROM s ` +
      `WHERE ${col} IS NOT NULL LIMIT ${DETECT_SAMPLE_VALUES})`
    );
  });
  return (
    `WITH s AS MATERIALIZED (SELECT ${projection} FROM ${relation}${predicate} ` +
    `LIMIT ${DETECT_SAMPLE_ROWS}) ` +
    branches.join(' UNION ALL ')
  );
}

/** SQL for the single-column fallback probe. See {@link planTypeConversions}. */
function buildSingleProbeSQL(relation: string, column: string, where?: string): string {
  const col = quoteIdentifier(column);
  const predicate = where ? ` WHERE ${where}` : '';
  return (
    `SELECT DISTINCT CAST(${col} AS VARCHAR) AS v FROM ` +
    `(SELECT ${col} FROM ${relation}${predicate} LIMIT ${DETECT_SAMPLE_ROWS}) ` +
    `WHERE ${col} IS NOT NULL LIMIT ${DETECT_SAMPLE_VALUES}`
  );
}

/**
 * Collect a head sample of distinct values for every column in `columns`.
 *
 * Columns with no non-NULL value in the sampled window simply get no entry,
 * which is how an all-NULL column ends up unclassified.
 */
async function collectProbeSamples(
  conn: AsyncDuckDBConnection,
  relation: string,
  columns: string[],
  where?: string,
): Promise<Map<string, string[]>> {
  const samples = new Map<string, string[]>();

  for (let start = 0; start < columns.length; start += PROBE_CHUNK_COLUMNS) {
    const chunk = columns.slice(start, start + PROBE_CHUNK_COLUMNS);
    try {
      const result = await conn.query(buildBatchedProbeSQL(relation, chunk, where));
      for (const row of result.toArray()) {
        const { c, v } = row.toJSON() as { c: unknown; v: unknown };
        const column = String(c);
        const bucket = samples.get(column);
        if (bucket) bucket.push(String(v));
        else samples.set(column, [String(v)]);
      }
    } catch {
      // One malformed column must not cost the whole chunk its detection.
      // The per-column loop reproduces the old `catch { continue }`
      // tolerance exactly: a column that cannot be probed is skipped and
      // stays VARCHAR, and its neighbours are still classified.
      for (const column of chunk) {
        try {
          const result = await conn.query(buildSingleProbeSQL(relation, column, where));
          const values = result.toArray().map((row) => String(row.toJSON().v));
          if (values.length > 0) samples.set(column, values);
        } catch {
          continue;
        }
      }
    }
  }

  return samples;
}

/**
 * Decide which VARCHAR columns of a relation hold ISO timestamps, ISO
 * dates, or 24-hour times.
 *
 * Replaces three near-identical detect passes, each of which ran one
 * whole-table `SELECT DISTINCT … LIMIT 100` **per column**. One head sample
 * now feeds all three classifiers, so a source with `V` VARCHAR columns
 * costs `ceil(V / PROBE_CHUNK_COLUMNS)` statements instead of `3V`, and the
 * cost no longer depends on row count at all.
 *
 * Classification itself is unchanged and stays in JS: the same
 * {@link isISOTimestamp} / {@link isISODate} / {@link isTimeFormat}
 * matchers at the same {@link DETECT_CONFIDENCE} ratio, in the same
 * timestamp → date → time priority order. The three patterns are mutually
 * exclusive, so the priority is belt-and-braces rather than a tiebreak —
 * but it is what keeps behavior identical if a matcher is ever widened.
 *
 * @param conn - DuckDB connection
 * @param relation - Any FROM-able SQL relation: a quoted table name, or a
 *   `read_csv_auto(…)` / `read_json_auto(…)` / `read_parquet(…)` call. This
 *   is the seam Phase 10's direct-scan mode retargets — detection does not
 *   need the data materialized.
 * @param stringColumns - VARCHAR column names to classify, in source order
 * @param where - Optional predicate applied inside the sample CTE. Callers
 *   probing a materialized table pass `"__rowid__" < DETECT_SAMPLE_ROWS`,
 *   which DuckDB prunes by zonemap; callers probing a `read_xxx(…)`
 *   relation omit it and rely on the CTE's `LIMIT`.
 * @returns Disjoint column-name lists, each in `stringColumns` order
 */
export async function planTypeConversions(
  conn: AsyncDuckDBConnection,
  relation: string,
  stringColumns: string[],
  where?: string,
): Promise<TypeConversionPlan> {
  const plan: TypeConversionPlan = { timestamp: [], date: [], time: [] };
  if (stringColumns.length === 0) return plan;

  const samples = await collectProbeSamples(conn, relation, stringColumns, where);

  const classifiers: [keyof TypeConversionPlan, (value: string) => boolean][] = [
    ['timestamp', isISOTimestamp],
    ['date', isISODate],
    ['time', isTimeFormat],
  ];

  const unclassified = new Set(stringColumns);
  for (const [type, matches] of classifiers) {
    for (const column of stringColumns) {
      if (!unclassified.has(column)) continue;
      const values = samples.get(column);
      if (!values || values.length === 0) continue;
      const hits = values.filter(matches).length;
      if (hits / values.length >= DETECT_CONFIDENCE) {
        plan[type].push(column);
        unclassified.delete(column);
      }
    }
  }

  return plan;
}

/**
 * Convert string columns to TIMESTAMP type using DuckDB
 *
 * Recreates the table with a SELECT statement that CASTs timestamp columns
 * while preserving the original column order. This approach is necessary
 * because ALTER TABLE ADD COLUMN always appends columns at the end.
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to TIMESTAMP
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToTimestamp(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[],
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  // Build SELECT with CAST for timestamp columns, preserving original order
  const selectClauses = allColumns.map((col) => {
    const quotedCol = quoteIdentifier(col);
    if (columnsToConvert.has(col)) {
      // Convert VARCHAR to TIMESTAMP, using TRY_CAST to handle invalid values gracefully
      return `TRY_CAST(${quotedCol} AS TIMESTAMP) AS ${quotedCol}`;
    }
    // Keep other columns unchanged
    return quotedCol;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;
  const quotedTemp = quoteIdentifier(tempTable);
  const quotedTable = quoteIdentifier(tableName);

  try {
    // Create new table with correct types and preserved column order.
    // ORDER BY __rowid__ keeps row identity aligned after recreation — DuckDB
    // does not guarantee scan order on CREATE TABLE AS SELECT without it.
    const orderBy = allColumns.includes('__rowid__') ? ' ORDER BY "__rowid__"' : '';
    await conn.query(`
      CREATE TABLE ${quotedTemp} AS
      SELECT ${selectClauses.join(', ')}
      FROM ${quotedTable}${orderBy}
    `);

    // Drop original table
    await conn.query(`DROP TABLE ${quotedTable}`);

    // Rename temp table to original name
    await conn.query(`ALTER TABLE ${quotedTemp} RENAME TO ${quotedTable}`);
  } catch (cause) {
    // If conversion fails, try to clean up temp table
    try {
      await conn.query(`DROP TABLE IF EXISTS ${quotedTemp}`);
    } catch {
      // Ignore cleanup errors
    }
    throw Object.assign(
      new Error(`Failed to convert columns to timestamp in table ${tableName}`, { cause }),
      { code: 'LOAD_PARSE_FAILED', details: { tableName, stage: 'timestamp' } },
    );
  }
}

/**
 * Convert string columns to DATE type using DuckDB
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to DATE
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToDate(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[],
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  const selectClauses = allColumns.map((col) => {
    const quotedCol = quoteIdentifier(col);
    if (columnsToConvert.has(col)) {
      return `TRY_CAST(${quotedCol} AS DATE) AS ${quotedCol}`;
    }
    return quotedCol;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;
  const quotedTemp = quoteIdentifier(tempTable);
  const quotedTable = quoteIdentifier(tableName);

  try {
    const orderBy = allColumns.includes('__rowid__') ? ' ORDER BY "__rowid__"' : '';
    await conn.query(`
      CREATE TABLE ${quotedTemp} AS
      SELECT ${selectClauses.join(', ')}
      FROM ${quotedTable}${orderBy}
    `);

    await conn.query(`DROP TABLE ${quotedTable}`);
    await conn.query(`ALTER TABLE ${quotedTemp} RENAME TO ${quotedTable}`);
  } catch (cause) {
    try {
      await conn.query(`DROP TABLE IF EXISTS ${quotedTemp}`);
    } catch {
      // Ignore cleanup errors
    }
    throw Object.assign(
      new Error(`Failed to convert columns to date in table ${tableName}`, { cause }),
      { code: 'LOAD_PARSE_FAILED', details: { tableName, stage: 'date' } },
    );
  }
}

/**
 * Convert string columns to TIME type using DuckDB
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to TIME
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToTime(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[],
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  const selectClauses = allColumns.map((col) => {
    const quotedCol = quoteIdentifier(col);
    if (columnsToConvert.has(col)) {
      return `TRY_CAST(${quotedCol} AS TIME) AS ${quotedCol}`;
    }
    return quotedCol;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;
  const quotedTemp = quoteIdentifier(tempTable);
  const quotedTable = quoteIdentifier(tableName);

  try {
    const orderBy = allColumns.includes('__rowid__') ? ' ORDER BY "__rowid__"' : '';
    await conn.query(`
      CREATE TABLE ${quotedTemp} AS
      SELECT ${selectClauses.join(', ')}
      FROM ${quotedTable}${orderBy}
    `);

    await conn.query(`DROP TABLE ${quotedTable}`);
    await conn.query(`ALTER TABLE ${quotedTemp} RENAME TO ${quotedTable}`);
  } catch (cause) {
    try {
      await conn.query(`DROP TABLE IF EXISTS ${quotedTemp}`);
    } catch {
      // Ignore cleanup errors
    }
    throw Object.assign(
      new Error(`Failed to convert columns to time in table ${tableName}`, { cause }),
      { code: 'LOAD_PARSE_FAILED', details: { tableName, stage: 'time' } },
    );
  }
}

/**
 * Enhance schema by detecting and converting string columns to appropriate types
 *
 * Supports:
 * - ISO timestamp detection in VARCHAR columns (YYYY-MM-DDTHH:MM:SS)
 * - ISO date detection in VARCHAR columns (YYYY-MM-DD)
 * - 24-hour time detection in VARCHAR columns (HH:MM:SS)
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to enhance
 * @param describeRows - Current schema from DESCRIBE query
 * @returns Updated describeRows after type conversion
 */
export async function enhanceSchemaTypes(
  conn: AsyncDuckDBConnection,
  tableName: string,
  describeRows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  // All column names in original order — the conversion rewrites project
  // them back in exactly this order, so one read up front is enough.
  const allColumns = describeRows.map((row) => String(row['column_name']));

  const stringColumns = describeRows
    .filter((row) => String(row['column_type']).toUpperCase() === 'VARCHAR')
    .map((row) => String(row['column_name']));

  if (stringColumns.length === 0) {
    return describeRows;
  }

  // Plan every conversion from a single head sample. The old shape probed,
  // rewrote, re-`DESCRIBE`d, probed again, … three times over; because each
  // rewrite preserves both the names and the order of the columns it does
  // not convert, the intermediate `DESCRIBE`s were re-reading a list that
  // could not have changed.
  const rowidFilter = allColumns.includes(ROWID_COLUMN)
    ? `${quoteIdentifier(ROWID_COLUMN)} < ${DETECT_SAMPLE_ROWS}`
    : undefined;
  const plan = await planTypeConversions(
    conn,
    quoteIdentifier(tableName),
    stringColumns,
    rowidFilter,
  );

  if (plan.timestamp.length === 0 && plan.date.length === 0 && plan.time.length === 0) {
    return describeRows;
  }

  await convertColumnsToTimestamp(conn, tableName, plan.timestamp, allColumns);
  await convertColumnsToDate(conn, tableName, plan.date, allColumns);
  await convertColumnsToTime(conn, tableName, plan.time, allColumns);

  const finalDescribeResult = await conn.query(`DESCRIBE ${quoteIdentifier(tableName)}`);
  return finalDescribeResult.toArray().map((row) => row.toJSON());
}
