/**
 * FilterSQL - SQL generation utilities for filters
 *
 * Converts Filter objects to SQL WHERE clause fragments.
 * Moved from HistogramData.ts to a shared location since these are
 * general-purpose SQL utilities used across all visualization types.
 */

import type { Filter } from '../core/types';

/**
 * Quote a SQL identifier (table/column name) with proper escaping.
 * Wraps in double quotes and escapes embedded double quotes by doubling them.
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

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

      if (minIsOpen && maxIsOpen) {
        return 'TRUE'; // No bounds — matches everything
      }
      if (minIsOpen) {
        // Open lower bound: only upper bound applies
        return `${column} ${maxOp} ${formatSQLValue(filter.max)}`;
      }
      if (maxIsOpen) {
        // Open upper bound: only lower bound applies
        return `${column} ${minOp} ${formatSQLValue(filter.min)}`;
      }
      // Both bounds finite
      const minVal = formatSQLValue(filter.min);
      const maxVal = formatSQLValue(filter.max);
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
          return `regexp_matches(${castCol}, '${filter.pattern.replace(/'/g, "''")}')`;
      }
      return 'FALSE';
    }

    default: {
      // Unknown filter type - fail closed (match nothing) to avoid exposing unfiltered data
      console.error(`Unknown filter type: ${(filter as Filter).type}`);
      return 'FALSE';
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
