/**
 * CSV data loader using DuckDB's native CSV parsing
 */

import { getDatabase, getConnection } from '../duckdb';
import type { LoadResult, CSVLoadOptions } from './types';
import { mapDuckDBType } from '../../data/SchemaDetector';

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
      csvOptions.push(`delim = '${options.delimiter}'`);
    }

    if (options.header !== undefined) {
      csvOptions.push(`header = ${options.header}`);
    }

    if (options.sampleSize) {
      csvOptions.push(`sample_size = ${options.sampleSize}`);
    }

    if (options.skip) {
      csvOptions.push(`skip = ${options.skip}`);
    }

    // Create table from CSV using read_csv_auto
    const optionsStr = csvOptions.length > 0 ? `, ${csvOptions.join(', ')}` : '';
    const createSql = `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${fileName}'${optionsStr})`;
    await conn.query(createSql);

    // Get row count
    const countResult = await conn.query(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    const rowCount = Number(countResult.toArray()[0]?.toJSON().count || 0);

    // Get full schema info from DESCRIBE
    const describeResult = await conn.query(`DESCRIBE "${tableName}"`);
    const describeRows = describeResult.toArray().map((row) => row.toJSON());

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

/**
 * Drop a table from DuckDB
 *
 * @param tableName - Name of the table to drop
 */
export async function dropTable(tableName: string): Promise<void> {
  const conn = getConnection();
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
}
