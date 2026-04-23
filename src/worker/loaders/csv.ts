/**
 * CSV data loader using DuckDB's native CSV parsing
 */

import { getDatabase, getConnection } from '../duckdb';
import type { LoadResult, CSVLoadOptions } from './types';
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
  return `table_${++tableCounter}_${Date.now()}`;
}

/**
 * Load CSV data into a DuckDB table
 *
 * @param data - CSV content as string or ArrayBuffer
 * @param options - CSV loading options
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadCSV(
  data: string | ArrayBuffer,
  options: CSVLoadOptions = {}
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
  const content =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new TextEncoder().encode(data);

  // Register file with DuckDB's virtual filesystem
  const fileName = `${tableName}.csv`;
  await db.registerFileBuffer(fileName, content);

  try {
    // Build read_csv options
    const csvOptions: string[] = [];

    if (options.delimiter) {
      if (options.delimiter.length !== 1) {
        throw Object.assign(new Error('CSV delimiter must be a single character'), {
          code: 'LOAD_INVALID_OPTIONS',
          details: { option: 'delimiter' },
        });
      }
      csvOptions.push(`delim = '${options.delimiter.replace(/'/g, "''")}'`);
    }

    if (options.header !== undefined) {
      csvOptions.push(`header = ${Boolean(options.header)}`);
    }

    if (options.sampleSize) {
      const n = Number(options.sampleSize);
      if (!Number.isInteger(n) || n <= 0) {
        throw Object.assign(new Error('CSV sampleSize must be a positive integer'), {
          code: 'LOAD_INVALID_OPTIONS',
          details: { option: 'sampleSize' },
        });
      }
      csvOptions.push(`sample_size = ${n}`);
    }

    if (options.skip) {
      const n = Number(options.skip);
      if (!Number.isInteger(n) || n < 0) {
        throw Object.assign(new Error('CSV skip must be a non-negative integer'), {
          code: 'LOAD_INVALID_OPTIONS',
          details: { option: 'skip' },
        });
      }
      csvOptions.push(`skip = ${n}`);
    }

    // Inject a synthetic __rowid__ as the first column of a new table.
    // DuckDB silently aliases a duplicate column name in the projection
    // (producing __rowid___1) rather than throwing, so preflight with
    // DESCRIBE to reject sources that already have a __rowid__ column.
    // The wrapReservedColumnError catch below stays as defense-in-depth
    // in case future DuckDB versions throw instead of aliasing.
    const optionsStr = csvOptions.length > 0 ? `, ${csvOptions.join(', ')}` : '';
    const probeResult = await conn.query(
      `DESCRIBE SELECT * FROM read_csv_auto('${fileName}'${optionsStr})`,
    );
    const probeColumns = probeResult
      .toArray()
      .map((row) => String(row.toJSON().column_name));
    if (probeColumns.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    const tbl = quoteIdentifier(tableName);
    const createSql = `CREATE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, * FROM read_csv_auto('${fileName}'${optionsStr})`;
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
    // This detects ISO timestamps in VARCHAR columns and converts them to TIMESTAMP
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

/**
 * Drop a table from DuckDB
 *
 * @param tableName - Name of the table to drop
 */
export async function dropTable(tableName: string): Promise<void> {
  const conn = getConnection();
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}
