/**
 * FilterSQL - SQL generation utilities for filters
 *
 * Converts Filter objects to SQL WHERE clause fragments.
 * Moved from HistogramData.ts to a shared location since these are
 * general-purpose SQL utilities used across all visualization types.
 */

import { SQLValidationError } from '../core/errors';
import type { Filter } from '../core/types';

/**
 * Quote a SQL identifier (table/column name) for safe DuckDB use.
 *
 * Wraps `name` in double quotes and escapes embedded double quotes by
 * doubling them (`a"b` → `"a""b"`). Surrogate pairs and non-ASCII Unicode
 * pass through unchanged — DuckDB stores identifiers as UTF-8 text.
 *
 * Throws `SQLValidationError({ code: 'INVALID_IDENTIFIER' })` when:
 *  - `name` is the empty string (invalid SQL identifier), or
 *  - `name` contains an embedded NUL (`\0`) byte. NUL bytes truncate
 *    identifiers in some downstream tooling and have no legitimate use
 *    in a column or table name.
 *
 * Other ASCII control characters (`\x01`–`\x1f`, `\x7f`) are NOT stripped
 * here: DuckDB will reject them at parse time if it dislikes them, and
 * stripping silently would mask whichever upstream layer produced them.
 */
export function quoteIdentifier(name: string): string {
  if (name.length === 0) {
    throw new SQLValidationError('SQL identifier must not be empty', {
      code: 'INVALID_IDENTIFIER',
    });
  }
  if (name.includes('\0')) {
    throw new SQLValidationError('SQL identifier must not contain NUL bytes', {
      code: 'INVALID_IDENTIFIER',
    });
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Format a JS value as a SQL literal for splicing into a query string.
 *
 * Type handling:
 *  - `null` / `undefined` → `NULL`
 *  - `number` (finite)   → bare numeric literal (`42`, `-3.14`)
 *  - `number` (NaN/±∞)   → `NULL` (DuckDB has no NaN literal)
 *  - `bigint`            → bare numeric literal (`9223372036854775807`).
 *                          NOT quoted: BIGINT in DuckDB is numeric, and
 *                          quoting would force an implicit cast that is
 *                          fragile near the BIGINT range bounds.
 *  - `boolean`           → `TRUE` / `FALSE`
 *  - `Date`              → `'<ISO-8601>'`, single-quoted ISO string
 *  - everything else     → `'<String(value)>'` with single quotes doubled
 *
 * Identifier-quoting (column/table names) lives in `quoteIdentifier`; this
 * function is exclusively for value literals.
 */
export function formatSQLValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 'NULL';
    }
    return String(value);
  }

  if (typeof value === 'bigint') {
    // BIGINT is numeric in DuckDB — emit the bare numeric literal so SQL
    // doesn't have to round-trip through a string cast.
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  // String - escape single quotes by doubling them
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Escape special LIKE characters (%, _, \) in a pattern string.
 * Uses backslash as the escape character.
 */
function escapeLikePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, '\\\\') // \ → \\  (must be first)
    .replace(/%/g, '\\%') // % → \%
    .replace(/_/g, '\\_'); // _ → \_
}

/**
 * Convert a single filter to SQL WHERE clause fragment
 */
export function filterToSQL(filter: Filter): string {
  const column = quoteIdentifier(filter.column);

  switch (filter.type) {
    case 'range': {
      // Open-bound detection: Infinity/-Infinity are typeof 'number' and !isFinite,
      // while date/time string values are typeof 'string'. This correctly distinguishes
      // open bounds from actual values without needing a separate sentinel field.
      const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
      const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);
      const minOp = filter.minExclusive ? '>' : '>=';
      const maxOp = filter.maxInclusive ? '<=' : '<';

      // Interval values need INTERVAL prefix for DuckDB comparison
      const formatVal =
        filter.valueType === 'interval'
          ? (v: unknown) => `INTERVAL ${formatSQLValue(v)}`
          : formatSQLValue;

      if (minIsOpen && maxIsOpen) {
        return 'TRUE'; // No bounds — matches everything
      }
      if (minIsOpen) {
        // Open lower bound: only upper bound applies
        return `${column} ${maxOp} ${formatVal(filter.max)}`;
      }
      if (maxIsOpen) {
        // Open upper bound: only lower bound applies
        return `${column} ${minOp} ${formatVal(filter.min)}`;
      }
      // Both bounds finite
      const minVal = formatVal(filter.min);
      const maxVal = formatVal(filter.max);
      return `(${column} ${minOp} ${minVal} AND ${column} ${maxOp} ${maxVal})`;
    }

    case 'point': {
      if (filter.value === null || filter.value === undefined) {
        return `${column} IS NULL`;
      }
      const val = formatSQLValue(filter.value);
      return `${column} = ${val}`;
    }

    case 'set': {
      if (filter.values.length === 0) {
        return filter.includeNull ? `${column} IS NULL` : 'FALSE';
      }
      const formattedValues = filter.values.map(formatSQLValue).join(', ');
      const inClause = `${column} IN (${formattedValues})`;
      if (filter.includeNull) {
        return `(${inClause} OR ${column} IS NULL)`;
      }
      return inClause;
    }

    case 'not-set': {
      if (filter.values.length === 0) {
        // Nothing excluded → matches everything (with or without nulls)
        return 'TRUE';
      }
      const formattedValues = filter.values.map(formatSQLValue).join(', ');
      const notIn = `${column} NOT IN (${formattedValues})`;
      if (filter.includeNull) {
        return `(${notIn} OR ${column} IS NULL)`;
      }
      return notIn;
    }

    case 'null': {
      return `${column} IS NULL`;
    }

    case 'not-null': {
      return `${column} IS NOT NULL`;
    }

    case 'pattern': {
      const castCol = `CAST(${column} AS VARCHAR)`;
      const escaped = escapeLikePattern(filter.pattern).replace(/'/g, "''");
      switch (filter.mode) {
        case 'contains':
          return `${castCol} ILIKE '%${escaped}%' ESCAPE '\\'`;
        case 'starts':
          return `${castCol} ILIKE '${escaped}%' ESCAPE '\\'`;
        case 'ends':
          return `${castCol} ILIKE '%${escaped}' ESCAPE '\\'`;
        case 'regex':
          // Pattern is interpreted as a DuckDB regex (RE2-based, linear-time).
          // Doubling single quotes is the only escape needed to keep the user
          // string inside the SQL string literal — RE2 handles its own metachars.
          return `regexp_matches(${castCol}, '${filter.pattern.replace(/'/g, "''")}')`;
      }
      return 'FALSE';
    }

    case 'raw-sql':
      // `filter.sql` is the user-typed predicate from `addRawSQLFilter` — see
      // the trust-boundary JSDoc on `Actions.addRawSQLFilter`. Spliced verbatim;
      // DuckDB validates parseability, host app owns semantic validation.
      return '(' + filter.sql + ')';

    default: {
      // Unknown filter type - fail closed (match nothing) to avoid exposing unfiltered data
      console.error(`Unknown filter type: ${(filter as Filter).type}`);
      return 'FALSE';
    }
  }
}

/**
 * Convert an array of filters to a SQL WHERE clause fragment.
 *
 * Returns the predicates `AND`-joined **without** surrounding parentheses
 * — callers must wrap the result in `WHERE (...)` (or equivalent) when
 * concatenating with other predicates so operator precedence stays correct.
 *
 * @example
 * const where = filtersToWhereClause(filters);
 * const sql = where
 *   ? `SELECT * FROM ${tableId} WHERE ${where}`
 *   : `SELECT * FROM ${tableId}`;
 *
 * @param filters - Array of filters to convert.
 * @param excludeColumn - Optional column name to exclude from the WHERE
 *   clause (used for crossfilter behavior). Raw-SQL filters are never
 *   excluded — their synthetic column keys never match real columns.
 * @returns SQL fragment (no WHERE keyword), or empty string if no filters.
 */
export function filtersToWhereClause(filters: Filter[], excludeColumn?: string): string {
  // Filter out excluded column if specified.
  // Raw SQL filters are never excluded — they are global conditions that apply
  // to all crossfilter views (their synthetic column keys never match real columns).
  const applicableFilters = excludeColumn
    ? filters.filter((f) => f.type === 'raw-sql' || f.column !== excludeColumn)
    : filters;

  if (applicableFilters.length === 0) {
    return '';
  }

  // Convert each filter to SQL and join with AND
  const clauses = applicableFilters.map(filterToSQL);
  return clauses.join(' AND ');
}
