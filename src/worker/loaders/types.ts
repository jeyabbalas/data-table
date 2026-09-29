/**
 * Common types for data loaders
 */

import type { ColumnSchema } from '../../core/types';
import type {
  CSVSourceOptions,
  JSONSourceOptions,
  ParquetSourceOptions,
} from '../../data/sourceOptions';

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
 * Options for loading CSV data: how it is read (see {@link CSVSourceOptions}),
 * and the table it goes into.
 */
export interface CSVLoadOptions extends CSVSourceOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string | undefined;
  /** DuckDB's session time zone, set for the load (default: 'UTC'); see `SourceOptions.timezone` */
  timezone?: string | undefined;
}

/**
 * Options for loading JSON data: how it is read (see
 * {@link JSONSourceOptions}), and the table it goes into.
 */
export interface JSONLoadOptions extends JSONSourceOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string | undefined;
  /** DuckDB's session time zone, set for the load (default: 'UTC'); see `SourceOptions.timezone` */
  timezone?: string | undefined;
}

/**
 * Options for loading Parquet data: how it is read (see
 * {@link ParquetSourceOptions}), and the table it goes into.
 */
export interface ParquetLoadOptions extends ParquetSourceOptions {
  /** Table name to create (auto-generated if not provided) */
  tableName?: string | undefined;
  /** DuckDB's session time zone, set for the load (default: 'UTC'); see `SourceOptions.timezone` */
  timezone?: string | undefined;
}
