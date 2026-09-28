/**
 * CSV data loader using DuckDB's native CSV parsing
 */

import { ROWID_COLUMN, type ColumnSchema } from '../../core/types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { getDatabase, getConnection } from '../duckdb';
import {
  enhanceSchemaTypes,
  quoteIdentifier,
  wrapReservedColumnError,
  makeReservedColumnError,
  dropSourceFile,
  invalidOptionError,
  setSessionTimeZone,
  sourceFileName,
  type LoaderContext,
} from './common';
import type { LoadResult, CSVLoadOptions } from './types';

let tableCounter = 0;

/**
 * Generate a unique table name
 */
function generateTableName(): string {
  return `table_${++tableCounter}_${Date.now()}`;
}

/** A SQL string literal holding `value`. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Load CSV data into a DuckDB table
 *
 * @param data - CSV content as string or ArrayBuffer
 * @param options - CSV loading options
 * @param context - Optional explicit { db, conn } to use instead of the
 *   module-level singletons in `./duckdb.ts`. When omitted, falls back to
 *   `getDatabase()` / `getConnection()`. Internal seam for tests that drive
 *   loaders against a Node-built DuckDB without going through the worker
 *   IPC; production callers (worker.ts) omit it.
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadCSV(
  data: string | ArrayBuffer,
  options: CSVLoadOptions = {},
  context?: LoaderContext,
): Promise<LoadResult> {
  const db = context?.db ?? getDatabase();
  const conn = context?.conn ?? getConnection();
  const tableName = options.tableName || generateTableName();

  // DuckDB's session time zone, UTC unless given; see SourceOptions.timezone.
  await setSessionTimeZone(conn, options.timezone);

  // Convert to Uint8Array for DuckDB's file system
  const content =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(data);

  // Register file with DuckDB's virtual filesystem
  const fileName = sourceFileName('csv');
  await db.registerFileBuffer(fileName, content);

  try {
    // Build read_csv options
    const csvOptions: string[] = [];

    if (options.delimiter) {
      if (options.delimiter.length !== 1) {
        throw invalidOptionError('csv.delimiter', 'CSV delimiter must be a single character');
      }
      csvOptions.push(`delim = ${sqlString(options.delimiter)}`);
    }

    if (options.header !== undefined) {
      csvOptions.push(`header = ${Boolean(options.header)}`);
    }

    if (options.sampleSize !== undefined) {
      const n = Number(options.sampleSize);
      if (!Number.isInteger(n) || (n <= 0 && n !== -1)) {
        throw invalidOptionError(
          'csv.sampleSize',
          'CSV sampleSize must be a positive integer or -1',
        );
      }
      csvOptions.push(`sample_size = ${n}`);
    }

    if (options.skip) {
      const n = Number(options.skip);
      if (!Number.isInteger(n) || n < 0) {
        throw invalidOptionError('csv.skip', 'CSV skip must be a non-negative integer');
      }
      csvOptions.push(`skip = ${n}`);
    }

    if (options.nullValues !== undefined) {
      const values: readonly unknown[] = Array.isArray(options.nullValues)
        ? options.nullValues
        : [];
      if (values.length === 0 || values.some((v) => typeof v !== 'string')) {
        throw invalidOptionError(
          'csv.nullValues',
          'CSV nullValues must be a non-empty array of strings',
        );
      }
      csvOptions.push(`nullstr = [${values.map((v) => sqlString(v as string)).join(', ')}]`);
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
    const probeColumns = probeResult.toArray().map((row) => String(row.toJSON().column_name));
    if (probeColumns.includes(ROWID_COLUMN)) {
      throw makeReservedColumnError();
    }

    const tbl = quoteIdentifier(tableName);
    // Always cast __rowid__ to BIGINT, regardless of row count. The original
    // plan called for a conditional INTEGER/BIGINT cast based on row count,
    // but the unconditional BIGINT keeps loaders symmetrical and lets every
    // getColumnValues consumer rely on a single typed-array shape
    // (BigInt64Array) for the rowid column. The reserved-name guard above
    // is case-sensitive (DuckDB-correct): "__RowID__" would slip through
    // and would not collide with our injected "__rowid__".
    const createSql = `CREATE OR REPLACE TABLE ${tbl} AS SELECT CAST(row_number() OVER () - 1 AS BIGINT) AS ${quoteIdentifier(ROWID_COLUMN)}, * FROM read_csv_auto('${fileName}'${optionsStr})`;
    try {
      await conn.query(createSql);
    } catch (err) {
      throw wrapReservedColumnError(err);
    }

    // Get row count
    const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tbl}`);
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
    await dropSourceFile(db, fileName);
  }
}

/**
 * Drop a table from DuckDB
 *
 * @param tableName - Name of the table to drop
 * @param context - Optional explicit { conn }; see {@link loadCSV} for rationale.
 */
export async function dropTable(tableName: string, context?: LoaderContext): Promise<void> {
  const conn = context?.conn ?? getConnection();
  await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}
