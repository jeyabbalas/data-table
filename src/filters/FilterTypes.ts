/**
 * Discriminated union types for filters
 *
 * Replaces the old `{ type: string; value: unknown }` with proper
 * per-type interfaces so consumers get type-safe property access.
 */

export interface RangeFilter {
  type: 'range';
  column: string;
  min: number | string | Date;
  max: number | string | Date;
  /** When true, upper bound uses <= instead of <. Used for last histogram bin. */
  maxInclusive?: boolean;
  /** When true, lower bound uses > instead of >=. Used for strict greater-than filters. */
  minExclusive?: boolean;
  /** Value type hint for SQL generation. When 'interval', values are prefixed with INTERVAL keyword. */
  valueType?: 'interval';
}

export interface PointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | Date | null;
}

export interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included (generates `col IN (...) OR col IS NULL`). */
  includeNull?: boolean;
}

export interface NotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`). */
  includeNull?: boolean;
}

export interface NullFilter {
  type: 'null' | 'not-null';
  column: string;
}

export interface PatternFilter {
  type: 'pattern';
  column: string;
  pattern: string;
  mode: 'contains' | 'starts' | 'ends' | 'regex';
}

export interface RawSQLFilter {
  type: 'raw-sql';
  column: string;     // Synthetic key: '__raw_sql_<id>__'
  sql: string;        // WHERE clause fragment (no WHERE keyword)
  label?: string;     // Human-readable label for filter chip
  id: string;         // Unique identifier (crypto.randomUUID())
}

export type Filter = RangeFilter | PointFilter | SetFilter | NotSetFilter | NullFilter | PatternFilter | RawSQLFilter;
export type FilterType = Filter['type'];
