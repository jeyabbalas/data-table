/**
 * Shared utilities for data loaders
 *
 * Provides common functionality like timestamp detection and type conversion
 * that can be reused across CSV, JSON, and other loaders.
 */

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

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
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return (
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59 &&
    seconds >= 0 &&
    seconds < 60
  );
}

/**
 * Detect which string columns contain ISO timestamp values
 *
 * Samples values from each string column and checks if they match
 * the ISO timestamp pattern with high confidence.
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to analyze
 * @param stringColumns - List of VARCHAR column names to check
 * @param sampleSize - Number of distinct values to sample (default: 100)
 * @param confidenceThreshold - Minimum match ratio to consider as timestamp (default: 0.95)
 * @returns List of column names that contain timestamp values
 */
export async function detectTimestampColumns(
  conn: AsyncDuckDBConnection,
  tableName: string,
  stringColumns: string[],
  sampleSize: number = 100,
  confidenceThreshold: number = 0.95
): Promise<string[]> {
  const timestampColumns: string[] = [];

  for (const column of stringColumns) {
    try {
      // Sample distinct non-null values
      const sampleQuery = `
        SELECT DISTINCT "${column}" as value
        FROM "${tableName}"
        WHERE "${column}" IS NOT NULL
        LIMIT ${sampleSize}
      `;
      const samples = await conn.query(sampleQuery);
      const rows = samples.toArray();

      if (rows.length === 0) continue;

      const values = rows.map((row) => String(row.toJSON().value));

      // Count how many values match the ISO timestamp pattern
      const matches = values.filter((v) => isISOTimestamp(v));

      // If confidence threshold is met, mark as timestamp column
      if (matches.length / values.length >= confidenceThreshold) {
        timestampColumns.push(column);
      }
    } catch {
      // If sampling fails for a column, skip it
      continue;
    }
  }

  return timestampColumns;
}

/**
 * Detect which string columns contain ISO date values (YYYY-MM-DD)
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to analyze
 * @param stringColumns - List of VARCHAR column names to check
 * @param sampleSize - Number of distinct values to sample (default: 100)
 * @param confidenceThreshold - Minimum match ratio to consider as date (default: 0.95)
 * @returns List of column names that contain date values
 */
export async function detectDateColumns(
  conn: AsyncDuckDBConnection,
  tableName: string,
  stringColumns: string[],
  sampleSize: number = 100,
  confidenceThreshold: number = 0.95
): Promise<string[]> {
  const dateColumns: string[] = [];

  for (const column of stringColumns) {
    try {
      const sampleQuery = `
        SELECT DISTINCT "${column}" as value
        FROM "${tableName}"
        WHERE "${column}" IS NOT NULL
        LIMIT ${sampleSize}
      `;
      const samples = await conn.query(sampleQuery);
      const rows = samples.toArray();

      if (rows.length === 0) continue;

      const values = rows.map((row) => String(row.toJSON().value));
      const matches = values.filter((v) => isISODate(v));

      if (matches.length / values.length >= confidenceThreshold) {
        dateColumns.push(column);
      }
    } catch {
      continue;
    }
  }

  return dateColumns;
}

/**
 * Detect which string columns contain 24-hour time values (HH:MM:SS)
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to analyze
 * @param stringColumns - List of VARCHAR column names to check
 * @param sampleSize - Number of distinct values to sample (default: 100)
 * @param confidenceThreshold - Minimum match ratio to consider as time (default: 0.95)
 * @returns List of column names that contain time values
 */
export async function detectTimeColumns(
  conn: AsyncDuckDBConnection,
  tableName: string,
  stringColumns: string[],
  sampleSize: number = 100,
  confidenceThreshold: number = 0.95
): Promise<string[]> {
  const timeColumns: string[] = [];

  for (const column of stringColumns) {
    try {
      const sampleQuery = `
        SELECT DISTINCT "${column}" as value
        FROM "${tableName}"
        WHERE "${column}" IS NOT NULL
        LIMIT ${sampleSize}
      `;
      const samples = await conn.query(sampleQuery);
      const rows = samples.toArray();

      if (rows.length === 0) continue;

      const values = rows.map((row) => String(row.toJSON().value));
      const matches = values.filter((v) => isTimeFormat(v));

      if (matches.length / values.length >= confidenceThreshold) {
        timeColumns.push(column);
      }
    } catch {
      continue;
    }
  }

  return timeColumns;
}

/**
 * Convert string columns to TIMESTAMP type using DuckDB
 *
 * Recreates the table with a SELECT statement that CASTs timestamp columns
 * while preserving the original column order. This approach is necessary
 * because ALTER TABLE ADD COLUMN always appends columns at the end.
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to TIMESTAMP
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToTimestamp(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[]
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  // Build SELECT with CAST for timestamp columns, preserving original order
  const selectClauses = allColumns.map((col) => {
    if (columnsToConvert.has(col)) {
      // Convert VARCHAR to TIMESTAMP, using TRY_CAST to handle invalid values gracefully
      return `TRY_CAST("${col}" AS TIMESTAMP) AS "${col}"`;
    }
    // Keep other columns unchanged
    return `"${col}"`;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;

  try {
    // Create new table with correct types and preserved column order
    await conn.query(`
      CREATE TABLE "${tempTable}" AS
      SELECT ${selectClauses.join(', ')}
      FROM "${tableName}"
    `);

    // Drop original table
    await conn.query(`DROP TABLE "${tableName}"`);

    // Rename temp table to original name
    await conn.query(`ALTER TABLE "${tempTable}" RENAME TO "${tableName}"`);
  } catch {
    // If conversion fails, try to clean up temp table
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tempTable}"`);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to convert columns to timestamp in table ${tableName}`);
  }
}

/**
 * Convert string columns to DATE type using DuckDB
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to DATE
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToDate(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[]
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  const selectClauses = allColumns.map((col) => {
    if (columnsToConvert.has(col)) {
      return `TRY_CAST("${col}" AS DATE) AS "${col}"`;
    }
    return `"${col}"`;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;

  try {
    await conn.query(`
      CREATE TABLE "${tempTable}" AS
      SELECT ${selectClauses.join(', ')}
      FROM "${tableName}"
    `);

    await conn.query(`DROP TABLE "${tableName}"`);
    await conn.query(`ALTER TABLE "${tempTable}" RENAME TO "${tableName}"`);
  } catch {
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tempTable}"`);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to convert columns to date in table ${tableName}`);
  }
}

/**
 * Convert string columns to TIME type using DuckDB
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to modify
 * @param columns - List of column names to convert to TIME
 * @param allColumns - All column names in original order
 */
export async function convertColumnsToTime(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columns: string[],
  allColumns: string[]
): Promise<void> {
  if (columns.length === 0) return;

  const columnsToConvert = new Set(columns);

  const selectClauses = allColumns.map((col) => {
    if (columnsToConvert.has(col)) {
      return `TRY_CAST("${col}" AS TIME) AS "${col}"`;
    }
    return `"${col}"`;
  });

  const tempTable = `__temp_${tableName}_${Date.now()}`;

  try {
    await conn.query(`
      CREATE TABLE "${tempTable}" AS
      SELECT ${selectClauses.join(', ')}
      FROM "${tableName}"
    `);

    await conn.query(`DROP TABLE "${tableName}"`);
    await conn.query(`ALTER TABLE "${tempTable}" RENAME TO "${tableName}"`);
  } catch {
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tempTable}"`);
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to convert columns to time in table ${tableName}`);
  }
}

/**
 * Enhance schema by detecting and converting string columns to appropriate types
 *
 * Supports:
 * - ISO timestamp detection in VARCHAR columns (YYYY-MM-DDTHH:MM:SS)
 * - ISO date detection in VARCHAR columns (YYYY-MM-DD)
 * - 24-hour time detection in VARCHAR columns (HH:MM:SS)
 *
 * @param conn - DuckDB connection
 * @param tableName - Name of the table to enhance
 * @param describeRows - Current schema from DESCRIBE query
 * @returns Updated describeRows after type conversion
 */
export async function enhanceSchemaTypes(
  conn: AsyncDuckDBConnection,
  tableName: string,
  describeRows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  // Get all column names in original order (important for preserving order during conversion)
  let allColumns = describeRows.map((row) => String(row.column_name));

  // Find all VARCHAR columns
  const stringColumns = describeRows
    .filter((row) => String(row.column_type).toUpperCase() === 'VARCHAR')
    .map((row) => String(row.column_name));

  if (stringColumns.length === 0) {
    return describeRows;
  }

  let remainingStringColumns = [...stringColumns];
  let needsRefresh = false;

  // 1. Detect and convert timestamps (most specific pattern first)
  const timestampColumns = await detectTimestampColumns(
    conn,
    tableName,
    remainingStringColumns
  );

  if (timestampColumns.length > 0) {
    await convertColumnsToTimestamp(conn, tableName, timestampColumns, allColumns);
    remainingStringColumns = remainingStringColumns.filter(
      (c) => !timestampColumns.includes(c)
    );
    needsRefresh = true;
  }

  // 2. Detect and convert dates (from remaining VARCHAR columns)
  if (remainingStringColumns.length > 0) {
    // Refresh allColumns if we modified the table
    if (needsRefresh) {
      const newDescribe = await conn.query(`DESCRIBE "${tableName}"`);
      allColumns = newDescribe.toArray().map((row) => String(row.toJSON().column_name));
    }

    const dateColumns = await detectDateColumns(conn, tableName, remainingStringColumns);

    if (dateColumns.length > 0) {
      await convertColumnsToDate(conn, tableName, dateColumns, allColumns);
      remainingStringColumns = remainingStringColumns.filter(
        (c) => !dateColumns.includes(c)
      );
      needsRefresh = true;
    }
  }

  // 3. Detect and convert times (from remaining VARCHAR columns)
  if (remainingStringColumns.length > 0) {
    // Refresh allColumns if we modified the table
    if (needsRefresh) {
      const newDescribe = await conn.query(`DESCRIBE "${tableName}"`);
      allColumns = newDescribe.toArray().map((row) => String(row.toJSON().column_name));
    }

    const timeColumns = await detectTimeColumns(conn, tableName, remainingStringColumns);

    if (timeColumns.length > 0) {
      await convertColumnsToTime(conn, tableName, timeColumns, allColumns);
      needsRefresh = true;
    }
  }

  // Re-fetch final schema if any conversions happened
  if (needsRefresh) {
    const finalDescribeResult = await conn.query(`DESCRIBE "${tableName}"`);
    return finalDescribeResult.toArray().map((row) => row.toJSON());
  }

  return describeRows;
}
