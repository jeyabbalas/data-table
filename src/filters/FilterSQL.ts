/**
 * FilterSQL - SQL generation utilities for filters
 *
 * Converts Filter objects to SQL WHERE clause fragments.
 * Moved from HistogramData.ts to a shared location since these are
 * general-purpose SQL utilities used across all visualization types.
 */

import type { Filter } from '../core/types';

/**
 * Format a value for use in SQL queries
 * Handles proper escaping and quoting
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
    .replace(/%/g, '\\%')   // % → \%
    .replace(/_/g, '\\_');   // _ → \_
}

/**
 * Convert a single filter to SQL WHERE clause fragment
 */
export function filterToSQL(filter: Filter): string {
  const column = `"${filter.column.replace(/"/g, '""')}"`;

  switch (filter.type) {
    case 'range': {
      const minVal = formatSQLValue(filter.min);
      const maxVal = formatSQLValue(filter.max);
      return `(${column} >= ${minVal} AND ${column} < ${maxVal})`;
    }

    case 'point': {
      const val = formatSQLValue(filter.value);
      return `${column} = ${val}`;
    }

    case 'set': {
      if (filter.values.length === 0) {
        return 'FALSE'; // Empty set matches nothing
      }
      const formattedValues = filter.values.map(formatSQLValue).join(', ');
      return `${column} IN (${formattedValues})`;
    }

    case 'not-set': {
      if (filter.values.length === 0) {
        return 'TRUE'; // Empty exclusion matches everything
      }
      const formattedValues = filter.values.map(formatSQLValue).join(', ');
      return `${column} NOT IN (${formattedValues})`;
    }

    case 'null': {
      return `${column} IS NULL`;
    }

    case 'not-null': {
      return `${column} IS NOT NULL`;
    }

    case 'pattern': {
      const escaped = escapeLikePattern(filter.pattern).replace(/'/g, "''");
      switch (filter.mode) {
        case 'contains':
          return `${column} LIKE '%${escaped}%' ESCAPE '\\'`;
        case 'starts':
          return `${column} LIKE '${escaped}%' ESCAPE '\\'`;
        case 'ends':
          return `${column} LIKE '%${escaped}' ESCAPE '\\'`;
        case 'regex':
          return `regexp_matches(${column}, '${filter.pattern.replace(/'/g, "''")}')`;
      }
    }

    default: {
      // Unknown filter type - return always true
      console.warn(`Unknown filter type: ${(filter as Filter).type}`);
      return 'TRUE';
    }
  }
}

/**
 * Convert an array of filters to a SQL WHERE clause
 *
 * @param filters - Array of filters to convert
 * @param excludeColumn - Optional column name to exclude from the WHERE clause
 *                        (used for crossfilter behavior)
 * @returns SQL WHERE clause (without the WHERE keyword), or empty string if no filters
 */
export function filtersToWhereClause(
  filters: Filter[],
  excludeColumn?: string
): string {
  // Filter out excluded column if specified
  const applicableFilters = excludeColumn
    ? filters.filter((f) => f.column !== excludeColumn)
    : filters;

  if (applicableFilters.length === 0) {
    return '';
  }

  // Convert each filter to SQL and join with AND
  const clauses = applicableFilters.map(filterToSQL);
  return clauses.join(' AND ');
}
