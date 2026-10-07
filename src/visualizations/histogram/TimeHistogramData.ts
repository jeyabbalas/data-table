/**
 * TimeHistogramData - Data fetching and processing for TIME histogram visualizations
 *
 * This module provides:
 * - Automatic time interval detection based on data range
 * - SQL-based binning using EPOCH extraction
 * - Filter to SQL conversion for TIME type
 *
 * Every position is a number of seconds since midnight from DuckDB,
 * `EXTRACT(EPOCH FROM col)`, for the range as for the bins; no text is
 * parsed. For a TIME WITH TIME ZONE that is the time of day as written, the
 * offset ignored (`01:30:00+05:30` is 5400). A TIME_NS is truncated to
 * microseconds. `24:00:00`, a valid TIME, is 86400: it is counted in the
 * day's last bar.
 */

import { isTimeWithTimeZone } from '../../core/duckdbType';
import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../../filters/FilterSQL';
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
  /**
   * End of the bin in seconds from midnight (exclusive). A bar ending at
   * 86400 holds `24:00:00` too.
   */
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
  /**
   * Minimum non-null time in seconds from midnight, as `EXTRACT(EPOCH …)`
   * gives it: a TIME WITH TIME ZONE's time of day as written, its offset
   * ignored.
   */
  minSeconds: number | null;
  /** Maximum non-null time in seconds from midnight; `24:00:00` is 86400. */
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
  min_sec: number | null;
  max_sec: number | null;
  count: number;
  null_count: number;
}

/**
 * Seconds in a day, and the largest time of day: `24:00:00`. No bar starts
 * there; the day's last bar ends there and holds it.
 */
export const SECONDS_PER_DAY = 86400;

/**
 * Bin query result
 */
interface TimeBinResult {
  bin_start: number;
  count: number;
}

// =========================================
// TIME Formatting
// =========================================

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
export function estimateBinCountForTime(
  minSec: number,
  maxSec: number,
  interval: TimeInterval,
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
export function adjustIntervalForMaxBinsTime(
  minSec: number,
  maxSec: number,
  initialInterval: TimeInterval,
  maxBins: number,
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
    interval = TIME_INTERVALS[idx]!;
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

/**
 * Bins from the rows of {@link buildTimeHistogramSQL}, in its order.
 *
 * `24:00:00` (86400) comes back in a bin of its own, past the day's end,
 * whose brush would end at `'25:00:00'`, which is not a TIME. It is counted
 * in the day's last bar instead. The merge is done here because `LEAST(…)`
 * in the query's GROUP BY made it 3.5 times slower.
 */
function binsFromResults(results: TimeBinResult[], interval: TimeInterval): TimeHistogramBin[] {
  const lastStart = SECONDS_PER_DAY - getIntervalBinSizeSeconds(interval);
  const bins: TimeHistogramBin[] = [];
  for (const result of results) {
    const binStartSeconds = Math.min(Number(result.bin_start), lastStart);
    const count = Number(result.count);
    const previous = bins[bins.length - 1];
    if (previous?.binStartSeconds === binStartSeconds) {
      previous.count += count;
    } else {
      bins.push({
        binStartSeconds,
        binEndSeconds: computeBinEnd(binStartSeconds, interval),
        count,
      });
    }
  }
  return bins;
}

// =========================================
// Data Fetching
// =========================================

/**
 * SQL for a time column's least and greatest seconds since midnight, on the
 * scale the bins use (`EXTRACT(EPOCH FROM col)`).
 *
 * For TIME and TIME_NS it is the epoch of `MIN` and `MAX`: `EXTRACT` keeps
 * their order, and the aggregates read two values rather than every row's
 * epoch (2 ms against 11 ms on a million rows). A TIME WITH TIME ZONE takes
 * the aggregate of every row's epoch instead. DuckDB's `MIN` and `MAX` order
 * it by time of day today, but its `<` and `ORDER BY` order it by instant,
 * and a minimum taken by instant could lie above other rows' times of day,
 * which would then fall out of the bars.
 */
function rangeSQL(col: string, originalType: string | undefined): [min: string, max: string] {
  return isTimeWithTimeZone(originalType)
    ? [`MIN(EXTRACT(EPOCH FROM ${col}))`, `MAX(EXTRACT(EPOCH FROM ${col}))`]
    : [`EXTRACT(EPOCH FROM MIN(${col}))`, `EXTRACT(EPOCH FROM MAX(${col}))`];
}

/**
 * Fetch time column statistics (min, max, count, nulls)
 *
 * The minimum and maximum are seconds since midnight from DuckDB (see
 * {@link rangeSQL}); `originalType`, the column's DuckDB type, picks the SQL
 * for them. DuckDB's text for them would not do: it carries an offset for a
 * TIME WITH TIME ZONE (`23:00:00+05:30`), and nanoseconds for a TIME_NS,
 * whose epoch is truncated to microseconds, so a minimum read from text could
 * lie above the smallest value's bin position.
 */
export async function fetchTimeStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  originalType?: string,
): Promise<{
  minSeconds: number | null;
  maxSeconds: number | null;
  count: number;
  nullCount: number;
}> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';
  const [minSQL, maxSQL] = rangeSQL(col, originalType);

  const sql = `
    SELECT
      ${minSQL} as min_sec,
      ${maxSQL} as max_sec,
      COUNT(${col}) as count,
      COUNT(*) - COUNT(${col}) as null_count
    FROM ${tbl}
    ${whereSQL}
  `;

  const results = await bridge.query<TimeStatsResult>(sql);

  if (results.length === 0) {
    return { minSeconds: null, maxSeconds: null, count: 0, nullCount: 0 };
  }

  const row = results[0]!;
  return {
    minSeconds: row.min_sec === null ? null : Number(row.min_sec),
    maxSeconds: row.max_sec === null ? null : Number(row.max_sec),
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
  filters: Filter[],
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `${col} IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const binSizeSeconds = getIntervalBinSizeSeconds(interval);

  // Use EPOCH to convert TIME to seconds, then bin
  // EXTRACT(EPOCH FROM time_column) returns seconds from midnight for TIME type.
  // 24:00:00 gets a bin of its own at 86400, which binsFromResults merges
  // into the day's last bar.
  return `
    SELECT
      FLOOR(EXTRACT(EPOCH FROM ${col}) / ${binSizeSeconds}) * ${binSizeSeconds} as bin_start,
      COUNT(*) as count
    FROM ${tbl}
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
  filters: Filter[],
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `${col} IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const binWidth = (maxSec - minSec) / numBins;

  // Use EPOCH to convert TIME to seconds from midnight
  return `
    SELECT
      LEAST(FLOOR((EXTRACT(EPOCH FROM ${col}) - ${minSec}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM ${tbl}
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
  bridge: WorkerBridge,
): Promise<TimeHistogramData> {
  const binWidth = (stats.maxSeconds - stats.minSeconds) / numBins;

  const sql = buildNumericTimeHistogramSQL(
    tableName,
    column,
    numBins,
    stats.minSeconds,
    stats.maxSeconds,
    filters,
  );
  const binResults = await bridge.query<NumericBinResult>(sql);

  // Create all bins (even empty ones) for consistent visualization
  const bins: TimeHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const binStartSeconds = stats.minSeconds + i * binWidth;
    const binEndSeconds =
      i === numBins - 1 ? stats.maxSeconds : stats.minSeconds + (i + 1) * binWidth;
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
      bins[idx]!.count = Number(result.count);
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
 * Fetch time histogram bins using interval-based binning.
 * Used for crossfilter alignment: both background and foreground use the
 * same interval so their bin edges match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the TIME column
 * @param interval - Time interval to use for binning
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of TimeHistogramBin with aligned edges
 */
export async function fetchTimeHistogramBins(
  tableName: string,
  column: string,
  interval: TimeInterval,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<TimeHistogramBin[]> {
  const sql = buildTimeHistogramSQL(tableName, column, interval, filters);
  const binResults = await bridge.query<TimeBinResult>(sql);
  return binsFromResults(binResults, interval);
}

/**
 * Fetch time histogram bins using numeric (equal-width) binning.
 * Used for crossfilter alignment when interval-based binning exceeds maxBins:
 * both background and foreground use the same numBins/min/max so their bin edges match.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the TIME column
 * @param numBins - Number of equal-width bins
 * @param minSec - Minimum seconds from midnight for bin range
 * @param maxSec - Maximum seconds from midnight for bin range
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of TimeHistogramBin with aligned edges
 */
export async function fetchTimeNumericBins(
  tableName: string,
  column: string,
  numBins: number,
  minSec: number,
  maxSec: number,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<TimeHistogramBin[]> {
  const binWidth = (maxSec - minSec) / numBins;

  const sql = buildNumericTimeHistogramSQL(tableName, column, numBins, minSec, maxSec, filters);
  const binResults = await bridge.query<NumericBinResult>(sql);

  // Create all bins (even empty ones) for consistent visualization
  const bins: TimeHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const binStartSeconds = minSec + i * binWidth;
    const binEndSeconds = i === numBins - 1 ? maxSec : minSec + (i + 1) * binWidth;
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
      bins[idx]!.count = Number(result.count);
    }
  }

  return bins;
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
 * @param originalType - The column's DuckDB type (`ColumnSchema.originalType`),
 *                  which picks the SQL for its range (see {@link fetchTimeStats})
 * @returns TimeHistogramData with bins and metadata
 */
export async function fetchTimeHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxBins = 15,
  originalType?: string,
): Promise<TimeHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchTimeStats(tableName, column, filters, bridge, originalType);

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
      maxBins,
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
        {
          minSeconds: stats.minSeconds,
          maxSeconds: stats.maxSeconds,
          count: stats.count,
          nullCount: stats.nullCount,
        },
        filters,
        bridge,
      );
    }

    // Handle edge case: single value (all same time). The bar starts where
    // the bin SQL puts the value, so the bins of a filtered fetch line up
    // with it (12:30:00.5 starts at 12:30:00), and a bar for 24:00:00 ends
    // there, as the day's last bar does.
    if (stats.minSeconds === stats.maxSeconds) {
      const size = getIntervalBinSizeSeconds(interval);
      const binStart = Math.min(Math.floor(stats.minSeconds / size) * size, SECONDS_PER_DAY - size);
      return {
        bins: [
          {
            binStartSeconds: binStart,
            binEndSeconds: computeBinEnd(binStart, interval),
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
    const bins = binsFromResults(binResults, interval);

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
    throw new QueryError(
      `Failed to fetch time histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
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
