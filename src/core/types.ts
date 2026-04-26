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
  isDerived?: boolean; // true for derived columns (expression or vector)
  expression?: string; // SQL expression (expression columns only)
  /**
   * true for library-synthesized columns (e.g. `__rowid__`). System columns are
   * excluded from the default rendered grid and from default exports, but remain
   * first-class queryable columns in DuckDB and appear in the column chooser.
   * Note: this flag is re-applied by loaders on each load; it is not persisted
   * in the current session snapshot (schema is re-derived on restore).
   */
  system?: boolean;
}

/**
 * Stable row identity produced at load time by the loaders and stored in the
 * reserved `__rowid__` column. 0-indexed, monotonic, BIGINT-backed, stable
 * across sort/filter/derived-column changes for the lifetime of the session.
 */
export type RowId = bigint;

/** Name of the library-reserved synthetic row-id column. */
export const ROWID_COLUMN = '__rowid__';

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

/**
 * A label/value entry inside a column-header tooltip.
 *
 * - `value: string` renders inline next to the label ("Units: USD").
 * - `value: string[]` renders as a wrapping chip list — a natural fit for
 *   enum sets. Empty array drops the row.
 */
export interface ColumnHeaderTooltipItem {
  label: string;
  value: string | string[];
}

/**
 * Structured content for a column-header tooltip popover.
 *
 * Every field is optional. An object with all fields empty (or missing)
 * normalizes to `null` (i.e. clears the tooltip).
 *
 * The library renders all string fields via `.textContent` — HTML strings
 * are NOT supported and not interpreted. This eliminates the XSS surface
 * by construction.
 */
export interface ColumnHeaderTooltipContent {
  /** Optional bold heading. */
  title?: string;
  /** Optional free-text body. Whitespace preserved (`white-space: pre-wrap`). */
  description?: string;
  /** Optional ordered list of label/value items. */
  items?: ColumnHeaderTooltipItem[];
}
