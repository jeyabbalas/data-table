/**
 * Parquet data loader using DuckDB's native Parquet support
 */

import { getDatabase, getConnection } from '../duckdb';
import type { LoadResult, ParquetLoadOptions } from './types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import {
  enhanceSchemaTypes,
  quoteIdentifier,
  wrapReservedColumnError,
  makeReservedColumnError,
} from './common';
import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';

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
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadParquet(
  data: ArrayBuffer,
  options: ParquetLoadOptions = {}
): Promise<LoadResult> {
  const db = getDatabase();
  const conn = getConnection();
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

  try {
    // Reject explicit column lists that include the reserved __rowid__ name.
    if (options.columns?.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    // Build column selection
    const columnSelect = options.columns?.length
      ? options.columns.map((c) => quoteIdentifier(c)).join(', ')
      : '*';

    // Inject a synthetic __rowid__ as the first column of a new table.
    // DuckDB silently aliases a duplicate column name in the projection
    // (producing __rowid___1) rather than throwing, so preflight with
    // DESCRIBE to reject sources that already have a __rowid__ column.
    // The wrapReservedColumnError catch below stays as defense-in-depth.
    // Skip the probe when an explicit column list was given — we already
    // rejected __rowid__ there above, and an unrelated __rowid__ in the
    // Parquet file itself won't reach the projection.
    if (!options.columns?.length) {
      const probeResult = await conn.query(
        `DESCRIBE SELECT * FROM read_parquet('${fileName}')`,
      );
      const probeColumns = probeResult
        .toArray()
        .map((row) => String(row.toJSON().column_name));
      if (probeColumns.includes(ROWID_COLUMN)) {
        throw makeReservedColumnError();
      }
    }

    const tbl = quoteIdentifier(tableName);
    const createSql = `CREATE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, ${columnSelect} FROM read_parquet('${fileName}')`;
    try {
      await conn.query(createSql);
    } catch (err) {
      throw wrapReservedColumnError(err);
    }

    // Get row count
    const countResult = await conn.query(
      `SELECT COUNT(*) as count FROM ${tbl}`
    );
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE
    const describeResult = await conn.query(`DESCRIBE ${tbl}`);
    let describeRows = describeResult.toArray().map((row) => row.toJSON());

    // Enhance schema by detecting and converting string columns to appropriate types
    describeRows = await enhanceSchemaTypes(conn, tableName, describeRows);

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
  } finally {
    // Clean up virtual file
    await db.dropFile(fileName);
  }
}
