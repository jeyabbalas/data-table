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
  tableName?: string | undefined;
  /** Delimiter character (auto-detected if not provided) */
  delimiter?: string | undefined;
  /** Whether the first row is a header (default: true) */
  header?: boolean | undefined;
  /** Number of sample rows for type detection (default: 1000) */
  sampleSize?: number | undefined;
  /** Skip N rows at the start */
  skip?: number | undefined;
  /** Null value strings (default: ['', 'NULL', 'null', 'NA', 'N/A']) */
  nullValues?: string[] | undefined;
  /** Timezone for TIMESTAMPTZ columns (default: 'UTC') */
  timezone?: string | undefined;
}

/**
 * Options for loading JSON data
 */
export interface JSONLoadOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string | undefined;
  /** JSON format: 'array' (array of objects) or 'ndjson' (newline-delimited) */
  format?: 'array' | 'ndjson' | undefined;
  /** Number of sample rows for type detection (default: 1000) */
  sampleSize?: number | undefined;
  /** Maximum depth for nested objects (default: unlimited) */
  maxDepth?: number | undefined;
  /** Timezone for TIMESTAMPTZ columns (default: 'UTC') */
  timezone?: string | undefined;
}

/**
 * Options for loading Parquet data
 */
export interface ParquetLoadOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string | undefined;
  /** Columns to load (default: all columns) */
  columns?: string[] | undefined;
  /** Timezone for TIMESTAMPTZ columns (default: 'UTC') */
  timezone?: string | undefined;
}
