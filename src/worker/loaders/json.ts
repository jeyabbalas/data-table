/**
 * JSON data loader using DuckDB's native JSON parsing
 */

import { getDatabase, getConnection } from '../duckdb';
import type { LoadResult, JSONLoadOptions } from './types';

let tableCounter = 0;

/**
 * Generate a unique table name
 */
function generateTableName(): string {
  return `json_table_${++tableCounter}_${Date.now()}`;
}

/**
 * Detect if data is NDJSON (newline-delimited JSON)
 * NDJSON has one JSON object per line, not wrapped in an array
 */
function isNDJSON(data: string): boolean {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return false;

  try {
    const first = JSON.parse(lines[0]);
    // NDJSON has objects on each line, not an array
    return typeof first === 'object' && !Array.isArray(first);
  } catch {
    return false;
  }
}

/**
 * Load JSON data into a DuckDB table
 *
 * Supports:
 * - Array of objects: [{"a": 1}, {"a": 2}]
 * - Newline-delimited JSON (NDJSON): {"a": 1}\n{"a": 2}
 *
 * @param data - JSON content as string or ArrayBuffer
 * @param options - JSON loading options
 * @returns LoadResult with table name, row count, and columns
 */
export async function loadJSON(
  data: string | ArrayBuffer,
  options: JSONLoadOptions = {}
): Promise<LoadResult> {
  const db = getDatabase();
  const conn = getConnection();
  const tableName = options.tableName || generateTableName();

  // Convert ArrayBuffer to string if needed
  const jsonString =
    data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data;

  // Detect format if not specified
  const format = options.format || (isNDJSON(jsonString) ? 'ndjson' : 'array');

  // Convert to Uint8Array for DuckDB's file system
  const content = new TextEncoder().encode(jsonString);

  // Register file with DuckDB's virtual filesystem
  const fileName = `${tableName}.json`;
  await db.registerFileBuffer(fileName, content);

  try {
    // Build read_json options
    const jsonOptions: string[] = [];

    // Set format based on detection or user specification
    if (format === 'ndjson') {
      jsonOptions.push("format = 'newline_delimited'");
    } else {
      jsonOptions.push("format = 'array'");
    }

    // Enable auto-detection of types
    jsonOptions.push('auto_detect = true');

    if (options.sampleSize) {
      jsonOptions.push(`sample_size = ${options.sampleSize}`);
    }

    if (options.maxDepth) {
      jsonOptions.push(`maximum_depth = ${options.maxDepth}`);
    }

    // Create table from JSON using read_json_auto
    const optionsStr = `, ${jsonOptions.join(', ')}`;
    const createSql = `CREATE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${fileName}'${optionsStr})`;
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
