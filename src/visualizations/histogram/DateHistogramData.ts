/**
 * DateHistogramData - Data fetching and processing for date histogram visualizations
 *
 * This module provides:
 * - Automatic time interval detection based on data range
 * - DATE_TRUNC-based temporal binning via DuckDB
 * - Filter to SQL conversion (shared with numeric histogram)
 */

import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, formatSQLValue } from './HistogramData';
import type { TimeInterval } from './DateFormatters';

// Re-export TimeInterval for convenience
export type { TimeInterval } from './DateFormatters';

// =========================================
// Interfaces
// =========================================

/**
 * A single date histogram bin with date range and count
 */
export interface DateHistogramBin {
  /** Start of the bin (truncated timestamp) */
  binStart: Date;
  /** End of the bin (exclusive) - computed from interval */
  binEnd: Date;
  /** Number of values in this bin */
  count: number;
}

/**
 * Complete date histogram data including bins and metadata
 */
export interface DateHistogramData {
  /** Array of bins sorted by binStart */
  bins: DateHistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum non-null date */
  min: Date | null;
  /** Maximum non-null date */
  max: Date | null;
  /** Total count of all values (including nulls) */
  total: number;
  /** Detected/used interval for binning */
  interval: TimeInterval;
  /** True when all non-null values are identical (single timestamp) */
  isSingleValue: boolean;
  /** True when using numeric binning fallback (bins not aligned to calendar intervals) */
  isNumericBinning: boolean;
}

/**
 * Statistics result from initial query
 */
interface DateStatsResult {
  min_date: string | null;
  max_date: string | null;
  count: number;
  null_count: number;
}

/**
 * Bin query result
 */
interface DateBinResult {
  bin_start: string;
  count: number;
}

// =========================================
// Interval Detection
// =========================================

/**
 * Ordered list of time intervals from finest to coarsest
 */
const TIME_INTERVALS: TimeInterval[] = [
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
];

/**
 * Estimate the number of bins for a given time interval
 */
function estimateBinCount(min: Date, max: Date, interval: TimeInterval): number {
  const rangeMs = max.getTime() - min.getTime();

  switch (interval) {
    case 'second':
      return Math.ceil(rangeMs / 1000);
    case 'minute':
      return Math.ceil(rangeMs / 60000);
    case 'hour':
      return Math.ceil(rangeMs / 3600000);
    case 'day':
      return Math.ceil(rangeMs / 86400000);
    case 'week':
      return Math.ceil(rangeMs / 604800000);
    case 'month':
      return Math.ceil(rangeMs / 2592000000); // ~30 days
    case 'quarter':
      return Math.ceil(rangeMs / 7776000000); // ~90 days
    case 'year':
      return Math.ceil(rangeMs / 31536000000); // ~365 days
    default:
      return 1;
  }
}

/**
 * Adjust the time interval to ensure bins don't exceed maxBins
 *
 * Starts from the initial interval and coarsens it (e.g., day → week → month)
 * until the estimated bin count is within the limit.
 */
function adjustIntervalForMaxBins(
  min: Date,
  max: Date,
  initialInterval: TimeInterval,
  maxBins: number
): TimeInterval {
  let idx = TIME_INTERVALS.indexOf(initialInterval);
  let interval = initialInterval;

  // Coarsen the interval until bin count is within limit
  while (idx < TIME_INTERVALS.length - 1) {
    const estimatedBins = estimateBinCount(min, max, interval);
    if (estimatedBins <= maxBins) {
      break;
    }
    idx++;
    interval = TIME_INTERVALS[idx];
  }

  return interval;
}

/**
 * Detect the optimal time interval for binning based on data range
 *
 * Aims for approximately 10-30 bins for good visual density.
 * Uses conservative thresholds to avoid too many or too few bins.
 */
export function detectTimeInterval(min: Date, max: Date): TimeInterval {
  const rangeMs = max.getTime() - min.getTime();

  // Convert to approximate units
  const seconds = rangeMs / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  const years = days / 365.25;

  // Decision thresholds (aim for ~15-25 bins typical)
  if (seconds < 120) {
    // < 2 minutes
    return 'second';
  } else if (minutes < 120) {
    // < 2 hours
    return 'minute';
  } else if (hours < 48) {
    // < 2 days
    return 'hour';
  } else if (days < 60) {
    // < 2 months
    return 'day';
  } else if (days < 180) {
    // < 6 months
    return 'week';
  } else if (years < 3) {
    // < 3 years
    return 'month';
  } else if (years < 10) {
    // < 10 years
    return 'quarter';
  } else {
    // >= 10 years
    return 'year';
  }
}

/**
 * Map TimeInterval to DuckDB DATE_TRUNC part name
 */
function intervalToDateTruncPart(interval: TimeInterval): string {
  // DuckDB DATE_TRUNC supports these exact names
  const mapping: Record<TimeInterval, string> = {
    second: 'second',
    minute: 'minute',
    hour: 'hour',
    day: 'day',
    week: 'week',
    month: 'month',
    quarter: 'quarter',
    year: 'year',
  };
  return mapping[interval];
}

/**
 * Compute the end date of a bin given its start and interval
 *
 * Uses UTC methods to avoid timezone-related date shifts at boundaries.
 */
function computeBinEnd(binStart: Date, interval: TimeInterval): Date {
  const end = new Date(binStart);

  switch (interval) {
    case 'second':
      end.setUTCSeconds(end.getUTCSeconds() + 1);
      break;
    case 'minute':
      end.setUTCMinutes(end.getUTCMinutes() + 1);
      break;
    case 'hour':
      end.setUTCHours(end.getUTCHours() + 1);
      break;
    case 'day':
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    case 'week':
      end.setUTCDate(end.getUTCDate() + 7);
      break;
    case 'month':
      end.setUTCMonth(end.getUTCMonth() + 1);
      break;
    case 'quarter':
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case 'year':
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
  }

  return end;
}

/**
 * Parse a date string from DuckDB result
 * Handles ISO format and DuckDB timestamp format
 *
 * DuckDB returns timezone-naive strings like "2020-12-31 23:59:59".
 * We interpret these as UTC to match our UTC-based formatting.
 */
function parseDate(value: string | null): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  // DuckDB returns timezone-naive strings like "2020-12-31 23:59:59"
  // We need to interpret as UTC to match our UTC-based formatting
  let dateStr = value;

  // Check if the string already has timezone info (Z, +, or - after position 10)
  const hasTimezone = value.includes('Z') ||
    value.includes('+') ||
    (value.length > 10 && value.lastIndexOf('-') > 10);

  if (!hasTimezone) {
    // No timezone info - treat as UTC by converting to ISO format with Z suffix
    dateStr = value.replace(' ', 'T') + 'Z';
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.warn(`[DateHistogramData] Failed to parse date: ${value}`);
    return null;
  }

  return date;
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch date column statistics (min, max, count, nulls)
 */
async function fetchDateStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge
): Promise<{
  min: Date | null;
  max: Date | null;
  count: number;
  nullCount: number;
}> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  const sql = `
    SELECT
      MIN("${column}")::VARCHAR as min_date,
      MAX("${column}")::VARCHAR as max_date,
      COUNT("${column}") as count,
      COUNT(*) - COUNT("${column}") as null_count
    FROM "${tableName}"
    ${whereSQL}
  `;

  const results = await bridge.query<DateStatsResult>(sql);

  if (results.length === 0) {
    return { min: null, max: null, count: 0, nullCount: 0 };
  }

  const row = results[0];
  return {
    min: parseDate(row.min_date),
    max: parseDate(row.max_date),
    count: Number(row.count),
    nullCount: Number(row.null_count),
  };
}

/**
 * Build SQL query for date histogram binning using DATE_TRUNC
 */
function buildDateHistogramSQL(
  tableName: string,
  column: string,
  interval: TimeInterval,
  filters: Filter[]
): string {
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `"${column}" IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const truncPart = intervalToDateTruncPart(interval);

  // Use DATE_TRUNC for temporal binning
  // Cast to VARCHAR for consistent string output
  return `
    SELECT
      DATE_TRUNC('${truncPart}', "${column}")::VARCHAR as bin_start,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY 1
    ORDER BY 1
  `;
}

/**
 * SQL query result for numeric binning
 */
interface NumericBinResult {
  bin_idx: number;
  count: number;
}

/**
 * Build SQL query for numeric date histogram binning
 *
 * Used as a fallback when interval-based binning exceeds maxBins.
 * Treats dates as epoch milliseconds and divides into equal-width bins.
 */
function buildNumericDateHistogramSQL(
  tableName: string,
  column: string,
  numBins: number,
  minMs: number,
  maxMs: number,
  filters: Filter[]
): string {
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `"${column}" IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const binWidth = (maxMs - minMs) / numBins;

  // Use EPOCH to convert timestamp to seconds, then multiply by 1000 for milliseconds
  return `
    SELECT
      LEAST(FLOOR((EXTRACT(EPOCH FROM "${column}") * 1000 - ${minMs}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY bin_idx
    HAVING bin_idx >= 0 AND bin_idx < ${numBins}
    ORDER BY bin_idx
  `;
}

/**
 * Fetch date histogram data using numeric binning
 *
 * Fallback for when interval-based binning exceeds maxBins.
 * Creates exactly numBins equal-width bins based on epoch milliseconds.
 */
async function fetchDateHistogramWithNumericBinning(
  tableName: string,
  column: string,
  numBins: number,
  stats: { min: Date; max: Date; count: number; nullCount: number },
  filters: Filter[],
  bridge: WorkerBridge
): Promise<DateHistogramData> {
  const minMs = stats.min.getTime();
  const maxMs = stats.max.getTime();
  const binWidth = (maxMs - minMs) / numBins;

  const sql = buildNumericDateHistogramSQL(
    tableName,
    column,
    numBins,
    minMs,
    maxMs,
    filters
  );
  const binResults = await bridge.query<NumericBinResult>(sql);

  // Create all bins (even empty ones) for consistent visualization
  const bins: DateHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const binStartMs = minMs + i * binWidth;
    const binEndMs = i === numBins - 1 ? maxMs : minMs + (i + 1) * binWidth;
    bins.push({
      binStart: new Date(binStartMs),
      binEnd: new Date(binEndMs),
      count: 0,
    });
  }

  // Fill in counts from query results
  for (const result of binResults) {
    const idx = Number(result.bin_idx);
    if (idx >= 0 && idx < bins.length) {
      bins[idx].count = Number(result.count);
    }
  }

  return {
    bins,
    nullCount: stats.nullCount,
    min: stats.min,
    max: stats.max,
    total: stats.count + stats.nullCount,
    interval: 'day', // Placeholder - not used for numeric binning
    isSingleValue: false,
    isNumericBinning: true,
  };
}

/**
 * Fetch date histogram data for a date/timestamp column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column to histogram
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @param maxBins - Maximum number of bins (default: 15). The time interval will be
 *                  coarsened if necessary to keep bins within this limit.
 * @returns DateHistogramData with bins and metadata
 */
export async function fetchDateHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxBins: number = 15
): Promise<DateHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchDateStats(tableName, column, filters, bridge);

    // Handle edge case: no data (all nulls or empty)
    if (stats.count === 0 || stats.min === null || stats.max === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        min: null,
        max: null,
        total: stats.count + stats.nullCount,
        interval: 'day', // Default interval for empty data
        isSingleValue: false,
        isNumericBinning: false,
      };
    }

    // Step 2: Detect optimal time interval, then adjust for maxBins
    const initialInterval = detectTimeInterval(stats.min, stats.max);
    const interval = adjustIntervalForMaxBins(
      stats.min,
      stats.max,
      initialInterval,
      maxBins
    );

    // Step 2.5: Check if even the adjusted interval exceeds maxBins
    // If so, fall back to numeric binning
    const estimatedBins = estimateBinCount(stats.min, stats.max, interval);
    if (estimatedBins > maxBins) {
      // stats.min and stats.max are guaranteed non-null here (checked above)
      return await fetchDateHistogramWithNumericBinning(
        tableName,
        column,
        maxBins,
        { min: stats.min, max: stats.max, count: stats.count, nullCount: stats.nullCount },
        filters,
        bridge
      );
    }

    // Handle edge case: single value (all same timestamp)
    if (stats.min.getTime() === stats.max.getTime()) {
      const binEnd = computeBinEnd(stats.min, interval);
      return {
        bins: [
          {
            binStart: stats.min,
            binEnd: binEnd,
            count: stats.count,
          },
        ],
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
        interval,
        isSingleValue: true,
        isNumericBinning: false,
      };
    }

    // Step 3: Fetch binned data using DATE_TRUNC
    const sql = buildDateHistogramSQL(tableName, column, interval, filters);
    const binResults = await bridge.query<DateBinResult>(sql);

    // Step 4: Convert results to DateHistogramBin format
    const bins: DateHistogramBin[] = [];

    for (const result of binResults) {
      const binStart = parseDate(result.bin_start);
      if (binStart === null) continue;

      const binEnd = computeBinEnd(binStart, interval);
      bins.push({
        binStart,
        binEnd,
        count: Number(result.count),
      });
    }

    return {
      bins,
      nullCount: stats.nullCount,
      min: stats.min,
      max: stats.max,
      total: stats.count + stats.nullCount,
      interval,
      isSingleValue: false,
      isNumericBinning: false,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch date histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Re-export SQL utilities for external use
export { formatSQLValue };
