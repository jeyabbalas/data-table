/**
 * DateFormatters - Context-aware date formatting utilities for DateHistogram
 *
 * Provides intelligent, human-readable date labels that:
 * - Omit redundant information (year when all dates are same year)
 * - Use 12-hour format for hours (10am, 3pm)
 * - Use short month names (Jan, Feb, Mar)
 * - Support all time intervals from seconds to years
 */

// =========================================
// Types
// =========================================

/**
 * Time interval granularities for date histogram binning
 */
export type TimeInterval =
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

/**
 * Context for formatting labels - determines what parts to show
 */
export interface DateFormatContext {
  /** All dates span the same year */
  sameYear: boolean;
  /** All dates span the same month */
  sameMonth: boolean;
  /** All dates span the same day */
  sameDay: boolean;
  /** Reference year for context */
  referenceYear: number;
}

// =========================================
// Constants
// =========================================

/** Short month names */
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// =========================================
// Helper Functions
// =========================================

/**
 * Format hour in 12-hour format: "12am", "10am", "12pm", "3pm"
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Format time as "HH:MM" or "HH:MM:SS"
 */
function formatTime(hour: number, minute: number, second?: number): string {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  if (second !== undefined) {
    const s = String(second).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  return `${h}:${m}`;
}

/**
 * Get short year suffix: "'24" from 2024
 */
function getYearSuffix(year: number): string {
  return `'${String(year).slice(-2)}`;
}

/**
 * Get quarter number (1-4) from month (0-11)
 */
function getQuarter(month: number): number {
  return Math.floor(month / 3) + 1;
}

// =========================================
// Public API
// =========================================

/**
 * Analyze date range to determine formatting context
 *
 * Used to decide what date parts to include in labels.
 * For example, if all dates are in the same year, we can omit the year.
 *
 * Note: Uses UTC methods to avoid timezone-related date shifts.
 */
export function analyzeDateContext(min: Date, max: Date): DateFormatContext {
  // Use UTC methods to avoid timezone shifts at date boundaries
  const minYear = min.getUTCFullYear();
  const maxYear = max.getUTCFullYear();
  const minMonth = min.getUTCMonth();
  const maxMonth = max.getUTCMonth();
  const minDay = min.getUTCDate();
  const maxDay = max.getUTCDate();

  return {
    sameYear: minYear === maxYear,
    sameMonth: minYear === maxYear && minMonth === maxMonth,
    sameDay: minYear === maxYear && minMonth === maxMonth && minDay === maxDay,
    referenceYear: minYear,
  };
}

/**
 * Format a date for axis label based on interval and context
 *
 * Produces human-readable short-hand labels:
 * - second:  "10:30:45"
 * - minute:  "10:30"
 * - hour:    "Jan 2, 10am" or "10am" (same day)
 * - day:     "Jan 2" or "Jan 2 '24"
 * - week:    "Jan 1" or "Jan 1 '24"
 * - month:   "Jan" or "Jan '24"
 * - quarter: "Q1" or "Q1 '24"
 * - year:    "2024"
 */
export function formatDateLabel(
  date: Date,
  interval: TimeInterval,
  context: DateFormatContext
): string {
  // Use UTC methods to avoid timezone shifts at date boundaries
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const yearSuffix = getYearSuffix(year);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  switch (interval) {
    case 'second':
      // Always show full time with seconds
      return formatTime(hour, minute, second);

    case 'minute':
      // Show HH:MM
      return formatTime(hour, minute);

    case 'hour':
      // Same day: just "10am"
      // Same year: "Jan 2, 10am"
      // Different year: "Jan 2 '24"
      if (context.sameDay) {
        return formatHour(hour);
      } else if (context.sameYear) {
        return `${month} ${day}, ${formatHour(hour)}`;
      } else {
        // When spanning years, show date without time to keep it short
        return `${month} ${day} ${yearSuffix}`;
      }

    case 'day':
      // Same year: "Jan 2"
      // Different year: "Jan 2 '24"
      return context.sameYear ? `${month} ${day}` : `${month} ${day} ${yearSuffix}`;

    case 'week':
      // Same as day - show first day of week
      return context.sameYear ? `${month} ${day}` : `${month} ${day} ${yearSuffix}`;

    case 'month':
      // Same year: "Jan"
      // Different year: "Jan '24"
      return context.sameYear ? month : `${month} ${yearSuffix}`;

    case 'quarter':
      // Same year: "Q1"
      // Different year: "Q1 '24"
      const quarter = getQuarter(date.getUTCMonth());
      return context.sameYear ? `Q${quarter}` : `Q${quarter} ${yearSuffix}`;

    case 'year':
      // Always show full year
      return String(year);
  }
}

/**
 * Format a date range for display in stats line (hover/selection)
 *
 * Produces a range string like:
 * - "10:30:45 - 10:30:46" (seconds)
 * - "10:30 - 10:31" (minutes)
 * - "Jan 2, 10am - 11am" (hours, same day)
 * - "Jan 2" (day - just show the bin label)
 */
export function formatDateRange(
  start: Date,
  end: Date,
  interval: TimeInterval,
  context: DateFormatContext
): string {
  const startStr = formatDateLabel(start, interval, context);

  switch (interval) {
    case 'second': {
      // Show time range: "10:30:45 - 10:30:46"
      // Use UTC methods to avoid timezone shifts
      const endTime = formatTime(end.getUTCHours(), end.getUTCMinutes(), end.getUTCSeconds());
      return `${startStr} - ${endTime}`;
    }

    case 'minute': {
      // Show time range: "10:30 - 10:31"
      // Use UTC methods to avoid timezone shifts
      const endTime = formatTime(end.getUTCHours(), end.getUTCMinutes());
      return `${startStr} - ${endTime}`;
    }

    case 'hour': {
      // Same day: "10am - 11am"
      // Different days: just show start label
      if (context.sameDay) {
        // Use UTC methods to avoid timezone shifts
        return `${startStr} - ${formatHour(end.getUTCHours())}`;
      }
      return startStr;
    }

    case 'day':
    case 'week':
    case 'month':
    case 'quarter':
    case 'year':
      // For larger intervals, the bin label is sufficient
      return startStr;
  }
}

/**
 * Format a date value for display in stats when showing bin boundaries
 * Used for more verbose stats display
 */
export function formatDateForStats(date: Date, interval: TimeInterval): string {
  // Use UTC methods to avoid timezone shifts at date boundaries
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  switch (interval) {
    case 'second':
      return `${month} ${day}, ${formatTime(hour, minute, second)}`;

    case 'minute':
      return `${month} ${day}, ${formatTime(hour, minute)}`;

    case 'hour':
      return `${month} ${day}, ${formatHour(hour)}`;

    case 'day':
    case 'week':
      return `${month} ${day}, ${year}`;

    case 'month':
      return `${month} ${year}`;

    case 'quarter':
      return `Q${getQuarter(date.getUTCMonth())} ${year}`;

    case 'year':
      return String(year);
  }
}

// =========================================
// TIME-only Formatters (for TIME histogram)
// =========================================

/**
 * Convert seconds from midnight to hour, minute, second components
 */
function secondsToComponents(seconds: number): { h: number; m: number; s: number } {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

/**
 * Format seconds from midnight as time-only axis label
 *
 * Produces compact labels for TIME histogram axes:
 * - second:  "10:30:45"
 * - minute:  "10:30"
 * - hour:    "10am"
 */
export function formatTimeOnlyLabel(seconds: number, interval: TimeInterval): string {
  const { h, m, s } = secondsToComponents(seconds);

  switch (interval) {
    case 'second':
      return formatTime(h, m, s);

    case 'minute':
      return formatTime(h, m);

    case 'hour':
    default:
      return formatHour(h);
  }
}

/**
 * Format a time-only range for display in stats line (hover/selection)
 *
 * Produces a range string like:
 * - "10:30:45 - 10:30:46" (seconds)
 * - "10:30 - 10:31" (minutes)
 * - "10am - 11am" (hours)
 */
export function formatTimeOnlyRange(
  startSec: number,
  endSec: number,
  interval: TimeInterval
): string {
  const startStr = formatTimeOnlyLabel(startSec, interval);

  switch (interval) {
    case 'second': {
      const { h, m, s } = secondsToComponents(endSec);
      return `${startStr} - ${formatTime(h, m, s)}`;
    }

    case 'minute': {
      const { h, m } = secondsToComponents(endSec);
      return `${startStr} - ${formatTime(h, m)}`;
    }

    case 'hour':
    default: {
      const { h } = secondsToComponents(endSec);
      return `${startStr} - ${formatHour(h)}`;
    }
  }
}

/**
 * Format seconds from midnight for verbose stats display
 * Shows full HH:MM:SS format regardless of interval
 */
export function formatTimeOnlyForStats(seconds: number): string {
  const { h, m, s } = secondsToComponents(seconds);
  return formatTime(h, m, s);
}

// =========================================
// Numeric Binning Formatters
// =========================================

/**
 * Format a date range for numeric binning (shows actual timestamps)
 *
 * Used when date histograms fall back to numeric binning because the data
 * range exceeds what can be displayed with interval-based bins.
 *
 * Produces a range string like:
 * - "Jan 5, 1980 14:32 – Mar 22, 1983 08:15"
 */
export function formatDateRangeNumeric(start: Date, end: Date): string {
  const formatFull = (d: Date): string => {
    const month = MONTHS_SHORT[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    return `${month} ${day}, ${year} ${formatTime(hour, minute)}`;
  };
  return `${formatFull(start)} – ${formatFull(end)}`;
}

/**
 * Format a time-only range for numeric binning (shows actual times with seconds)
 *
 * Used when time histograms fall back to numeric binning because the data
 * range exceeds what can be displayed with interval-based bins.
 *
 * Produces a range string like:
 * - "14:32:17 – 20:15:43"
 */
export function formatTimeOnlyRangeNumeric(startSec: number, endSec: number): string {
  const formatFull = (sec: number): string => {
    const { h, m, s } = secondsToComponents(sec);
    return formatTime(h, m, s);
  };
  return `${formatFull(startSec)} – ${formatFull(endSec)}`;
}

/**
 * Format a single date for axis label in numeric binning mode
 *
 * Shows full date with time for clarity when bins are not aligned to
 * calendar intervals.
 *
 * Produces a label like:
 * - "Jan 5, 1980 14:32"
 */
export function formatDateLabelNumeric(date: Date): string {
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  return `${month} ${day}, ${year} ${formatTime(hour, minute)}`;
}

/**
 * Format a single time for axis label in numeric binning mode
 *
 * Shows full HH:MM:SS for clarity when bins are not aligned to
 * time intervals.
 *
 * Produces a label like:
 * - "14:32:17"
 */
export function formatTimeOnlyLabelNumeric(seconds: number): string {
  const { h, m, s } = secondsToComponents(seconds);
  return formatTime(h, m, s);
}

// =========================================
// Type-Aware Formatters (respects column precision)
// =========================================

/**
 * Format a date for display based on column type precision
 *
 * - DATE type: Shows date only (e.g., "Jan 5, 1980")
 * - TIMESTAMP type: Shows date + time (e.g., "Jan 5, 1980 14:32")
 *
 * @param date - The date to format
 * @param columnType - The column type ('date' or 'timestamp')
 */
export function formatDateForType(date: Date, columnType: string): string {
  const month = MONTHS_SHORT[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();

  if (columnType === 'date') {
    // DATE type: no time component
    return `${month} ${day}, ${year}`;
  } else {
    // TIMESTAMP type: include time
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    return `${month} ${day}, ${year} ${formatTime(hour, minute)}`;
  }
}

/**
 * Format a date range for display based on column type precision
 *
 * - DATE type: Shows date only (e.g., "Jan 5, 1980 – Mar 22, 1983")
 * - TIMESTAMP type: Shows date + time (e.g., "Jan 5, 1980 14:32 – Mar 22, 1983 08:15")
 *
 * @param start - Start date of the range
 * @param end - End date of the range
 * @param columnType - The column type ('date' or 'timestamp')
 */
export function formatDateRangeForType(start: Date, end: Date, columnType: string): string {
  return `${formatDateForType(start, columnType)} – ${formatDateForType(end, columnType)}`;
}
