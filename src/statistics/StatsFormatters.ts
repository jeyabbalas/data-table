/**
 * StatsFormatters - Format column stats into two-line HTML for header display
 *
 * Line 1 (universal): count + data quality (e.g., "1,234 rows · 5 null")
 * Line 2 (type-specific): distribution summary (e.g., "min 0 · med 42 · max 1.23e+6")
 */

import type { DataType } from '../core/types';
import type { ColumnStatsData } from './ColumnStatsTypes';
import { secondsToTimeString } from '../visualizations/histogram/TimeHistogramData';

// =========================================
// Number Formatting
// =========================================

/**
 * Format a data value for display in the stats panel.
 *
 * Uses the same rules as the histogram axis labels (formatAxisValue):
 * - |value| >= 1e6 → scientific notation (e.g., "1.23e+6")
 * - |value| < 0.01 (except 0) → scientific notation (e.g., "1.00e-3")
 * - Integer → locale-formatted with separators (e.g., "1,234")
 * - Float → locale-formatted, up to 2 decimal places (e.g., "3.14")
 */
export function formatStatValue(value: number): string {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? '\u221E' : '-\u221E';
  }

  if (value === 0) return '0';

  const abs = Math.abs(value);

  // Scientific notation for very large numbers
  if (abs >= 1e6) {
    return value.toExponential(2);
  }

  // Scientific notation for very small numbers
  if (abs < 0.01) {
    return value.toExponential(2);
  }

  // Integer formatting with thousands separators
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  // Decimal formatting: up to 2 decimal places
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format an integer count for display (rows, nulls, distinct values).
 * Uses locale formatting with thousands separators.
 */
export function formatCount(count: number): string {
  return count.toLocaleString();
}

// =========================================
// HTML Escaping
// =========================================

/**
 * Escape a string for safe HTML insertion.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =========================================
// Line 1: Universal Stats
// =========================================

/**
 * Format Line 1: count + data quality.
 *
 * Examples:
 * - "1,234 rows"
 * - "1,234 rows · 5 null"
 * - "892 / 1,234 rows · 3 null"
 * - "1,234 rows · all null"
 */
function formatLine1(stats: ColumnStatsData): string {
  const { totalRows, nullCount, filteredTotalRows } = stats;

  // Determine which counts to show
  const isFiltered =
    filteredTotalRows !== null && filteredTotalRows !== totalRows;

  let line: string;
  if (isFiltered) {
    // "1 / 1,234 rows" — plural based on total, since it reads "1 of 1,234 rows"
    const rowWord = totalRows === 1 ? 'row' : 'rows';
    line = `${formatCount(filteredTotalRows)} / ${formatCount(totalRows)} ${rowWord}`;
  } else {
    const rowWord = totalRows === 1 ? 'row' : 'rows';
    line = `${formatCount(totalRows)} ${rowWord}`;
  }

  // Null annotation
  const currentTotal = isFiltered ? filteredTotalRows : totalRows;
  if (nullCount > 0) {
    if (nullCount === currentTotal) {
      line += ' \u00B7 all null';
    } else {
      line += ` \u00B7 ${formatCount(nullCount)} null`;
    }
  }

  return line;
}

// =========================================
// Line 2: Type-Specific Stats
// =========================================

/**
 * Format Line 2 for numeric types (integer, float, decimal).
 * "min 0 · med 42 · max 1.23e+6"
 */
function formatNumericLine2(
  stats: Extract<ColumnStatsData, { kind: 'numeric' }>
): string {
  // Loose equality (==) catches both null and undefined as defense-in-depth
  if (stats.min == null || stats.max == null) return '';

  // Single value case
  if (stats.min === stats.max) {
    return `all values: ${formatStatValue(stats.min)}`;
  }

  const parts: string[] = [];
  parts.push(`min ${formatStatValue(stats.min)}`);
  if (stats.median !== null) {
    parts.push(`med ${formatStatValue(stats.median)}`);
  }
  parts.push(`max ${formatStatValue(stats.max)}`);

  return parts.join(' \u00B7 ');
}

/**
 * Format Line 2 for categorical types (string, boolean, uuid).
 */
function formatCategoricalLine2(
  stats: Extract<ColumnStatsData, { kind: 'categorical' }>,
  dataType: DataType
): string {
  if (stats.nonNullCount === 0) return '';

  if (dataType === 'boolean') {
    if (stats.trueCount !== undefined && stats.nonNullCount > 0) {
      const pct = Math.round((stats.trueCount / stats.nonNullCount) * 100);
      return `${pct}% true`;
    }
    return '';
  }

  // string or uuid
  const { distinctCount, nonNullCount } = stats;

  if (distinctCount === nonNullCount && nonNullCount > 1) {
    return 'all unique';
  }

  if (dataType === 'uuid') {
    if (nonNullCount > 0) {
      const pct = Math.round((distinctCount / nonNullCount) * 100);
      return `${formatCount(distinctCount)} unique (${pct}%)`;
    }
    return '';
  }

  // string
  return `${formatCount(distinctCount)} unique`;
}

/**
 * Format Line 2 for temporal types (date, timestamp).
 * "2020-01-01 – 2024-12-31"
 */
function formatTemporalLine2(
  stats: Extract<ColumnStatsData, { kind: 'temporal' }>
): string {
  // Loose equality (==) catches both null and undefined as defense-in-depth
  if (stats.min == null || stats.max == null) return '';

  const minDate = formatDateForStats(stats.min);
  const maxDate = formatDateForStats(stats.max);

  if (minDate === maxDate) {
    return `all values: ${escapeHtml(minDate)}`;
  }

  return `${escapeHtml(minDate)} \u2013 ${escapeHtml(maxDate)}`;
}

/**
 * Format a date/timestamp string for compact display.
 * Shows date only if the string contains a time component and dates differ,
 * otherwise shows the full relevant portion.
 */
function formatDateForStats(isoString: string): string {
  // DuckDB returns dates as "YYYY-MM-DD" and timestamps as "YYYY-MM-DD HH:MM:SS..."
  // Extract just the date part for compact display
  const dateMatch = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }
  // Fallback: escape and return as-is (shouldn't happen with valid DuckDB output)
  return escapeHtml(isoString);
}

/**
 * Format Line 2 for time type.
 * "08:00:00 – 23:45:00"
 */
function formatTimeLine2(
  stats: Extract<ColumnStatsData, { kind: 'time' }>
): string {
  if (stats.minSeconds === null || stats.maxSeconds === null) return '';

  const minTime = secondsToTimeString(stats.minSeconds);
  const maxTime = secondsToTimeString(stats.maxSeconds);

  if (minTime === maxTime) {
    return `all values: ${minTime}`;
  }

  return `${minTime} \u2013 ${maxTime}`;
}

/**
 * Format Line 2 for interval type.
 * "min 2h · med 8h · max 48h"
 */
function formatIntervalLine2(
  stats: Extract<ColumnStatsData, { kind: 'interval' }>
): string {
  if (stats.minDisplay === null || stats.maxDisplay === null) return '';

  if (stats.minDisplay === stats.maxDisplay) {
    return `all values: ${escapeHtml(stats.minDisplay)}`;
  }

  const parts: string[] = [];
  parts.push(`min ${escapeHtml(stats.minDisplay)}`);
  if (stats.medianDisplay !== null) {
    parts.push(`med ${escapeHtml(stats.medianDisplay)}`);
  }
  parts.push(`max ${escapeHtml(stats.maxDisplay)}`);

  return parts.join(' \u00B7 ');
}

// =========================================
// Main Formatter
// =========================================

/**
 * Format the complete two-line default stats HTML for a column header.
 *
 * @param stats - The computed column stats data
 * @param dataType - The column's DataType (needed to disambiguate categorical subtypes)
 * @returns HTML string with line1 and optional line2 wrapped in span elements
 */
export function formatDefaultStats(
  stats: ColumnStatsData,
  dataType: DataType
): string {
  const line1 = formatLine1(stats);

  // No line 2 for empty data or all-null columns
  const currentTotal =
    stats.filteredTotalRows !== null ? stats.filteredTotalRows : stats.totalRows;
  if (currentTotal === 0 || stats.nullCount === currentTotal) {
    return `<span class="dt-stats-line1">${line1}</span>`;
  }

  let line2 = '';
  switch (stats.kind) {
    case 'numeric':
      line2 = formatNumericLine2(stats);
      break;
    case 'categorical':
      line2 = formatCategoricalLine2(stats, dataType);
      break;
    case 'temporal':
      line2 = formatTemporalLine2(stats);
      break;
    case 'time':
      line2 = formatTimeLine2(stats);
      break;
    case 'interval':
      line2 = formatIntervalLine2(stats);
      break;
  }

  if (line2) {
    return `<span class="dt-stats-line1">${line1}</span><br><span class="dt-stats-line2">${line2}</span>`;
  }

  return `<span class="dt-stats-line1">${line1}</span>`;
}
