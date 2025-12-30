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
 */
export function analyzeDateContext(min: Date, max: Date): DateFormatContext {
  return {
    sameYear: min.getFullYear() === max.getFullYear(),
    sameMonth:
      min.getFullYear() === max.getFullYear() &&
      min.getMonth() === max.getMonth(),
    sameDay: min.toDateString() === max.toDateString(),
    referenceYear: min.getFullYear(),
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
  const month = MONTHS_SHORT[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const yearSuffix = getYearSuffix(year);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

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
      const quarter = getQuarter(date.getMonth());
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
      const endTime = formatTime(end.getHours(), end.getMinutes(), end.getSeconds());
      return `${startStr} - ${endTime}`;
    }

    case 'minute': {
      // Show time range: "10:30 - 10:31"
      const endTime = formatTime(end.getHours(), end.getMinutes());
      return `${startStr} - ${endTime}`;
    }

    case 'hour': {
      // Same day: "10am - 11am"
      // Different days: just show start label
      if (context.sameDay) {
        return `${startStr} - ${formatHour(end.getHours())}`;
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
  const month = MONTHS_SHORT[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

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
      return `Q${getQuarter(date.getMonth())} ${year}`;

    case 'year':
      return String(year);
  }
}
