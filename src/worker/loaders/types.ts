/**
 * Common types for data loaders
 */

import type { ColumnSchema } from '../../core/types';

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
  /** Full schema with type information */
  schema: ColumnSchema[];
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

/**
 * Options for loading JSON data
 */
export interface JSONLoadOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string;
  /** JSON format: 'array' (array of objects) or 'ndjson' (newline-delimited) */
  format?: 'array' | 'ndjson';
  /** Number of sample rows for type detection (default: 1000) */
  sampleSize?: number;
  /** Maximum depth for nested objects (default: unlimited) */
  maxDepth?: number;
}

/**
 * Options for loading Parquet data
 */
export interface ParquetLoadOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string;
  /** Columns to load (default: all columns) */
  columns?: string[];
}
