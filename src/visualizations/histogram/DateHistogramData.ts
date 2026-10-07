/**
 * DateHistogramData - Data fetching and processing for date histogram visualizations
 *
 * This module provides:
 * - Automatic time interval detection based on data range
 * - DATE_TRUNC-based temporal binning via DuckDB
 * - Filter to SQL conversion (shared with numeric histogram)
 * - The range filter a brush over the bins applies
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import {
  dateToSQLLiteral,
  filtersToWhereClause,
  formatSQLValue,
  quoteIdentifier,
} from '../../filters/FilterSQL';
import type { RangeFilter } from '../../filters/FilterTypes';
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

/**
 * The WHERE of a bin query. A column known to hold only values the chart can
 * draw (`allChartable`, from its unfiltered fetch) needs no test of each
 * value; any other keeps to the values the chart can draw, through a test
 * that NULL fails too.
 */
function binWhereSQL(col: string, filters: Filter[], allChartable: boolean | undefined): string {
  const base = allChartable === true ? `${col} IS NOT NULL` : chartableSQL(col);
  const whereClause = filtersToWhereClause(filters);
  return whereClause ? `WHERE ${base} AND ${whereClause}` : `WHERE ${base}`;
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
 *
 * @param allChartable - What the column's unfiltered fetch found: `false`
 *   when it holds values the chart leaves out, so the stats test each value
 *   at once; `true` or unknown (`undefined`) to try MIN and MAX first.
 */
export async function fetchDateStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  allChartable?: boolean,
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

  // `__dt_e` is the epoch of a value the chart can draw, and NULL otherwise.
  // The aliases are ones a filter cannot name by mistake: a WHERE binds a
  // name it cannot find in the table to a select alias.
  const perValueSQL = `
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
  `;

  let row: DateStatsResult | undefined;
  if (allChartable === false) {
    [row] = await bridge.query<DateStatsResult>(perValueSQL);
  } else {
    // `-infinity` sorts below every date and `infinity` above, so when the
    // minimum and maximum can be drawn, every value can. MIN and MAX of the
    // values themselves then answer, as fast as before; testing each value's
    // epoch costs about five times as much, so only a column holding a value
    // the chart leaves out pays for it.
    [row] = await bridge.query<DateStatsResult>(`
      SELECT
        EXTRACT(EPOCH FROM MIN(${col})) * 1000 as min_ms,
        EXTRACT(EPOCH FROM MAX(${col})) * 1000 as max_ms,
        COUNT(${col}) as count,
        COUNT(*) - COUNT(${col}) as null_count,
        0 as non_finite_count
      FROM ${tbl}
      ${whereSQL}
    `);
    if (row && Number(row.count) > 0 && !(isChartableMs(row.min_ms) && isChartableMs(row.max_ms))) {
      [row] = await bridge.query<DateStatsResult>(perValueSQL);
    }
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
  allChartable: boolean | undefined,
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  // Only the values the chart can draw, unless the column holds nothing
  // else: `DATE_TRUNC` fails on a DATE past TIMESTAMP's range, and
  // `infinity` would make a bin of its own.
  const whereSQL = binWhereSQL(col, filters, allChartable);
  const truncPart = intervalToDateTruncPart(interval);
  // The CASE repeats the WHERE's test because DuckDB works out DATE_TRUNC's
  // range from the column's minimum and maximum while planning, before any
  // row is filtered: a date at the type's ends (5877642 BC) failed the query
  // with `Date out of range`. A CASE's range is unknown. A column whose
  // values can all be drawn has no such ends.
  const value = allChartable === true ? col : `CASE WHEN ${chartableSQL(col)} THEN ${col} END`;

  // Use DATE_TRUNC for temporal binning. Each bin's start comes back as
  // epoch milliseconds, computed once per bin, where DuckDB's text
  // (`0044-01-01 (BC) 00:00:00`) is not one `new Date()` can read. The
  // subquery's aliases are ones a filter cannot name by mistake.
  return `
    SELECT EXTRACT(EPOCH FROM __dt_bin) * 1000 as bin_start_ms, __dt_n as count
    FROM (
      SELECT DATE_TRUNC('${truncPart}', ${value}) as __dt_bin, COUNT(*) as __dt_n
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
  allChartable: boolean | undefined,
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  // Only the values the chart can draw, unless the column holds nothing
  // else: `LEAST` ignores the NULL epoch of `infinity`, which would land in
  // the last bin, as would a date past what a JavaScript `Date` holds.
  const whereSQL = binWhereSQL(col, filters, allChartable);

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
 * Fetch date histogram bins using DATE_TRUNC with a pre-determined interval.
 * Used for crossfilter alignment: both background and foreground use the
 * same interval so their bin edges match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column
 * @param interval - Time interval to use for DATE_TRUNC binning
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @param allChartable - `true` when the column's unfiltered fetch found only
 *   values the chart can draw, so no value needs testing
 * @returns Array of DateHistogramBin with aligned edges
 */
export async function fetchDateHistogramBins(
  tableName: string,
  column: string,
  interval: TimeInterval,
  filters: Filter[],
  bridge: WorkerBridge,
  allChartable?: boolean,
): Promise<DateHistogramBin[]> {
  const sql = buildDateHistogramSQL(tableName, column, interval, filters, allChartable);
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
 * @param allChartable - `true` when the column's unfiltered fetch found only
 *   values the chart can draw, so no value needs testing
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
  allChartable?: boolean,
): Promise<DateHistogramBin[]> {
  const binWidth = (maxMs - minMs) / numBins;

  const sql = buildNumericDateHistogramSQL(
    tableName,
    column,
    numBins,
    minMs,
    maxMs,
    filters,
    allChartable,
  );
  const binResults = await bridge.query<NumericBinResult>(sql);

  // Create all bins (even empty ones) for consistent visualization. An inner
  // edge falls between milliseconds, and `new Date()` rounds it toward zero,
  // so the brush's bound for it can sit up to 1 ms from the edge the query
  // counted to, and a value in that millisecond is filtered as though it were
  // in the neighbouring bar. That is older than 0.9.
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
 * @param allChartable - What the column's unfiltered fetch found: `true` when
 *   it holds only values the chart can draw, `false` when it holds others.
 *   Unknown (`undefined`) without filters, the fetch finds out itself.
 * @returns DateHistogramData with bins and metadata
 */
export async function fetchDateHistogramData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxBins = 15,
  allChartable?: boolean,
): Promise<DateHistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchDateStats(tableName, column, filters, bridge, allChartable);
    const { nonFiniteCount } = stats;
    // The values the bins hold: infinity and far-off dates have no place on the axis.
    const finiteCount = stats.count - nonFiniteCount;
    // Without filters the stats cover the whole column, so the bins need no
    // test when they left nothing out.
    const chartable = allChartable ?? (filters.length === 0 ? nonFiniteCount === 0 : undefined);

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
      const bins = await fetchDateNumericBins(
        tableName,
        column,
        maxBins,
        stats.min.getTime(),
        stats.max.getTime(),
        filters,
        bridge,
        chartable,
      );
      return {
        bins,
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
        interval: 'day', // Placeholder - not used for numeric binning
        isSingleValue: false,
        isNumericBinning: true,
        nonFiniteCount,
      };
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
    const bins = await fetchDateHistogramBins(
      tableName,
      column,
      interval,
      filters,
      bridge,
      chartable,
    );

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

// =========================================
// Brush filters
// =========================================

/**
 * A TIMESTAMP_NS column's last finite value, `2262-04-11 23:47:16.854775806`
 * (`infinity` is the next nanosecond), as a bound DuckDB reads.
 */
const NS_LAST_BOUND = '2262-04-11T23:47:16.854775806Z';
const NS_LAST_BOUND_MS = Date.UTC(2262, 3, 11, 23, 47, 16, 854);

/**
 * The first day DuckDB casts text to TIMESTAMP_NS on. The type reaches back
 * to 1677-09-21 00:12:43.145224194, but DuckDB casts no text on that day
 * (`Date out of range in timestamp_ns conversion`), nor reads a value of it.
 */
const NS_FIRST_BOUND = '1677-09-22T00:00:00.000Z';
const NS_FIRST_BOUND_MS = Date.UTC(1677, 8, 22);

/** True for a column DuckDB types `TIMESTAMP_NS`. */
function isNanosecondTimestamp(originalType: string | undefined): boolean {
  return originalType?.trim().toUpperCase() === 'TIMESTAMP_NS';
}

/**
 * The range filter a brush over bars `startIdx` to `endIdx` applies: from the
 * first bar's start (`>=`) to the last bar's end (`<`), which the last of the
 * equal-width bars takes in (`<=`), as it ends at the column's maximum.
 *
 * The bounds are ISO text DuckDB reads (`dateToSQLLiteral`): a year past
 * 9999 without the `+` of `toISOString`. A bound a TIMESTAMP_NS column
 * cannot hold is written as the end it passes, as DuckDB would reject it in
 * every query: the last bar's end, rounded up to a millisecond or a calendar
 * unit, can pass the type's last value (then `<=` that value), and the first
 * bar's start of a calendar unit can fall before 1677-09-22.
 *
 * @param originalType - The column's DuckDB type, for its range
 * @returns The filter, or null when either bar does not exist
 */
export function dateBrushFilter(
  column: string,
  originalType: string | undefined,
  data: Pick<DateHistogramData, 'bins' | 'isNumericBinning'>,
  startIdx: number,
  endIdx: number,
): RangeFilter | null {
  const startBin = data.bins[startIdx];
  const endBin = data.bins[endIdx];
  if (!startBin || !endBin) return null;

  let min = dateToSQLLiteral(startBin.binStart);
  let max = dateToSQLLiteral(endBin.binEnd);
  let maxInclusive = endIdx === data.bins.length - 1 && data.isNumericBinning;
  if (isNanosecondTimestamp(originalType)) {
    if (startBin.binStart.getTime() < NS_FIRST_BOUND_MS) min = NS_FIRST_BOUND;
    if (endBin.binEnd.getTime() > NS_LAST_BOUND_MS) {
      max = NS_LAST_BOUND;
      maxInclusive = true;
    }
  }
  return { column, type: 'range', min, max, ...(maxInclusive && { maxInclusive: true }) };
}

// Re-export SQL utilities for external use
export { formatSQLValue };
