/**
 * Discriminated union types for filters
 *
 * Replaces the old `{ type: string; value: unknown }` with proper
 * per-type interfaces so consumers get type-safe property access.
 */

/**
 * Range (`min` ≤ x ≤ `max` by default) filter on a numeric, date, or interval
 * column. Bounds may be widened to strict comparisons via `maxInclusive` /
 * `minExclusive`. Constructed by histogram brushing or explicit
 * `actions.addFilter({ type: 'range', … })` calls.
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

/**
 * Equality filter (`column = value`). NULL is allowed as a literal value;
 * it generates `column IS NULL`.
 */
export interface PointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | Date | null;
}

/**
 * Set-membership filter (`column IN (values)`). The {@link includeNull} flag
 * widens the predicate to include NULL rows.
 */
export interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included (generates `col IN (...) OR col IS NULL`). */
  includeNull?: boolean;
}

/**
 * Set-exclusion filter (`column NOT IN (values)`). Mirror of {@link SetFilter}.
 */
export interface NotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included (generates `col NOT IN (...) OR col IS NULL`). */
  includeNull?: boolean;
}

/**
 * NULL / NOT-NULL predicate filter — `column IS NULL` or `column IS NOT NULL`
 * depending on the discriminator value of `type`.
 */
export interface NullFilter {
  type: 'null' | 'not-null';
  column: string;
}

/**
 * String-pattern filter on a categorical column. The {@link mode} value picks
 * the comparison: `contains` / `starts` / `ends` use case-insensitive
 * substring matching; `regex` runs the pattern through DuckDB's RE2 engine
 * (linear-time, ReDoS-resistant). The `pattern` field is a literal user
 * string; SQL escaping is handled internally.
 */
export interface PatternFilter {
  type: 'pattern';
  column: string;
  pattern: string;
  mode: 'contains' | 'starts' | 'ends' | 'regex';
}

/**
 * Raw-SQL `WHERE`-clause fragment filter. Spliced verbatim into the active
 * query — see the trust-boundary note on {@link RawSQLFilter.sql}.
 */
export interface RawSQLFilter {
  type: 'raw-sql';
  column: string; // Synthetic key: '__raw_sql_<id>__'
  /**
   * SQL WHERE-clause fragment (no `WHERE` keyword).
   *
   * **Trust boundary.** Spliced verbatim into the query when filters are
   * evaluated. The library validates parseability via DuckDB
   * (`actions.validateSQLFilter`) but does not constrain semantics —
   * subqueries, UNIONs, and CTEs that DuckDB accepts will run with the
   * library's data access. Treat as trusted developer input; sanitise
   * at the host application layer if end users author the SQL.
   */
  sql: string;
  /**
   * Human-readable label for the filter chip. Widened to allow explicit
   * `undefined` so call sites that pass through an optional caller-supplied
   * label don't have to conditionally spread.
   */
  label?: string | undefined;
  id: string; // Unique identifier (crypto.randomUUID())
}

/**
 * Discriminated union of every filter shape understood by the library.
 * `actions.addFilter`, `state.filters`, the export pipeline, and
 * `filtersToWhereClause` all consume this union directly.
 */
export type Filter =
  | RangeFilter
  | PointFilter
  | SetFilter
  | NotSetFilter
  | NullFilter
  | PatternFilter
  | RawSQLFilter;

/** String literal union of every {@link Filter} discriminator value. */
export type FilterType = Filter['type'];
