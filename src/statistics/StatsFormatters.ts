/**
 * StatsFormatters - Format column stats into two-line HTML for header display
 *
 * Line 1 (universal): count + data quality (e.g., "1,234 rows · 5 null")
 * Line 2 (type-specific): distribution summary (e.g., "min 0 · med 42 · max 1.23e+6")
 */

import { type Strings, defaultStrings } from '../core/Strings';
import type { DataType } from '../core/types';
import { secondsToTimeString } from '../visualizations/histogram/TimeHistogramData';
import type { ColumnStatsData } from './ColumnStatsTypes';

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
 * Format Line 1: count + data quality. Returns plain text (no HTML wrapping).
 *
 * The fraction form appears whenever any filter is active (`filteredTotalRows`
 * is non-null), even when the filtered count equals the total — so every
 * column signals "a filter is active" consistently.
 *
 * Examples:
 * - "1,234 rows"
 * - "1,234 rows · 5 null"
 * - "892 / 1,234 rows · 3 null"
 * - "1,234 / 1,234 rows"
 * - "1,234 rows · all null"
 */
export function formatStatsLine1(
  stats: ColumnStatsData,
  messages: Strings = defaultStrings,
): string {
  const { totalRows, nullCount, filteredTotalRows } = stats;
  const s = messages.statistics;

  const isFiltered = filteredTotalRows !== null;

  let line: string;
  if (isFiltered) {
    // "1 / 1,234 rows" — plural based on total, since it reads "1 of 1,234 rows"
    line = s.filteredRowCount(filteredTotalRows, totalRows);
  } else {
    line = s.rowCount(totalRows);
  }

  // Null annotation
  const currentTotal = isFiltered ? filteredTotalRows : totalRows;
  if (nullCount > 0) {
    if (nullCount === currentTotal) {
      line += `${s.separator}${s.allNull}`;
    } else {
      line += `${s.separator}${s.nullCount(nullCount)}`;
    }
  }

  return line;
}

// =========================================
// Line 2: Type-Specific Stats
// =========================================

/**
 * The end of line 2 for a column holding values its chart leaves out, having
 * no place on its axis (a number's `NaN`, `Infinity` and `-Infinity`, a
 * date's `infinity`, `-infinity` and dates a JavaScript `Date` cannot hold):
 * "30 non-finite". Null when the count is 0 or missing.
 */
function nonFiniteNote(count: number | undefined, messages: Strings): string | null {
  return count ? messages.statistics.nonFiniteCount(count) : null;
}

/**
 * Format Line 2 for numeric types (integer, float, decimal).
 * "min 0 · med 42 · max 1.23e+6", then "· 30 non-finite" for the `NaN` and
 * `±Infinity` values that the minimum, median and maximum leave out. A
 * column with no finite values shows the note alone.
 */
function formatNumericLine2(
  stats: Extract<ColumnStatsData, { kind: 'numeric' }>,
  messages: Strings,
): string {
  const s = messages.statistics;
  const note = nonFiniteNote(stats.nonFiniteCount, messages);
  // Loose equality (==) catches both null and undefined as defense-in-depth
  if (stats.min == null || stats.max == null) return note ?? '';

  // Single value case. Beside non-finite values, "all values" would be false.
  if (stats.min === stats.max && !note) {
    return s.allValues(formatStatValue(stats.min));
  }

  const parts: string[] = [];
  parts.push(s.min(formatStatValue(stats.min)));
  if (stats.median !== null) {
    parts.push(s.median(formatStatValue(stats.median)));
  }
  parts.push(s.max(formatStatValue(stats.max)));
  if (note) parts.push(note);

  return parts.join(s.separator);
}

/**
 * Format Line 2 for categorical types (string, boolean, uuid).
 */
function formatCategoricalLine2(
  stats: Extract<ColumnStatsData, { kind: 'categorical' }>,
  dataType: DataType,
  messages: Strings,
): string {
  const s = messages.statistics;
  if (stats.nonNullCount === 0) return '';

  if (dataType === 'boolean') {
    if (stats.trueCount !== undefined && stats.nonNullCount > 0) {
      const pct = Math.round((stats.trueCount / stats.nonNullCount) * 100);
      return s.percentTrue(pct);
    }
    return '';
  }

  // string or uuid
  const { distinctCount, nonNullCount } = stats;

  if (distinctCount === nonNullCount && nonNullCount > 1) {
    return s.allUnique;
  }

  if (dataType === 'uuid') {
    if (nonNullCount > 0) {
      const pct = Math.round((distinctCount / nonNullCount) * 100);
      return s.uniquePercent(distinctCount, pct);
    }
    return '';
  }

  // string
  return s.uniqueCount(distinctCount);
}

/**
 * Format Line 2 for temporal types (date, timestamp).
 * "2020-01-01 – 2024-12-31", then "· 2 non-finite" for the `infinity`,
 * `-infinity` and far-off dates that the range leaves out. A column with
 * none the chart can draw shows the note alone.
 */
function formatTemporalLine2(
  stats: Extract<ColumnStatsData, { kind: 'temporal' }>,
  messages: Strings,
): string {
  const s = messages.statistics;
  const note = nonFiniteNote(stats.nonFiniteCount, messages);
  // Loose equality (==) catches both null and undefined as defense-in-depth
  if (stats.min == null || stats.max == null) return note ?? '';

  const minDate = formatDateForStats(stats.min);
  const maxDate = formatDateForStats(stats.max);

  // Beside values the chart leaves out, "all values" would be false.
  if (minDate === maxDate && !note) {
    return s.allValues(escapeHtml(minDate));
  }

  const parts = [`${escapeHtml(minDate)} \u2013 ${escapeHtml(maxDate)}`];
  if (note) parts.push(note);
  return parts.join(s.separator);
}

/**
 * Format a date/timestamp string for compact display.
 * Shows date only if the string contains a time component and dates differ,
 * otherwise shows the full relevant portion.
 */
function formatDateForStats(isoString: string): string {
  // ISO text, "YYYY-MM-DD…" as `toISOString` writes it: extract just the
  // date part for compact display. A year before 1 or past 9999 keeps its
  // sign and six digits, "-000043-03-15" (44 BC) and "+012000-01-01", as
  // the grid's cells show it.
  const dateMatch = isoString.match(/^((?:[+-]\d{6}|\d{4})-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1]!;
  }
  // Fallback: escape and return as-is (shouldn't happen with valid DuckDB output)
  return escapeHtml(isoString);
}

/**
 * Format Line 2 for time type.
 * "08:00:00 – 23:45:00"
 */
function formatTimeLine2(
  stats: Extract<ColumnStatsData, { kind: 'time' }>,
  messages: Strings,
): string {
  if (stats.minSeconds === null || stats.maxSeconds === null) return '';

  const minTime = secondsToTimeString(stats.minSeconds);
  const maxTime = secondsToTimeString(stats.maxSeconds);

  if (minTime === maxTime) {
    return messages.statistics.allValues(minTime);
  }

  return `${minTime} \u2013 ${maxTime}`;
}

/**
 * Format Line 2 for interval type.
 * "min 2h · med 8h · max 48h"
 */
function formatIntervalLine2(
  stats: Extract<ColumnStatsData, { kind: 'interval' }>,
  messages: Strings,
): string {
  const s = messages.statistics;
  if (stats.minDisplay === null || stats.maxDisplay === null) return '';

  if (stats.minDisplay === stats.maxDisplay) {
    return s.allValues(escapeHtml(stats.minDisplay));
  }

  const parts: string[] = [];
  parts.push(s.min(escapeHtml(stats.minDisplay)));
  if (stats.medianDisplay !== null) {
    parts.push(s.median(escapeHtml(stats.medianDisplay)));
  }
  parts.push(s.max(escapeHtml(stats.maxDisplay)));

  return parts.join(s.separator);
}

/**
 * Format Line 2 for nested types (list, array, struct, map, union, variant):
 * the column's type outline, `x double · y double · tier varchar`. Escaped:
 * field names come from the data file, and the line is HTML.
 */
function formatNestedLine2(stats: Extract<ColumnStatsData, { kind: 'nested' }>): string {
  return escapeHtml(stats.outline);
}

// =========================================
// Main Formatter
// =========================================

/**
 * Format Line 2: the type-specific distribution summary. Returns text that may
 * contain pre-escaped values (dates, interval displays, a nested column's type
 * outline), or '' when there is nothing to show (empty data, all-null column,
 * or no computable summary).
 *
 * @param stats - The computed column stats data
 * @param dataType - The column's DataType (needed to disambiguate categorical subtypes)
 * @param messages - Resolved i18n strings. Defaults to English.
 */
export function formatStatsLine2(
  stats: ColumnStatsData,
  dataType: DataType,
  messages: Strings = defaultStrings,
): string {
  // No line 2 for empty data or all-null columns
  const currentTotal = stats.filteredTotalRows !== null ? stats.filteredTotalRows : stats.totalRows;
  if (currentTotal === 0 || stats.nullCount === currentTotal) {
    return '';
  }

  switch (stats.kind) {
    case 'numeric':
      return formatNumericLine2(stats, messages);
    case 'categorical':
      return formatCategoricalLine2(stats, dataType, messages);
    case 'temporal':
      return formatTemporalLine2(stats, messages);
    case 'time':
      return formatTimeLine2(stats, messages);
    case 'interval':
      return formatIntervalLine2(stats, messages);
    case 'nested':
      return formatNestedLine2(stats);
  }
}

/**
 * Format the complete two-line default stats HTML for a column header.
 *
 * @param stats - The computed column stats data
 * @param dataType - The column's DataType (needed to disambiguate categorical subtypes)
 * @param messages - Resolved i18n strings. Defaults to English.
 * @returns HTML string with line1 and optional line2 wrapped in span elements
 */
export function formatDefaultStats(
  stats: ColumnStatsData,
  dataType: DataType,
  messages: Strings = defaultStrings,
): string {
  const line1 = formatStatsLine1(stats, messages);
  const line2 = formatStatsLine2(stats, dataType, messages);

  if (line2) {
    return `<span class="dt-stats-line1">${line1}</span><br><span class="dt-stats-line2">${line2}</span>`;
  }

  return `<span class="dt-stats-line1">${line1}</span>`;
}
