/**
 * Parquet data loader using DuckDB's native Parquet support
 */

import { getDatabase, getConnection } from '../duckdb';
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
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadParquet(
  data: ArrayBuffer,
  options: ParquetLoadOptions = {}
): Promise<LoadResult> {
  const db = getDatabase();
  const conn = getConnection();
  const tableName = options.tableName || generateTableName();

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

    // Get column names
    const columnsResult = await conn.query(`DESCRIBE "${tableName}"`);
    const columns = columnsResult
      .toArray()
      .map((row) => String(row.toJSON().column_name));

    return { tableName, rowCount, columns };
  } finally {
    // Clean up virtual file
    await db.dropFile(fileName);
  }
}
