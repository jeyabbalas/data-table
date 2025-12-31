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
  /** True when using numeric binning fallback (bins not aligned to time intervals) */
  isNumericBinning: boolean;
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
 * Ordered list of time intervals from finest to coarsest (for TIME type)
 * TIME columns only use second, minute, hour since they represent time-of-day
 */
const TIME_INTERVALS: TimeInterval[] = ['second', 'minute', 'hour'];

/**
 * Estimate the number of bins for a given time interval
 */
function estimateBinCountForTime(
  minSec: number,
  maxSec: number,
  interval: TimeInterval
): number {
  const rangeSec = maxSec - minSec;

  switch (interval) {
    case 'second':
      return Math.ceil(rangeSec);
    case 'minute':
      return Math.ceil(rangeSec / 60);
    case 'hour':
      return Math.ceil(rangeSec / 3600);
    default:
      return 1;
  }
}

/**
 * Adjust the time interval to ensure bins don't exceed maxBins
 *
 * Starts from the initial interval and coarsens it (e.g., second → minute → hour)
 * until the estimated bin count is within the limit.
 */
function adjustIntervalForMaxBinsTime(
  minSec: number,
  maxSec: number,
  initialInterval: TimeInterval,
  maxBins: number
): TimeInterval {
  let idx = TIME_INTERVALS.indexOf(initialInterval);
  let interval = initialInterval;

  // Coarsen the interval until bin count is within limit
  while (idx < TIME_INTERVALS.length - 1) {
    const estimatedBins = estimateBinCountForTime(minSec, maxSec, interval);
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
 * SQL query result for numeric binning
 */
interface NumericBinResult {
  bin_idx: number;
  count: number;
}

/**
 * Build SQL query for numeric time histogram binning
 *
 * Used as a fallback when interval-based binning exceeds maxBins.
 * Treats times as seconds from midnight and divides into equal-width bins.
 */
function buildNumericTimeHistogramSQL(
  tableName: string,
  column: string,
  numBins: number,
  minSec: number,
  maxSec: number,
  filters: Filter[]
): string {
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `"${column}" IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const binWidth = (maxSec - minSec) / numBins;

  // Use EPOCH to convert TIME to seconds from midnight
  return `
    SELECT
      LEAST(FLOOR((EXTRACT(EPOCH FROM "${column}") - ${minSec}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY bin_idx
    HAVING bin_idx >= 0 AND bin_idx < ${numBins}
    ORDER BY bin_idx
  `;
}

/**
 * Fetch time histogram data using numeric binning
 *
 * Fallback for when interval-based binning exceeds maxBins.
 * Creates exactly numBins equal-width bins based on seconds from midnight.
 */
async function fetchTimeHistogramWithNumericBinning(
  tableName: string,
  column: string,
  numBins: number,
  stats: { minSeconds: number; maxSeconds: number; count: number; nullCount: number },
  filters: Filter[],
  bridge: WorkerBridge
): Promise<TimeHistogramData> {
  const binWidth = (stats.maxSeconds - stats.minSeconds) / numBins;

  const sql = buildNumericTimeHistogramSQL(
    tableName,
    column,
    numBins,
    stats.minSeconds,
    stats.maxSeconds,
    filters
  );
  const binResults = await bridge.query<NumericBinResult>(sql);

  // Create all bins (even empty ones) for consistent visualization
  const bins: TimeHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const binStartSeconds = stats.minSeconds + i * binWidth;
    const binEndSeconds = i === numBins - 1 ? stats.maxSeconds : stats.minSeconds + (i + 1) * binWidth;
    bins.push({
      binStartSeconds,
      binEndSeconds,
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
    minSeconds: stats.minSeconds,
    maxSeconds: stats.maxSeconds,
    total: stats.count + stats.nullCount,
    interval: 'hour', // Placeholder - not used for numeric binning
    isSingleValue: false,
    isNumericBinning: true,
  };
}

/**
 * Fetch time histogram data for a TIME column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the TIME column to histogram
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @param maxBins - Maximum number of bins (default: 15). The time interval will be
 *                  coarsened if necessary to keep bins within this limit.
 * @returns TimeHistogramData with bins and metadata
 */
export async function fetchTimeHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxBins: number = 15
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
        isNumericBinning: false,
      };
    }

    // Step 2: Detect optimal time interval, then adjust for maxBins
    const initialInterval = detectTimeIntervalForTime(stats.minSeconds, stats.maxSeconds);
    const interval = adjustIntervalForMaxBinsTime(
      stats.minSeconds,
      stats.maxSeconds,
      initialInterval,
      maxBins
    );

    // Step 2.5: Check if even the adjusted interval exceeds maxBins
    // If so, fall back to numeric binning
    const estimatedBins = estimateBinCountForTime(stats.minSeconds, stats.maxSeconds, interval);
    if (estimatedBins > maxBins) {
      // stats.minSeconds and stats.maxSeconds are guaranteed non-null here (checked above)
      return await fetchTimeHistogramWithNumericBinning(
        tableName,
        column,
        maxBins,
        { minSeconds: stats.minSeconds, maxSeconds: stats.maxSeconds, count: stats.count, nullCount: stats.nullCount },
        filters,
        bridge
      );
    }

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
        isNumericBinning: false,
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
      isNumericBinning: false,
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
