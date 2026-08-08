/**
 * Parquet data loader using DuckDB's native Parquet support
 */

import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { getDatabase, getConnection } from '../duckdb';
import {
  createLoadProgress,
  planTypedIngestProjection,
  quoteIdentifier,
  wrapReservedColumnError,
  makeReservedColumnError,
  type LoaderContext,
} from './common';
import type { LoadResult, ParquetLoadOptions } from './types';

let tableCounter = 0;

/**
 * Generate a unique table name
 */
function generateTableName(): string {
  return `parquet_table_${++tableCounter}_${Date.now()}`;
}

/**
 * Load Parquet data into a DuckDB table
 *
 * @param data - Parquet content as ArrayBuffer
 * @param options - Parquet loading options
 * @param context - Optional explicit { db, conn }; see {@link loadCSV} for
 *   the rationale. Production callers (worker.ts) omit it.
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadParquet(
  data: ArrayBuffer,
  options: ParquetLoadOptions = {},
  context?: LoaderContext,
): Promise<LoadResult> {
  const db = context?.db ?? getDatabase();
  const conn = context?.conn ?? getConnection();
  const tableName = options.tableName || generateTableName();

  // Set timezone for TIMESTAMPTZ columns (default: UTC)
  const timezone = options.timezone ?? 'UTC';
  if (!/^[A-Za-z0-9_/+-]+$/.test(timezone)) {
    throw Object.assign(new Error(`Invalid timezone: ${timezone}`), {
      code: 'LOAD_INVALID_TIMEZONE',
      details: { timezone },
    });
  }
  await conn.query(`SET TimeZone = '${timezone}'`);

  // Convert to Uint8Array for DuckDB's file system
  const content = new Uint8Array(data);

  // Register file with DuckDB's virtual filesystem
  const fileName = `${tableName}.parquet`;
  await db.registerFileBuffer(fileName, content);

  const progress = createLoadProgress(context?.reportProgress);
  progress.parsing();

  try {
    // Reject explicit column lists that include the reserved __rowid__ name.
    if (options.columns?.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    // Build column selection
    const columnSelect = options.columns?.length
      ? options.columns.map((c) => quoteIdentifier(c)).join(', ')
      : '*';

    // Preflight the reader relation — see the matching note in csv.ts. One
    // DESCRIBE serves as both the reserved-name guard and the type planner's
    // column list, and the planned casts ride along in the ingest CTAS.
    // It describes `columnSelect` rather than `*`, so an explicit column
    // list is guarded exactly as precisely as the default projection: an
    // unrelated __rowid__ in the Parquet file that the caller did not ask
    // for never reaches the projection and is correctly ignored.
    const relation = `read_parquet('${fileName}')`;
    const projection = await planTypedIngestProjection(
      conn,
      relation,
      columnSelect,
      progress.analyzing,
    );
    progress.indexing();

    const tbl = quoteIdentifier(tableName);
    // Always cast __rowid__ to BIGINT — see the matching note in csv.ts for
    // the rationale (single typed-array shape on read, symmetry across
    // loaders). The reserved-name guard above is case-sensitive.
    const createSql = `CREATE OR REPLACE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, ${projection} FROM ${relation}`;
    try {
      await conn.query(createSql);
    } catch (err) {
      throw wrapReservedColumnError(err);
    }

    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE — already the post-conversion shape.
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

    progress.complete();
    return { tableName, rowCount, columns, schema };
  } finally {
    // Clean up virtual file
    await db.dropFile(fileName);
  }
}
