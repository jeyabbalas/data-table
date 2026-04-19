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
  isDerived?: boolean;  // true for derived columns (expression or vector)
  expression?: string;  // SQL expression (expression columns only)
}

// Filter types (re-exported from FilterTypes for backward compatibility)
export type {
  Filter,
  FilterType,
  RangeFilter,
  PointFilter,
  SetFilter,
  NotSetFilter,
  NullFilter,
  PatternFilter,
  RawSQLFilter,
} from '../filters/FilterTypes';

// Sort direction
export type SortDirection = 'asc' | 'desc';

// Sort column configuration
export interface SortColumn {
  column: string;
  direction: SortDirection;
}
