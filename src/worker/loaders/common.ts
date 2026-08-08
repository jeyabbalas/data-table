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
 * VARCHAR-column count above which detection materializes a bounded sample
 * of the source before probing it, instead of probing the reader relation
 * directly.
 *
 * Every probe statement issued against a `read_csv_auto(…)` relation re-parses
 * the source head. Measured on a 1,000-column × 5,000-row CSV (37 MB, 300
 * VARCHAR columns, DuckDB-WASM 1.33.1-dev57.0, macOS, threads=1) the probe
 * costs **~1,275 ms per statement plus ~440 ms**, so chunking that Parquet
 * likes is exactly what CSV punishes: 5 chunks measured **6,881 ms** against
 * one 300-branch statement's 1,719 ms. Against Parquet the picture inverts —
 * projection pushdown makes the source read ~140 ms regardless of chunking,
 * leaving `UNION ALL` width to dominate, and the chunk sweep is a clean U with
 * its minimum exactly at {@link PROBE_CHUNK_COLUMNS} (317 ms at 64 vs 592 ms
 * at 300). No single chunk size is right for both formats.
 *
 * A bounded sample table dissolves the conflict: it pins the source to one
 * read and then probes a 4,096-row materialization where chunk count is
 * genuinely free. Measured end to end for the probe, same fixture — CSV
 * **1,516 ms** (4.5× faster than chunking the relation, and still faster than
 * the best single-statement shape), Parquet **325 ms** (within 2 % of the
 * chunk-64 optimum, 1.8× faster than one statement). The `DROP` costs ~1 ms
 * and the `CREATE` is the one source read the probe had to pay anyway.
 *
 * The threshold is {@link PROBE_CHUNK_COLUMNS} because that is where the
 * crossover sits: at one chunk the two shapes each pay exactly one source
 * read, so the sample's extra table probe is pure overhead; at two or more the
 * sample is strictly ahead. Narrow sources — the overwhelming majority — keep
 * the two-statement path they have today.
 */
export const PROBE_SAMPLE_THRESHOLD = PROBE_CHUNK_COLUMNS;

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
 * Produced by {@link planTypeConversions}, consumed by
 * {@link planTypedIngestProjection}. The three lists are disjoint.
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
 * Distinguishes concurrent sample tables. A load path is serial today, but a
 * name collision would silently probe the wrong sample, and `CREATE OR
 * REPLACE` would hide it — so the name is never reused within a session.
 */
let probeSampleSeq = 0;

/**
 * Probe `relation` through a bounded, single-read sample table.
 *
 * Three statements — `CREATE OR REPLACE TEMP TABLE … LIMIT`, the chunked
 * probes, `DROP` — replacing `ceil(V / PROBE_CHUNK_COLUMNS)` full re-reads of
 * the source. See {@link PROBE_SAMPLE_THRESHOLD} for the measurement that
 * decides when this is worth its two extra statements.
 *
 * Only the VARCHAR columns are materialized, which is both the whole input the
 * classifier needs and, on Parquet, a projection the reader can push down.
 * The sample takes the same head window the direct probe's CTE would have —
 * `LIMIT DETECT_SAMPLE_ROWS` with no ordering, exactly as before — so the two
 * paths classify identically.
 *
 * The sample is an optimization and never a correctness requirement: if it
 * cannot be built, detection falls back to probing the relation itself.
 */
async function planTypeConversionsViaSample(
  conn: AsyncDuckDBConnection,
  relation: string,
  stringColumns: string[],
): Promise<TypeConversionPlan> {
  const sample = quoteIdentifier(`__dt_probe_sample_${++probeSampleSeq}`);
  const projection = stringColumns.map(quoteIdentifier).join(', ');

  try {
    await conn.query(
      `CREATE OR REPLACE TEMP TABLE ${sample} AS ` +
        `SELECT ${projection} FROM ${relation} LIMIT ${DETECT_SAMPLE_ROWS}`,
    );
  } catch {
    return planTypeConversions(conn, relation, stringColumns);
  }

  try {
    return await planTypeConversions(conn, sample, stringColumns);
  } finally {
    try {
      await conn.query(`DROP TABLE IF EXISTS ${sample}`);
    } catch {
      // A temp table that outlives its probe dies with the connection.
      // Never fail a load over cleanup.
    }
  }
}

/**
 * SQL type each planned class rewrites to.
 *
 * `TRY_CAST` rather than `CAST` throughout: detection is a 0.95-confidence
 * decision over a bounded sample, so up to 5 % of a converted column's
 * values — and anything past the sampled window — may not parse. A hard
 * cast would fail the whole load; `TRY_CAST` yields NULL for those cells,
 * which is the behavior every prior release shipped.
 */
const CONVERSION_SQL_TYPE: Record<keyof TypeConversionPlan, string> = {
  timestamp: 'TIMESTAMP',
  date: 'DATE',
  time: 'TIME',
};

/**
 * Projection that applies `plan` to `allColumns`, preserving source order.
 *
 * Column order matters and cannot be recovered afterwards: `ALTER TABLE ADD
 * COLUMN` always appends, so a retype has to be a full projection.
 */
function buildTypedProjection(allColumns: string[], plan: TypeConversionPlan): string {
  const casts = new Map<string, string>();
  for (const type of ['timestamp', 'date', 'time'] as const) {
    for (const column of plan[type]) casts.set(column, CONVERSION_SQL_TYPE[type]);
  }
  return allColumns
    .map((column) => {
      const quoted = quoteIdentifier(column);
      const sqlType = casts.get(column);
      return sqlType ? `TRY_CAST(${quoted} AS ${sqlType}) AS ${quoted}` : quoted;
    })
    .join(', ');
}

/**
 * Preflight a source relation and return the projection that materializes
 * it with every detected temporal column already typed.
 *
 * This is what collapses the load path to **one** full-table
 * materialization. The shape it replaces was: materialize the source as
 * VARCHAR, `DESCRIBE` it, probe it, then copy and sort the whole table
 * again to apply the casts. Detection does not need the data materialized —
 * a bounded head sample of any FROM-able relation answers the same
 * question — so the casts can ride along in the ingest `CREATE TABLE AS
 * SELECT` and the second copy disappears.
 *
 * The single `DESCRIBE` here serves two purposes that used to cost two
 * queries: it is the reserved-name preflight (DuckDB silently aliases a
 * duplicate `__rowid__` in a projection rather than throwing, so the guard
 * has to be explicit), and it is the planner's column-and-type list.
 *
 * @param conn - DuckDB connection
 * @param relation - FROM-able source: `read_csv_auto('f.csv')`,
 *   `read_json_auto(…)`, `read_parquet(…)`, or a quoted table name
 * @param columnSelect - Projection to describe, defaulting to `*`. Parquet
 *   passes an explicit column list when the caller asked for one.
 * @returns The `SELECT` list to materialize, in source column order
 * @throws The canonical `LOAD_RESERVED_COLUMN_NAME` error when the source
 *   already has a `__rowid__` column
 */
export async function planTypedIngestProjection(
  conn: AsyncDuckDBConnection,
  relation: string,
  columnSelect = '*',
): Promise<string> {
  const described = await conn.query(`DESCRIBE SELECT ${columnSelect} FROM ${relation}`);
  const rows = described.toArray().map((row) => row.toJSON() as Record<string, unknown>);

  const columns = rows.map((row) => String(row['column_name']));
  if (columns.includes(ROWID_COLUMN)) {
    throw makeReservedColumnError();
  }

  const stringColumns = rows
    .filter((row) => String(row['column_type']).toUpperCase() === 'VARCHAR')
    .map((row) => String(row['column_name']));

  // No `where` in either branch — the head window is bounded by a LIMIT on a
  // relation that has no `__rowid__` to prune on yet.
  const plan =
    stringColumns.length > PROBE_SAMPLE_THRESHOLD
      ? await planTypeConversionsViaSample(conn, relation, stringColumns)
      : await planTypeConversions(conn, relation, stringColumns);
  return buildTypedProjection(columns, plan);
}
