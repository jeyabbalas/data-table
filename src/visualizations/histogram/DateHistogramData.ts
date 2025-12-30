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
 */
function parseDate(value: string | null): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  // DuckDB may return timestamps as ISO strings or as Date objects
  const date = new Date(value);
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
 * Fetch date histogram data for a date/timestamp column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column to histogram
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns DateHistogramData with bins and metadata
 */
export async function fetchDateHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge
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
      };
    }

    // Step 2: Detect optimal time interval
    const interval = detectTimeInterval(stats.min, stats.max);

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
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch date histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Re-export SQL utilities for external use
export { formatSQLValue };
