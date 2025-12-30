/**
 * TimeHistogramData - Data fetching and processing for TIME histogram visualizations
 *
 * This module provides:
 * - TIME string parsing to seconds from midnight
 * - Automatic time interval detection based on data range
 * - SQL-based binning using EPOCH extraction
 * - Filter to SQL conversion for TIME type
 *
 * TIME values in DuckDB are returned as strings like "12:30:45" or "12:30:45.123456"
 * and must be converted to numeric seconds for histogram binning.
 */

import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause } from './HistogramData';
import type { TimeInterval } from './DateFormatters';

// Re-export TimeInterval for convenience
export type { TimeInterval } from './DateFormatters';

// =========================================
// Interfaces
// =========================================

/**
 * A single time histogram bin with second ranges and count
 */
export interface TimeHistogramBin {
  /** Start of the bin in seconds from midnight */
  binStartSeconds: number;
  /** End of the bin in seconds from midnight (exclusive) */
  binEndSeconds: number;
  /** Number of values in this bin */
  count: number;
}

/**
 * Complete time histogram data including bins and metadata
 */
export interface TimeHistogramData {
  /** Array of bins sorted by binStartSeconds */
  bins: TimeHistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum non-null time in seconds from midnight */
  minSeconds: number | null;
  /** Maximum non-null time in seconds from midnight */
  maxSeconds: number | null;
  /** Total count of all values (including nulls) */
  total: number;
  /** Detected/used interval for binning */
  interval: TimeInterval;
  /** True when all non-null values are identical */
  isSingleValue: boolean;
}

/**
 * Statistics result from initial query
 */
interface TimeStatsResult {
  min_time: string | null;
  max_time: string | null;
  count: number;
  null_count: number;
}

/**
 * Bin query result
 */
interface TimeBinResult {
  bin_start: number;
  count: number;
}

// =========================================
// TIME Parsing
// =========================================

/**
 * Parse a TIME string from DuckDB to seconds from midnight
 *
 * Handles formats:
 * - "HH:MM:SS" (e.g., "12:30:45")
 * - "HH:MM:SS.ffffff" (e.g., "12:30:45.123456")
 *
 * @param value TIME string from DuckDB
 * @returns Seconds from midnight (with fractional part for subsecond precision), or null if invalid
 */
export function parseTimeToSeconds(value: string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  // Match HH:MM:SS with optional fractional seconds
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) {
    console.warn(`[TimeHistogramData] Failed to parse time: ${value}`);
    return null;
  }

  const [, h, m, s, frac] = match;
  const hours = parseInt(h, 10);
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s, 10);

  // Validate ranges
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    console.warn(`[TimeHistogramData] Invalid time values: ${value}`);
    return null;
  }

  // Calculate total seconds
  let totalSeconds = hours * 3600 + minutes * 60 + seconds;

  // Add fractional seconds if present
  if (frac) {
    totalSeconds += parseFloat(`0.${frac}`);
  }

  return totalSeconds;
}

/**
 * Convert seconds from midnight back to TIME string format
 *
 * @param seconds Seconds from midnight
 * @param includeFraction Whether to include fractional seconds
 * @returns TIME string in "HH:MM:SS" or "HH:MM:SS.fff" format
 */
export function secondsToTimeString(seconds: number, includeFraction = false): string {
  const totalSeconds = Math.floor(seconds);
  const frac = seconds - totalSeconds;

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (includeFraction && frac > 0) {
    // Convert fraction to milliseconds and format
    const ms = Math.round(frac * 1000);
    return `${timeStr}.${String(ms).padStart(3, '0')}`;
  }

  return timeStr;
}

// =========================================
// Interval Detection
// =========================================

/**
 * Detect the optimal time interval for binning based on data range
 *
 * TIME values always span at most 24 hours (0-86400 seconds).
 * Aims for approximately 10-30 bins for good visual density.
 */
export function detectTimeIntervalForTime(minSec: number, maxSec: number): TimeInterval {
  const rangeSec = maxSec - minSec;

  // Decision thresholds (aim for ~15-25 bins typical)
  if (rangeSec < 120) {
    // < 2 minutes → second-level binning
    return 'second';
  } else if (rangeSec < 7200) {
    // < 2 hours → minute-level binning
    return 'minute';
  } else {
    // Up to 24 hours → hour-level binning
    return 'hour';
  }
}

/**
 * Get bin size in seconds for a given interval
 */
function getIntervalBinSizeSeconds(interval: TimeInterval): number {
  switch (interval) {
    case 'second':
      return 1;
    case 'minute':
      return 60;
    case 'hour':
      return 3600;
    default:
      // For larger intervals, use hour as fallback
      return 3600;
  }
}

/**
 * Compute the end seconds of a bin given its start and interval
 */
function computeBinEnd(binStartSeconds: number, interval: TimeInterval): number {
  const binSize = getIntervalBinSizeSeconds(interval);
  return binStartSeconds + binSize;
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch time column statistics (min, max, count, nulls)
 */
async function fetchTimeStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge
): Promise<{
  minSeconds: number | null;
  maxSeconds: number | null;
  count: number;
  nullCount: number;
}> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  // Cast TIME to VARCHAR for consistent string output
  const sql = `
    SELECT
      MIN("${column}")::VARCHAR as min_time,
      MAX("${column}")::VARCHAR as max_time,
      COUNT("${column}") as count,
      COUNT(*) - COUNT("${column}") as null_count
    FROM "${tableName}"
    ${whereSQL}
  `;

  const results = await bridge.query<TimeStatsResult>(sql);

  if (results.length === 0) {
    return { minSeconds: null, maxSeconds: null, count: 0, nullCount: 0 };
  }

  const row = results[0];
  return {
    minSeconds: parseTimeToSeconds(row.min_time),
    maxSeconds: parseTimeToSeconds(row.max_time),
    count: Number(row.count),
    nullCount: Number(row.null_count),
  };
}

/**
 * Build SQL query for time histogram binning using EPOCH extraction
 */
function buildTimeHistogramSQL(
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

  const binSizeSeconds = getIntervalBinSizeSeconds(interval);

  // Use EPOCH to convert TIME to seconds, then bin
  // EXTRACT(EPOCH FROM time_column) returns seconds from midnight for TIME type
  return `
    SELECT
      FLOOR(EXTRACT(EPOCH FROM "${column}") / ${binSizeSeconds}) * ${binSizeSeconds} as bin_start,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY 1
    ORDER BY 1
  `;
}

/**
 * Fetch time histogram data for a TIME column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the TIME column to histogram
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns TimeHistogramData with bins and metadata
 */
export async function fetchTimeHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge
): Promise<TimeHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchTimeStats(tableName, column, filters, bridge);

    // Handle edge case: no data (all nulls or empty)
    if (stats.count === 0 || stats.minSeconds === null || stats.maxSeconds === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        minSeconds: null,
        maxSeconds: null,
        total: stats.count + stats.nullCount,
        interval: 'hour', // Default interval for empty data
        isSingleValue: false,
      };
    }

    // Step 2: Detect optimal time interval
    const interval = detectTimeIntervalForTime(stats.minSeconds, stats.maxSeconds);

    // Handle edge case: single value (all same time)
    if (stats.minSeconds === stats.maxSeconds) {
      const binEnd = computeBinEnd(stats.minSeconds, interval);
      return {
        bins: [
          {
            binStartSeconds: stats.minSeconds,
            binEndSeconds: binEnd,
            count: stats.count,
          },
        ],
        nullCount: stats.nullCount,
        minSeconds: stats.minSeconds,
        maxSeconds: stats.maxSeconds,
        total: stats.count + stats.nullCount,
        interval,
        isSingleValue: true,
      };
    }

    // Step 3: Fetch binned data using EPOCH extraction
    const sql = buildTimeHistogramSQL(tableName, column, interval, filters);
    const binResults = await bridge.query<TimeBinResult>(sql);

    // Step 4: Convert results to TimeHistogramBin format
    const bins: TimeHistogramBin[] = [];

    for (const result of binResults) {
      const binStartSeconds = Number(result.bin_start);
      const binEndSeconds = computeBinEnd(binStartSeconds, interval);
      bins.push({
        binStartSeconds,
        binEndSeconds,
        count: Number(result.count),
      });
    }

    return {
      bins,
      nullCount: stats.nullCount,
      minSeconds: stats.minSeconds,
      maxSeconds: stats.maxSeconds,
      total: stats.count + stats.nullCount,
      interval,
      isSingleValue: false,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch time histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Format a TIME value for SQL WHERE clause
 *
 * @param seconds Seconds from midnight
 * @returns SQL-safe TIME string
 */
export function formatTimeForSQL(seconds: number): string {
  const timeStr = secondsToTimeString(seconds, false);
  return `TIME '${timeStr}'`;
}
