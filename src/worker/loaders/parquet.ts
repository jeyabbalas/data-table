/**
 * Parquet data loader using DuckDB's native Parquet support
 */

import { getDatabase, getConnection } from '../duckdb';
import type { LoadResult, ParquetLoadOptions } from './types';
import { mapDuckDBType } from '../../data/SchemaDetector';
import { enhanceSchemaTypes } from './common';

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
  await conn.query(`SET TimeZone = '${timezone}'`);

  // Convert to Uint8Array for DuckDB's file system
  const content = new Uint8Array(data);

  // Register file with DuckDB's virtual filesystem
  const fileName = `${tableName}.parquet`;
  await db.registerFileBuffer(fileName, content);

  try {
    // Build column selection
    const columnSelect = options.columns?.length
      ? options.columns.map((c) => `"${c}"`).join(', ')
      : '*';

    // Create table from Parquet using read_parquet
    const createSql = `CREATE TABLE "${tableName}" AS SELECT ${columnSelect} FROM read_parquet('${fileName}')`;
    await conn.query(createSql);

    // Get row count
    const countResult = await conn.query(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE
    const describeResult = await conn.query(`DESCRIBE "${tableName}"`);
    let describeRows = describeResult.toArray().map((row) => row.toJSON());

    // Enhance schema by detecting and converting string columns to appropriate types
    describeRows = await enhanceSchemaTypes(conn, tableName, describeRows);

    const columns = describeRows.map((row) => String(row.column_name));
    const schema = describeRows.map((row) => ({
      name: String(row.column_name),
      type: mapDuckDBType(String(row.column_type)),
      nullable: row.null === 'YES',
      originalType: String(row.column_type),
    }));

    return { tableName, rowCount, columns, schema };
  } finally {
    // Clean up virtual file
    await db.dropFile(fileName);
  }
}
