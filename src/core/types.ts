/**
 * Core type definitions for the Interactive Data Table Library
 */

// Column data types supported by the library
export type DataType =
  | 'integer'
  | 'float'
  | 'decimal'
  | 'string'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'interval';

// Column metadata
export interface ColumnSchema {
  name: string;
  type: DataType;
  nullable: boolean;
  originalType: string; // Original DuckDB type
}

// Filter types
export type FilterType = 'range' | 'point' | 'set' | 'not-set' | 'null' | 'not-null' | 'pattern';

export interface Filter {
  column: string;
  type: FilterType;
  value: unknown;
}

// Sort direction
export type SortDirection = 'asc' | 'desc';

// Sort column configuration
export interface SortColumn {
  column: string;
  direction: SortDirection;
}

// Configuration options
export interface DataTableOptions {
  container?: HTMLElement;
  headless?: boolean;
}
