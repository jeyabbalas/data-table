/**
 * Common types for data loaders
 */

/**
 * Result from loading data into DuckDB
 */
export interface LoadResult {
  /** Name of the created table */
  tableName: string;
  /** Number of rows loaded */
  rowCount: number;
  /** List of column names */
  columns: string[];
}

/**
 * Options for loading CSV data
 */
export interface CSVLoadOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string;
  /** Delimiter character (auto-detected if not provided) */
  delimiter?: string;
  /** Whether the first row is a header (default: true) */
  header?: boolean;
  /** Number of sample rows for type detection (default: 1000) */
  sampleSize?: number;
  /** Skip N rows at the start */
  skip?: number;
  /** Null value strings (default: ['', 'NULL', 'null', 'NA', 'N/A']) */
  nullValues?: string[];
}
