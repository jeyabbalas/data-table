/**
 * Parquet data loader using DuckDB's native Parquet support
 */

import { DuckDBDataProtocol, type AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { getDatabase, getConnection } from '../duckdb';
import {
  detectTemporalColumns,
  quoteIdentifier,
  temporalCast,
  wrapReservedColumnError,
  makeReservedColumnError,
  dropSourceFile,
  invalidOptionError,
  setSessionTimeZone,
  sourceFileName,
  type LoaderContext,
} from './common';
import {
  fitParquetRead,
  isOutOfMemoryError,
  measureParquetFootprint,
  memoryExceededError,
  readMemoryBudget,
} from './memoryBudget';
import type { LoadResult, ParquetLoadOptions } from './types';

let tableCounter = 0;

const PREFETCH_SETTINGS = ['prefetch_all_parquet_files', 'enable_external_file_cache'] as const;

/**
 * Have DuckDB read whole row groups ahead of the decoder instead of one
 * column chunk at a time. The external file cache goes off with it: left on,
 * it keeps every prefetched block, and the load then costs the whole file on
 * top of the table. Returns false, leaving both settings at their defaults,
 * if this DuckDB build lacks either setting.
 */
async function enablePrefetch(conn: AsyncDuckDBConnection): Promise<boolean> {
  try {
    await conn.query('SET enable_external_file_cache = false');
    await conn.query('SET prefetch_all_parquet_files = true');
    return true;
  } catch {
    await resetPrefetch(conn);
    return false;
  }
}

async function resetPrefetch(conn: AsyncDuckDBConnection): Promise<void> {
  for (const setting of PREFETCH_SETTINGS) {
    try {
      await conn.query(`RESET ${setting}`);
    } catch {
      // A failed reset leaves a setting that only affects file reads.
    }
  }
}

/**
 * Generate a unique table name
 */
function generateTableName(): string {
  return `parquet_table_${++tableCounter}_${Date.now()}`;
}

/**
 * Reject a column list that names a column twice, or one the file lacks,
 * before DuckDB's binder sees it: the binder matches names whatever their
 * case, and would load a file's `Fare` as `fare` when asked for `fare`.
 */
async function checkColumnsInFile(
  conn: AsyncDuckDBConnection,
  source: string,
  columns: readonly string[],
): Promise<void> {
  if (new Set(columns).size !== columns.length) {
    throw invalidOptionError('parquet.columns', 'Parquet columns name a column more than once');
  }
  const result = await conn.query(`DESCRIBE SELECT * FROM ${source}`);
  const names = result.toArray().map((row) => String(row.toJSON().column_name));
  const inFile = new Set(names);
  const missing = columns.filter((c) => !inFile.has(c));
  if (missing.length === 0) return;
  const byLowerCase = new Map(names.map((name) => [name.toLowerCase(), name]));
  const listed = missing.map((c) => {
    const near = byLowerCase.get(c.toLowerCase());
    return near ? `"${c}" (the file has "${near}")` : `"${c}"`;
  });
  throw Object.assign(new Error(`Parquet columns not in the file: ${listed.join(', ')}`), {
    code: 'LOAD_INVALID_OPTIONS',
    details: { option: 'parquet.columns', missing },
  });
}

/**
 * Load Parquet data into a DuckDB table
 *
 * A `Blob` (or `File`) is registered as a file handle, so DuckDB reads it
 * from disk as it decodes and the file never has to fit in memory next to
 * the table. An `ArrayBuffer` is copied into DuckDB's memory first. Either
 * way the load is checked against the memory budget before the table is
 * built; see memoryBudget.ts.
 *
 * Text columns of ISO dates, timestamps or times convert as the table is
 * built, so the table is written once, never as text first; see
 * {@link detectTemporalColumns}.
 *
 * @param data - Parquet content as a Blob/File (read lazily) or ArrayBuffer
 * @param options - Parquet loading options
 * @param context - Optional explicit { db, conn }; see {@link loadCSV} for
 *   the rationale. Production callers (worker.ts) omit it.
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadParquet(
  data: ArrayBuffer | Blob,
  options: ParquetLoadOptions = {},
  context?: LoaderContext,
): Promise<LoadResult> {
  const db = context?.db ?? getDatabase();
  const conn = context?.conn ?? getConnection();
  const tableName = options.tableName || generateTableName();

  // DuckDB's session time zone, UTC unless given; see SourceOptions.timezone.
  await setSessionTimeZone(conn, options.timezone);

  // Register file with DuckDB's virtual filesystem. A Blob stays on disk:
  // BROWSER_FILEREADER reads slices of it on demand, and direct I/O skips
  // duckdb-wasm's own read buffering.
  const fromFile = data instanceof Blob;
  const fileName = sourceFileName('parquet');
  if (fromFile) {
    await db.registerFileHandle(fileName, data, DuckDBDataProtocol.BROWSER_FILEREADER, true);
  } else {
    await db.registerFileBuffer(fileName, new Uint8Array(data));
  }

  const tbl = quoteIdentifier(tableName);
  // Set once the CREATE succeeds: from then on a failure has to drop the
  // table, or it stays in DuckDB holding memory that nothing will release.
  let created = false;
  try {
    // Reject explicit column lists that include the reserved __rowid__ name.
    if (options.columns?.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    // The columns to load, as a relation to read from.
    const source = `read_parquet('${fileName}')`;
    const projection = options.columns?.length ? options.columns : undefined;
    if (projection) await checkColumnsInFile(conn, source, projection);
    const projected = projection
      ? `(SELECT ${projection.map((c) => quoteIdentifier(c)).join(', ')} FROM ${source})`
      : source;

    // DESCRIBE the load's projection before building anything. It gives
    // the column types the memory estimate needs, and rejects a source that
    // already has a __rowid__ column: DuckDB silently aliases a duplicate
    // name in the projection (producing __rowid___1) rather than throwing.
    // The wrapReservedColumnError catch below stays as defense-in-depth.
    const probeResult = await conn.query(`DESCRIBE SELECT * FROM ${projected}`);
    const probeRows = probeResult.toArray().map((row) => row.toJSON());
    if (probeRows.some((row) => String(row.column_name) === ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    // Text columns of dates and times, read from the file, and the types
    // the table will hold once they are cast.
    const temporal = await detectTemporalColumns(conn, projected, probeRows);
    const loadedRows = probeRows.map((row) => {
      const type = temporal.get(String(row.column_name));
      return type ? { ...row, column_type: type } : row;
    });

    const footprint = await measureParquetFootprint(conn, fileName, loadedRows, projection);
    const budget = await readMemoryBudget(conn);
    const context = { footprint, budget, buffered: !fromFile };
    const plan = fitParquetRead(footprint, budget, fromFile);
    if (plan.mode === null) {
      throw memoryExceededError({ ...context, stage: 'estimate', failure: plan.failure });
    }

    // Inject a synthetic __rowid__ as the first column of a new table.
    // Always cast __rowid__ to BIGINT — see the matching note in csv.ts for
    // the rationale (single typed-array shape on read, symmetry across
    // loaders). The reserved-name guard above is case-sensitive.
    const casts = [...temporal].map(([name, type]) => temporalCast(name, type));
    const replace = casts.length > 0 ? ` REPLACE (${casts.join(', ')})` : '';
    const createSql = `CREATE OR REPLACE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, *${replace} FROM ${projected}`;
    const prefetching = plan.mode === 'prefetch' && (await enablePrefetch(conn));
    try {
      await conn.query(createSql);
      created = true;
    } catch (err) {
      if (isOutOfMemoryError(err)) throw memoryExceededError({ ...context, stage: 'load' }, err);
      throw wrapReservedColumnError(err);
    } finally {
      if (prefetching) await resetPrefetch(conn);
    }

    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE
    const describeResult = await conn.query(`DESCRIBE ${tbl}`);
    const describeRows = describeResult.toArray().map((row) => row.toJSON());

    const columns = describeRows.map((row) => String(row.column_name));
    const schema = describeRows.map((row) => {
      const name = String(row.column_name);
      const entry: ColumnSchema = {
        name,
        type: mapDuckDBType(String(row.column_type)),
        nullable: row.null === 'YES',
        originalType: String(row.column_type),
      };
      if (name === ROWID_COLUMN) entry.system = true;
      return entry;
    });

    return { tableName, rowCount, columns, schema };
  } catch (err) {
    // The caller never learns this table's name when the load fails, so
    // nothing else could drop it. Best effort: the load's own error wins.
    if (created) {
      try {
        await conn.query(`DROP TABLE IF EXISTS ${tbl}`);
      } catch {
        // Ignore cleanup errors.
      }
    }
    throw err;
  } finally {
    // Clean up virtual file
    await dropSourceFile(db, fileName);
  }
}
