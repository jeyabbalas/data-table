/**
 * DateHistogramData - Data fetching and processing for date histogram visualizations
 *
 * This module provides:
 * - Automatic time interval detection based on data range
 * - DATE_TRUNC-based temporal binning via DuckDB
 * - Filter to SQL conversion (shared with numeric histogram)
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, formatSQLValue, quoteIdentifier } from '../../filters/FilterSQL';
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
 * Complete date histogram data including bins and metadata.
 *
 * The bins, `min` and `max` are of the values the chart can place on its
 * axis. `infinity`, `-infinity` and dates more than about 270,000 years from
 * 1970, which a JavaScript `Date` cannot hold, are counted in
 * `nonFiniteCount` instead. `total` counts every row.
 */
export interface DateHistogramData {
  /** Array of bins sorted by binStart */
  bins: DateHistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum date the chart draws, or null when there is none */
  min: Date | null;
  /** Maximum date the chart draws, or null when there is none */
  max: Date | null;
  /** Total count of all values (including nulls and the values left out) */
  total: number;
  /** Detected/used interval for binning */
  interval: TimeInterval;
  /** True when all the values the chart draws are identical (single timestamp) */
  isSingleValue: boolean;
  /** True when using numeric binning fallback (bins not aligned to calendar intervals) */
  isNumericBinning: boolean;
  /**
   * Count of `infinity`, `-infinity` and far-off dates, which the bins leave
   * out. Always set by the built-in fetch; optional so that data built
   * elsewhere still type-checks.
   */
  nonFiniteCount?: number | undefined;
}

/**
 * Statistics result from the initial query: epoch milliseconds of the
 * values the chart can draw.
 */
interface DateStatsResult {
  min_ms: number | null;
  max_ms: number | null;
  count: number;
  null_count: number;
  non_finite_count: number;
}

/**
 * Bin query result: the bin's start in epoch milliseconds
 */
interface DateBinResult {
  bin_start_ms: number;
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
export function estimateBinCount(min: Date, max: Date, interval: TimeInterval): number {
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
export function adjustIntervalForMaxBins(
  min: Date,
  max: Date,
  initialInterval: TimeInterval,
  maxBins: number,
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
    interval = TIME_INTERVALS[idx]!;
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
 * The most seconds from 1970, either way, of a value the chart draws: about
 * 270,000 years, inside the ±8.64e12 s a JavaScript `Date` holds (271821 BC
 * to 275760 AD), with room for a bin's end. DuckDB's DATE reaches 5881580 AD
 * and its TIMESTAMP 290309 BC. Past this a `Date` is invalid, and
 * `DATE_TRUNC` fails on a DATE past TIMESTAMP's range (`Date and time not in
 * timestamp range`).
 */
const CHART_EPOCH_LIMIT_SECONDS = 8.6e12;

/**
 * SQL that is true for a value the chart can draw: one whose epoch is within
 * {@link CHART_EPOCH_LIMIT_SECONDS}. Not true for `infinity` and `-infinity`,
 * whose epoch DuckDB gives as NULL, nor for NULL.
 */
function chartableSQL(col: string): string {
  return `EXTRACT(EPOCH FROM ${col}) BETWEEN -${CHART_EPOCH_LIMIT_SECONDS} AND ${CHART_EPOCH_LIMIT_SECONDS}`;
}

/** True for epoch milliseconds the chart can draw; false for NULL. */
function isChartableMs(ms: number | null): boolean {
  return ms !== null && Math.abs(ms) <= CHART_EPOCH_LIMIT_SECONDS * 1000;
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch date column statistics: the minimum and maximum of the values the
 * chart can draw, and the counts.
 *
 * Positions come from DuckDB as epoch milliseconds, not as its text, which
 * `new Date()` cannot read before year 1 (`0044-03-15 (BC)`), past 9999
 * (`12000-01-01 00:00:00`) or at `infinity`, and reads years 1 to 99 as
 * 1950 to 2049. `count` and `nullCount` count every row, as line 1 of the
 * stats does; `nonFiniteCount` is the values among `count` that the chart
 * leaves out: `infinity`, `-infinity`, and dates more than about 270,000
 * years from 1970, which a JavaScript `Date` cannot hold.
 */
export async function fetchDateStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<{
  min: Date | null;
  max: Date | null;
  count: number;
  nullCount: number;
  nonFiniteCount: number;
}> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  // `-infinity` sorts below every date and `infinity` above, so when the
  // minimum and maximum can be drawn, every value can. MIN and MAX of the
  // values themselves then answer, as fast as before; testing each value's
  // epoch costs about five times as much, so only a column holding a value
  // the chart leaves out pays for it.
  const sql = `
    SELECT
      EXTRACT(EPOCH FROM MIN(${col})) * 1000 as min_ms,
      EXTRACT(EPOCH FROM MAX(${col})) * 1000 as max_ms,
      COUNT(${col}) as count,
      COUNT(*) - COUNT(${col}) as null_count,
      0 as non_finite_count
    FROM ${tbl}
    ${whereSQL}
  `;
  let [row] = await bridge.query<DateStatsResult>(sql);

  if (row && Number(row.count) > 0 && !(isChartableMs(row.min_ms) && isChartableMs(row.max_ms))) {
    // `__dt_e` is the epoch of a value the chart can draw, and NULL
    // otherwise. The aliases are ones a filter cannot name by mistake: a
    // WHERE binds a name it cannot find in the table to a select alias.
    [row] = await bridge.query<DateStatsResult>(`
      SELECT
        MIN(__dt_e) * 1000 as min_ms,
        MAX(__dt_e) * 1000 as max_ms,
        COUNT(__dt_v) as count,
        COUNT(*) - COUNT(__dt_v) as null_count,
        COUNT(__dt_v) - COUNT(__dt_e) as non_finite_count
      FROM (
        SELECT ${col} AS __dt_v,
          CASE WHEN ${chartableSQL(col)} THEN EXTRACT(EPOCH FROM ${col}) END AS __dt_e
        FROM ${tbl}
        ${whereSQL}
      )
    `);
  }

  if (!row) {
    return { min: null, max: null, count: 0, nullCount: 0, nonFiniteCount: 0 };
  }

  // The bins span every value: the minimum rounds down to its millisecond
  // and the maximum up (a single value to its own), so a brush over the
  // last bar (`<=`) keeps a maximum with digits past the millisecond.
  // Rounding goes before `new Date()`, which rounds toward zero: -1.5 ms
  // would give -1, above the value, whose row would then fall before the
  // first bar.
  const { min_ms: minMs, max_ms: maxMs } = row;
  return {
    min: minMs === null ? null : new Date(Math.floor(minMs)),
    max: maxMs === null ? null : new Date(maxMs === minMs ? Math.floor(maxMs) : Math.ceil(maxMs)),
    count: Number(row.count),
    nullCount: Number(row.null_count),
    nonFiniteCount: Number(row.non_finite_count ?? 0),
  };
}

/**
 * Build SQL query for date histogram binning using DATE_TRUNC
 */
function buildDateHistogramSQL(
  tableName: string,
  column: string,
  interval: TimeInterval,
  filters: Filter[],
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  // Only the values the chart can draw: `DATE_TRUNC` fails on a DATE past
  // TIMESTAMP's range, and `infinity` would make a bin of its own.
  const chartable = chartableSQL(col);
  const baseCondition = `${col} IS NOT NULL AND ${chartable}`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const truncPart = intervalToDateTruncPart(interval);

  // Use DATE_TRUNC for temporal binning. Each bin's start comes back as
  // epoch milliseconds, computed once per bin, where DuckDB's text
  // (`0044-01-01 (BC) 00:00:00`) is not one `new Date()` can read.
  //
  // The CASE repeats the WHERE's test because DuckDB works out DATE_TRUNC's
  // range from the column's minimum and maximum while planning, before any
  // row is filtered: a date at the type's ends (5877642 BC) failed the
  // query with `Date out of range`. A CASE's range is unknown. The
  // subquery's aliases are ones a filter cannot name by mistake: a WHERE
  // binds a name it cannot find in the table to a select alias.
  return `
    SELECT EXTRACT(EPOCH FROM __dt_bin) * 1000 as bin_start_ms, __dt_n as count
    FROM (
      SELECT DATE_TRUNC('${truncPart}', CASE WHEN ${chartable} THEN ${col} END) as __dt_bin,
        COUNT(*) as __dt_n
      FROM ${tbl}
      ${whereSQL}
      GROUP BY 1
    )
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
  filters: Filter[],
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  // Only the values the chart can draw: `LEAST` ignores the NULL epoch of
  // `infinity`, which would otherwise land in the last bin, as would a date
  // past what a JavaScript `Date` holds.
  const baseCondition = `${col} IS NOT NULL AND ${chartableSQL(col)}`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const binWidth = (maxMs - minMs) / numBins;

  // Use EPOCH to convert timestamp to seconds, then multiply by 1000 for milliseconds
  return `
    SELECT
      LEAST(FLOOR((EXTRACT(EPOCH FROM ${col}) * 1000 - ${minMs}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM ${tbl}
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
  stats: { min: Date; max: Date; count: number; nullCount: number; nonFiniteCount: number },
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<DateHistogramData> {
  const minMs = stats.min.getTime();
  const maxMs = stats.max.getTime();
  const binWidth = (maxMs - minMs) / numBins;

  const sql = buildNumericDateHistogramSQL(tableName, column, numBins, minMs, maxMs, filters);
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
      bins[idx]!.count = Number(result.count);
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
    nonFiniteCount: stats.nonFiniteCount,
  };
}

/**
 * Fetch date histogram bins using DATE_TRUNC with a pre-determined interval.
 * Used for crossfilter alignment: both background and foreground use the
 * same interval so their bin edges match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column
 * @param interval - Time interval to use for DATE_TRUNC binning
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of DateHistogramBin with aligned edges
 */
export async function fetchDateHistogramBins(
  tableName: string,
  column: string,
  interval: TimeInterval,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<DateHistogramBin[]> {
  const sql = buildDateHistogramSQL(tableName, column, interval, filters);
  const binResults = await bridge.query<DateBinResult>(sql);

  return binResults.map((result) => {
    const binStart = new Date(Number(result.bin_start_ms));
    return {
      binStart,
      binEnd: computeBinEnd(binStart, interval),
      count: Number(result.count),
    };
  });
}

/**
 * Fetch date histogram bins using numeric (equal-width) binning.
 * Used for crossfilter alignment when interval-based binning exceeds maxBins:
 * both background and foreground use the same numBins/minMs/maxMs so their
 * bin edges match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column
 * @param numBins - Number of equal-width bins to create
 * @param minMs - Minimum epoch milliseconds for bin range
 * @param maxMs - Maximum epoch milliseconds for bin range
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of DateHistogramBin with aligned edges
 */
export async function fetchDateNumericBins(
  tableName: string,
  column: string,
  numBins: number,
  minMs: number,
  maxMs: number,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<DateHistogramBin[]> {
  const binWidth = (maxMs - minMs) / numBins;

  const sql = buildNumericDateHistogramSQL(tableName, column, numBins, minMs, maxMs, filters);
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
      bins[idx]!.count = Number(result.count);
    }
  }

  return bins;
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
  maxBins = 15,
): Promise<DateHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchDateStats(tableName, column, filters, bridge);
    const { nonFiniteCount } = stats;
    // The values the bins hold: infinity and far-off dates have no place on the axis.
    const finiteCount = stats.count - nonFiniteCount;

    // Handle edge case: no data (all nulls, none the chart can draw, or empty)
    if (finiteCount === 0 || stats.min === null || stats.max === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        min: null,
        max: null,
        total: stats.count + stats.nullCount,
        interval: 'day', // Default interval for empty data
        isSingleValue: false,
        isNumericBinning: false,
        nonFiniteCount,
      };
    }

    // Step 2: Detect optimal time interval, then adjust for maxBins
    const initialInterval = detectTimeInterval(stats.min, stats.max);
    const interval = adjustIntervalForMaxBins(stats.min, stats.max, initialInterval, maxBins);

    // Step 2.5: Check if even the adjusted interval exceeds maxBins
    // If so, fall back to numeric binning
    const estimatedBins = estimateBinCount(stats.min, stats.max, interval);
    if (estimatedBins > maxBins) {
      // stats.min and stats.max are guaranteed non-null here (checked above)
      return await fetchDateHistogramWithNumericBinning(
        tableName,
        column,
        maxBins,
        {
          min: stats.min,
          max: stats.max,
          count: stats.count,
          nullCount: stats.nullCount,
          nonFiniteCount,
        },
        filters,
        bridge,
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
            count: finiteCount,
          },
        ],
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
        interval,
        isSingleValue: true,
        isNumericBinning: false,
        nonFiniteCount,
      };
    }

    // Step 3: Fetch binned data using DATE_TRUNC
    const bins = await fetchDateHistogramBins(tableName, column, interval, filters, bridge);

    return {
      bins,
      nullCount: stats.nullCount,
      min: stats.min,
      max: stats.max,
      total: stats.count + stats.nullCount,
      interval,
      isSingleValue: false,
      isNumericBinning: false,
      nonFiniteCount,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch date histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}

// Re-export SQL utilities for external use
export { formatSQLValue };
