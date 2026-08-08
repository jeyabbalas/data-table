/**
 * IntervalHistogramData - Data fetching and processing for INTERVAL histogram visualizations
 *
 * Converts DuckDB INTERVAL values to a total-seconds numeric scale for equal-width binning.
 * Month/year components use standard approximations (1 month = 30.4375 days).
 *
 * INTERVAL values in DuckDB are returned as strings like "1 year 2 months 3 days 04:05:06"
 * and must be converted to numeric seconds for histogram binning.
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../../filters/FilterSQL';

// =========================================
// Constants
// =========================================

/** Average seconds per month (365.25 / 12 * 86400) */
export const MONTH_SECONDS = 2629800;

/** Seconds per year (365.25 * 86400) */
export const YEAR_SECONDS = 31557600;

/** Seconds per day */
const DAY_SECONDS = 86400;

// =========================================
// Interfaces
// =========================================

/**
 * A single interval histogram bin with seconds-based ranges
 */
export interface IntervalHistogramBin {
  /** Start of the bin in total seconds (inclusive) */
  binStartSeconds: number;
  /** End of the bin in total seconds (exclusive) */
  binEndSeconds: number;
  /** Number of values in this bin */
  count: number;
}

/**
 * Complete interval histogram data including bins and metadata
 */
export interface IntervalHistogramData {
  /** Array of bins sorted by binStartSeconds */
  bins: IntervalHistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum non-null interval in total seconds */
  minSeconds: number | null;
  /** Maximum non-null interval in total seconds */
  maxSeconds: number | null;
  /** Median non-null interval in total seconds */
  medianSeconds: number | null;
  /** Total count of all values (including nulls) */
  total: number;
  /** True when all non-null values are identical */
  isSingleValue: boolean;
}

/**
 * Statistics query result
 */
interface IntervalStatsResult {
  min_val: string | null;
  max_val: string | null;
  median_val: string | null;
  count: number;
  null_count: number;
}

/**
 * Bin query result
 */
interface IntervalBinResult {
  bin_idx: number;
  count: number;
}

// =========================================
// SQL Conversion
// =========================================

/**
 * Returns a SQL expression that converts an INTERVAL column to total seconds.
 *
 * Uses component extraction since EXTRACT(EPOCH FROM interval) is not reliably
 * supported in DuckDB WASM for all INTERVAL representations. Month/year
 * components use standard approximations (1 month ≈ 30.4375 days).
 *
 * @param col Already-quoted column identifier
 */
export function intervalToSecondsSQL(col: string): string {
  return `(
    (EXTRACT(year FROM ${col}) * 12 + EXTRACT(month FROM ${col})) * ${MONTH_SECONDS}.0 +
    EXTRACT(day FROM ${col}) * ${DAY_SECONDS}.0 +
    EXTRACT(hour FROM ${col}) * 3600.0 +
    EXTRACT(minute FROM ${col}) * 60.0 +
    EXTRACT(second FROM ${col})
  )`;
}

// =========================================
// Parsing & Formatting
// =========================================

/**
 * Parse a DuckDB INTERVAL value to total seconds.
 *
 * Accepts either a string ("1 year 2 months 3 days 04:05:06") or a
 * DuckDB WASM Arrow MonthDayNano object ({ months, days, nanoseconds }).
 *
 * @returns Total seconds (can be negative), or null if input is null/empty
 */
export function parseIntervalToSeconds(
  value: string | Record<string, unknown> | null,
): number | null {
  if (value === null || value === undefined) return null;

  // Handle Arrow MonthDayNano interval objects from DuckDB WASM
  if (typeof value === 'object' && 'months' in value && 'days' in value) {
    const months = Number(value['months']) || 0;
    const days = Number(value['days']) || 0;
    let totalMicros = 0;
    if ('nanoseconds' in value) totalMicros = Math.floor(Number(value['nanoseconds']) / 1000);
    else if ('micros' in value) totalMicros = Number(value['micros']) || 0;

    return months * MONTH_SECONDS + days * DAY_SECONDS + totalMicros / 1_000_000;
  }

  if (typeof value !== 'string') return null;

  const input = value.trim();
  if (!input) return null;

  let totalSeconds = 0;

  // Parse year/month/day components with optional per-component negative signs.
  // DuckDB outputs intervals with independently-signed components, e.g.
  // "-1 year -2 months 3 days -04:05:06".
  const yearMatch = input.match(/(-?\d+)\s*years?/i);
  const monthMatch = input.match(/(-?\d+)\s*months?/i);
  const dayMatch = input.match(/(-?\d+)\s*days?/i);

  if (yearMatch) totalSeconds += parseInt(yearMatch[1]!, 10) * YEAR_SECONDS;
  if (monthMatch) totalSeconds += parseInt(monthMatch[1]!, 10) * MONTH_SECONDS;
  if (dayMatch) totalSeconds += parseInt(dayMatch[1]!, 10) * DAY_SECONDS;

  // Parse time component with optional leading negative sign.
  // Matches "-HH:MM:SS.ffffff" or "HH:MM:SS.ffffff".
  const timeMatch = input.match(/(-?)(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (timeMatch) {
    const timeSign = timeMatch[1] === '-' ? -1 : 1;
    let timeSec = parseInt(timeMatch[2]!, 10) * 3600;
    timeSec += parseInt(timeMatch[3]!, 10) * 60;
    timeSec += parseInt(timeMatch[4]!, 10);
    if (timeMatch[5]) {
      timeSec += parseFloat(`0.${timeMatch[5]}`);
    }
    totalSeconds += timeSign * timeSec;
  }

  return totalSeconds;
}

/**
 * Convert total seconds to compact human-readable interval string.
 *
 * Output format matches Cell.ts's formatInterval: "1y 2mo 3d 4h 5m 6s".
 * Only non-zero components are shown. Returns "0s" for zero.
 *
 * @param seconds Total seconds (can be negative)
 */
export function secondsToIntervalString(seconds: number): string {
  if (seconds === 0) return '0s';

  const isNegative = seconds < 0;
  let remaining = Math.abs(seconds);

  const parts: string[] = [];

  // Extract years
  const years = Math.floor(remaining / YEAR_SECONDS);
  if (years > 0) {
    parts.push(`${years}y`);
    remaining -= years * YEAR_SECONDS;
  }

  // Extract months (from remaining after years)
  const months = Math.floor(remaining / MONTH_SECONDS);
  if (months > 0) {
    parts.push(`${months}mo`);
    remaining -= months * MONTH_SECONDS;
  }

  // Extract days
  const days = Math.floor(remaining / DAY_SECONDS);
  if (days > 0) {
    parts.push(`${days}d`);
    remaining -= days * DAY_SECONDS;
  }

  // Extract hours
  const hours = Math.floor(remaining / 3600);
  if (hours > 0) {
    parts.push(`${hours}h`);
    remaining -= hours * 3600;
  }

  // Extract minutes
  const minutes = Math.floor(remaining / 60);
  if (minutes > 0) {
    parts.push(`${minutes}m`);
    remaining -= minutes * 60;
  }

  // Extract seconds (with fractional part)
  if (remaining > 0 || parts.length === 0) {
    const secs = Math.round(remaining * 1000) / 1000; // Avoid floating-point noise
    if (Number.isInteger(secs)) {
      parts.push(`${secs}s`);
    } else {
      // Remove trailing zeros from fraction
      parts.push(`${parseFloat(secs.toFixed(3))}s`);
    }
  }

  const result = parts.join(' ');
  return isNegative ? `-${result}` : result;
}

/**
 * Convert total seconds to a DuckDB-compatible interval literal string.
 *
 * Output format: "N years N months N days HH:MM:SS" suitable for use in
 * `INTERVAL '...'` SQL expressions.
 *
 * @param seconds Total seconds (can be negative)
 */
export function secondsToIntervalSQL(seconds: number): string {
  if (seconds === 0) return '00:00:00';

  const isNegative = seconds < 0;
  let remaining = Math.abs(seconds);
  // Per-component sign prefix: DuckDB requires each component to be
  // independently signed (e.g. "-1 day -01:01:01") rather than a single
  // leading negative ("-1 day 01:01:01" would mean -1 day PLUS +1h1m1s).
  const sign = isNegative ? '-' : '';

  const parts: string[] = [];

  // Extract years
  const years = Math.floor(remaining / YEAR_SECONDS);
  if (years > 0) {
    parts.push(`${sign}${years} year${years > 1 ? 's' : ''}`);
    remaining -= years * YEAR_SECONDS;
  }

  // Extract months
  const months = Math.floor(remaining / MONTH_SECONDS);
  if (months > 0) {
    parts.push(`${sign}${months} month${months > 1 ? 's' : ''}`);
    remaining -= months * MONTH_SECONDS;
  }

  // Extract days
  const days = Math.floor(remaining / DAY_SECONDS);
  if (days > 0) {
    parts.push(`${sign}${days} day${days > 1 ? 's' : ''}`);
    remaining -= days * DAY_SECONDS;
  }

  // Always add time component for DuckDB parsing reliability
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  remaining -= minutes * 60;
  const wholeSecs = Math.floor(remaining);
  const fracSecs = remaining - wholeSecs;

  if (hours > 0 || minutes > 0 || wholeSecs > 0 || fracSecs > 1e-6 || parts.length === 0) {
    let timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}`;
    if (fracSecs > 1e-6) {
      // Preserve microsecond precision for accurate bin-edge round-trips
      const micros = Math.round(fracSecs * 1_000_000);
      timeStr += `.${String(micros).padStart(6, '0').replace(/0+$/, '')}`;
    }
    parts.push(`${sign}${timeStr}`);
  }

  return parts.join(' ');
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch interval column statistics (min, max, median, count, nulls).
 *
 * DuckDB supports MIN, MAX, and APPROX_QUANTILE on INTERVAL types.
 * Results are cast to VARCHAR and then parsed to numeric seconds.
 */
export async function fetchIntervalColumnStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<{
  minSeconds: number | null;
  maxSeconds: number | null;
  medianSeconds: number | null;
  count: number;
  nullCount: number;
}> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  // Try full query with APPROX_QUANTILE first; fall back without it
  // since APPROX_QUANTILE may not support INTERVAL in all DuckDB versions.
  let results: IntervalStatsResult[];
  try {
    const sql = `
      SELECT
        MIN(${col})::VARCHAR as min_val,
        MAX(${col})::VARCHAR as max_val,
        APPROX_QUANTILE(${col}, 0.5)::VARCHAR as median_val,
        COUNT(${col}) as count,
        COUNT(*) - COUNT(${col}) as null_count
      FROM ${tbl}
      ${whereSQL}
    `;
    results = await bridge.query<IntervalStatsResult>(sql, undefined, { priority: 'low' });
  } catch {
    // APPROX_QUANTILE not supported for INTERVAL — retry without median
    const sql = `
      SELECT
        MIN(${col})::VARCHAR as min_val,
        MAX(${col})::VARCHAR as max_val,
        NULL as median_val,
        COUNT(${col}) as count,
        COUNT(*) - COUNT(${col}) as null_count
      FROM ${tbl}
      ${whereSQL}
    `;
    results = await bridge.query<IntervalStatsResult>(sql, undefined, { priority: 'low' });
  }

  if (results.length === 0) {
    return { minSeconds: null, maxSeconds: null, medianSeconds: null, count: 0, nullCount: 0 };
  }

  const row = results[0]!;
  return {
    minSeconds: parseIntervalToSeconds(row.min_val),
    maxSeconds: parseIntervalToSeconds(row.max_val),
    medianSeconds: parseIntervalToSeconds(row.median_val),
    count: Number(row.count),
    nullCount: Number(row.null_count),
  };
}

/**
 * Build SQL query for interval histogram using numeric equal-width binning.
 *
 * Converts intervals to total seconds via intervalToSecondsSQL, then divides
 * the range [minSec, maxSec] into numBins equal-width bins.
 */
function buildIntervalHistogramSQL(
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
  const secExpr = intervalToSecondsSQL(col);

  return `
    SELECT
      LEAST(FLOOR((${secExpr} - ${minSec}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM ${tbl}
    ${whereSQL}
    GROUP BY bin_idx
    HAVING bin_idx >= 0 AND bin_idx < ${numBins}
    ORDER BY bin_idx
  `;
}

/**
 * Fetch interval histogram bins using numeric (equal-width) binning.
 *
 * Creates all numBins bins (even empty ones) for consistent visualization.
 * Both background and foreground use the same numBins/min/max so their bin
 * edges match for crossfilter ghost-bar rendering.
 */
export async function fetchIntervalNumericBins(
  tableName: string,
  column: string,
  numBins: number,
  minSec: number,
  maxSec: number,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<IntervalHistogramBin[]> {
  const binWidth = (maxSec - minSec) / numBins;

  const sql = buildIntervalHistogramSQL(tableName, column, numBins, minSec, maxSec, filters);
  const binResults = await bridge.query<IntervalBinResult>(sql, undefined, { priority: 'low' });

  // Create all bins (even empty ones)
  const bins: IntervalHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const binStartSeconds = minSec + i * binWidth;
    const binEndSeconds = i === numBins - 1 ? maxSec : minSec + (i + 1) * binWidth;
    bins.push({ binStartSeconds, binEndSeconds, count: 0 });
  }

  // Fill counts from query results
  for (const result of binResults) {
    const idx = Number(result.bin_idx);
    if (idx >= 0 && idx < bins.length) {
      bins[idx]!.count = Number(result.count);
    }
  }

  return bins;
}

/**
 * Fetch interval histogram data for an INTERVAL column.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the INTERVAL column to histogram
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @param maxBins - Maximum number of equal-width bins (default: 15)
 * @returns IntervalHistogramData with bins and metadata
 */
export async function fetchIntervalHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxBins = 15,
): Promise<IntervalHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchIntervalColumnStats(tableName, column, filters, bridge);

    // Handle edge case: no data (all nulls or empty)
    if (stats.count === 0 || stats.minSeconds === null || stats.maxSeconds === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        minSeconds: null,
        maxSeconds: null,
        medianSeconds: null,
        total: stats.count + stats.nullCount,
        isSingleValue: false,
      };
    }

    // Handle edge case: single value (all identical intervals)
    if (stats.minSeconds === stats.maxSeconds) {
      return {
        bins: [
          {
            binStartSeconds: stats.minSeconds,
            binEndSeconds: stats.minSeconds,
            count: stats.count,
          },
        ],
        nullCount: stats.nullCount,
        minSeconds: stats.minSeconds,
        maxSeconds: stats.maxSeconds,
        medianSeconds: stats.medianSeconds,
        total: stats.count + stats.nullCount,
        isSingleValue: true,
      };
    }

    // Step 2: Fetch equal-width bins
    const bins = await fetchIntervalNumericBins(
      tableName,
      column,
      maxBins,
      stats.minSeconds,
      stats.maxSeconds,
      filters,
      bridge,
    );

    return {
      bins,
      nullCount: stats.nullCount,
      minSeconds: stats.minSeconds,
      maxSeconds: stats.maxSeconds,
      medianSeconds: stats.medianSeconds,
      total: stats.count + stats.nullCount,
      isSingleValue: false,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch interval histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
