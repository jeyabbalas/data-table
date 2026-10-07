/**
 * IntervalHistogramData - Data fetching and processing for INTERVAL histogram visualizations
 *
 * Converts DuckDB INTERVAL values to a total-seconds numeric scale for equal-width binning.
 * Month/year components use standard approximations (1 month = 30.4375 days).
 *
 * The conversion runs in SQL ({@link intervalToSecondsSQL}), and the stats and the bins
 * both read it, so every value lies between the minimum and maximum it is binned by.
 * Filter bounds arrive as DuckDB's interval text ("1 year 2 months 3 days 04:05:06"),
 * which {@link parseIntervalToSeconds} reads on the same scale.
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../../filters/FilterSQL';
import type { RangeFilter } from '../../filters/FilterTypes';

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
 * Statistics query result, in seconds on the chart's scale
 */
interface IntervalStatsResult {
  min_sec: number | null;
  max_sec: number | null;
  median_sec: number | null;
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
 * Returns a SQL expression that converts an INTERVAL column to total seconds,
 * a DOUBLE.
 *
 * It sums the interval's parts rather than taking `EXTRACT(epoch …)`, which
 * counts a month as 30 days: this scale counts 30.4375, as
 * {@link parseIntervalToSeconds} and the axis labels do. The last term,
 * `EXTRACT(microseconds …)`, is the seconds within the minute with their
 * fraction (`1 minute 1.5 seconds` gives 1,500,000); `EXTRACT(second …)`
 * drops the fraction. The whole seconds are BIGINT arithmetic, exact for any
 * INTERVAL (at most about 5.8e15 seconds, below 2^53). Constants like
 * `86400.0` would make it 128-bit DECIMAL arithmetic, which takes twice as
 * long.
 *
 * @param col Already-quoted column identifier
 */
export function intervalToSecondsSQL(col: string): string {
  return `(
    (EXTRACT(year FROM ${col}) * 12 + EXTRACT(month FROM ${col})) * ${MONTH_SECONDS} +
    EXTRACT(day FROM ${col}) * ${DAY_SECONDS} +
    EXTRACT(hour FROM ${col}) * 3600 +
    EXTRACT(minute FROM ${col}) * 60 +
    EXTRACT(microseconds FROM ${col}) / 1000000.0
  )`;
}

// =========================================
// Parsing & Formatting
// =========================================

/**
 * The months, days or seconds one of each unit adds to an interval, by every
 * name DuckDB reads in interval text: singular, plural and short.
 */
const INTERVAL_UNITS = new Map<string, readonly ['months' | 'days' | 'seconds', number]>();
for (const [names, part, per] of [
  ['millennium millennia millenniums mil mils', 'months', 12000],
  ['century centuries cent c', 'months', 1200],
  ['decade decades dec decs', 'months', 120],
  ['year years yr yrs y', 'months', 12],
  ['quarter quarters', 'months', 3],
  ['month months mon mons', 'months', 1],
  ['week weeks w', 'days', 7],
  ['day days d', 'days', 1],
  ['hour hours hr hrs h', 'seconds', 3600],
  ['minute minutes min mins m', 'seconds', 60],
  ['second seconds sec secs s', 'seconds', 1],
  ['millisecond milliseconds msecond mseconds msec msecs ms', 'seconds', 1e-3],
  ['microsecond microseconds usecond useconds usec usecs us', 'seconds', 1e-6],
] as const) {
  for (const name of names.split(' ')) INTERVAL_UNITS.set(name, [part, per]);
}

/** `Math.trunc`, past floating-point noise: `0.3 * 3 * 30` is 26.999… */
function wholePart(x: number): number {
  return Math.trunc(x + Math.sign(x) * 1e-9);
}

/**
 * Parse a DuckDB INTERVAL value to total seconds.
 *
 * Accepts either a string or a DuckDB WASM Arrow MonthDayNano object
 * ({ months, days, nanoseconds }). A string is read as DuckDB reads interval
 * text: every `<number> <unit>` pair, in any unit DuckDB knows and each with
 * its own sign (`-1 year -2 months 3 days`, `2 hours`, `1.5 seconds`,
 * `500ms`), plus a clock part (`04:05:06.789`, `100:00:00.5`, `10:00`). A
 * fraction splits as DuckDB stores it: of a month or a quarter into whole
 * days, 30 to a month; of a day or a week into the time; of a year, decade,
 * century or millennium into whole months only. A trailing `ago` negates text
 * with no clock part, as in DuckDB (which ignores it after one).
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

  let months = 0;
  let days = 0;
  let seconds = 0;
  for (const [, amount, name] of input.matchAll(/(-?\d+(?:\.\d*)?)\s*([a-z]+)/gi)) {
    const unit = INTERVAL_UNITS.get(name!.toLowerCase());
    if (!unit) continue;
    const [part, per] = unit;
    const total = Number(amount) * per;
    if (part === 'seconds') {
      seconds += total;
    } else if (part === 'days') {
      const whole = wholePart(total);
      days += whole;
      seconds += (total - whole) * DAY_SECONDS;
    } else {
      const whole = wholePart(total);
      months += whole;
      if (per <= 3) days += wholePart((total - whole) * 30);
    }
  }

  // The clock part, `[-]H:MM[:SS[.ffffff]]`. DuckDB writes every hour of it,
  // so there can be more than two digits ("100:00:00.5").
  const clock = input.match(/(-?)(\d+):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (clock) {
    const time =
      Number(clock[2]) * 3600 +
      Number(clock[3]) * 60 +
      Number(clock[4] ?? 0) +
      Number(`0.${clock[5] ?? 0}`);
    seconds += clock[1] === '-' ? -time : time;
  }

  const total = months * MONTH_SECONDS + days * DAY_SECONDS + seconds;
  return !clock && /\bago$/i.test(input) ? -total : total;
}

/** An interval's parts on the chart's scale, each whole, with a sign. */
interface IntervalParts {
  negative: boolean;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 0–999,999 */
  micros: number;
}

/** `[⌊n / d⌋, n mod d]` for a whole `n` ≥ 0: exact, as `%` is, below 2^53. */
function divmod(n: number, d: number): [number, number] {
  const r = n % d;
  return [(n - r) / d, r];
}

/**
 * Split seconds into an interval's parts, rounded once to whole multiples of
 * `unit` microseconds (1, or 1,000 for milliseconds). A fraction that rounds
 * up to a whole second carries into the seconds, and on into the minutes,
 * hours and days: 5.999999999999999 s is 6 s, and 119.9999999 s is 2 minutes.
 */
function splitSeconds(total: number, unit = 1): IntervalParts {
  const abs = Math.abs(total);
  let whole = Math.floor(abs);
  let micros = Math.round(((abs - whole) * 1_000_000) / unit) * unit;
  if (micros >= 1_000_000) {
    whole += 1;
    micros -= 1_000_000;
  }
  const [years, afterYears] = divmod(whole, YEAR_SECONDS);
  const [months, afterMonths] = divmod(afterYears, MONTH_SECONDS);
  const [days, afterDays] = divmod(afterMonths, DAY_SECONDS);
  const [hours, afterHours] = divmod(afterDays, 3600);
  const [minutes, seconds] = divmod(afterHours, 60);
  const negative = total < 0 && (whole > 0 || micros > 0);
  return { negative, years, months, days, hours, minutes, seconds, micros };
}

/** `.5`, `.000001`: microseconds as a decimal fraction, trailing zeros dropped. */
function fractionText(micros: number): string {
  return micros > 0 ? `.${String(micros).padStart(6, '0').replace(/0+$/, '')}` : '';
}

/**
 * Seconds as whole microseconds, the nearest, as DuckDB holds an INTERVAL.
 * Exact up to about 9e9 seconds (285 years), past which a double holds no
 * finer.
 */
function secondsToMicros(seconds: number): number {
  const whole = Math.floor(seconds);
  return whole * 1_000_000 + Math.round((seconds - whole) * 1_000_000);
}

/**
 * Convert total seconds to compact human-readable interval string.
 *
 * Output format matches Cell.ts's formatInterval: "1y 2mo 3d 4h 5m 6s".
 * Only non-zero components are shown. Returns "0s" for zero. Under a second
 * the seconds keep every microsecond (`0.0005s`), above it the milliseconds,
 * and rounding carries: 119.9999999 is `2m`, not `1m 60s`.
 *
 * @param seconds Total seconds (can be negative)
 */
export function secondsToIntervalString(seconds: number): string {
  const p = splitSeconds(seconds, Math.abs(seconds) < 1 ? 1 : 1000);
  const parts: string[] = [];
  if (p.years > 0) parts.push(`${p.years}y`);
  if (p.months > 0) parts.push(`${p.months}mo`);
  if (p.days > 0) parts.push(`${p.days}d`);
  if (p.hours > 0) parts.push(`${p.hours}h`);
  if (p.minutes > 0) parts.push(`${p.minutes}m`);
  if (p.seconds > 0 || p.micros > 0 || parts.length === 0) {
    parts.push(`${p.seconds}${fractionText(p.micros)}s`);
  }

  const result = parts.join(' ');
  return p.negative ? `-${result}` : result;
}

/**
 * Convert total seconds to a DuckDB-compatible interval literal string.
 *
 * Output format: "N years N months N days HH:MM:SS.ffffff" suitable for use in
 * `INTERVAL '...'` SQL expressions, rounded to the nearest microsecond, which
 * DuckDB holds.
 *
 * @param seconds Total seconds (can be negative)
 */
export function secondsToIntervalSQL(seconds: number): string {
  const p = splitSeconds(seconds);
  // Per-component sign prefix: DuckDB requires each component to be
  // independently signed (e.g. "-1 day -01:01:01") rather than a single
  // leading negative ("-1 day 01:01:01" would mean -1 day PLUS +1h1m1s).
  const sign = p.negative ? '-' : '';
  const pad = (n: number): string => String(n).padStart(2, '0');

  const parts: string[] = [];
  if (p.years > 0) parts.push(`${sign}${p.years} year${p.years > 1 ? 's' : ''}`);
  if (p.months > 0) parts.push(`${sign}${p.months} month${p.months > 1 ? 's' : ''}`);
  if (p.days > 0) parts.push(`${sign}${p.days} day${p.days > 1 ? 's' : ''}`);

  // Always add time component for DuckDB parsing reliability
  if (p.hours > 0 || p.minutes > 0 || p.seconds > 0 || p.micros > 0 || parts.length === 0) {
    const time = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}${fractionText(p.micros)}`;
    parts.push(`${sign}${time}`);
  }

  return parts.join(' ');
}

// =========================================
// Brush ↔ Filter
// =========================================

/**
 * The seconds {@link intervalToSecondsSQL} gives an interval of `micros`
 * microseconds, computed as DuckDB computes them: the whole minutes, plus the
 * microseconds within the minute over a million. They are the same bit for
 * bit, so the bar the bin query puts a value in can be found here.
 */
function sqlSeconds(micros: number): number {
  const abs = Math.abs(micros);
  const inMinute = abs % 60_000_000;
  const seconds = (abs - inMinute) / 1_000_000 + inMinute / 1_000_000;
  return micros < 0 ? -seconds : seconds;
}

/**
 * Where each bar's values start, in whole microseconds, as DuckDB holds an
 * INTERVAL: bar `i` holds those from `starts[i]` up to, not including,
 * `starts[i + 1]`, and the last entry is one past the maximum.
 *
 * A bar's start is the first microsecond the bin query puts in it, found with
 * the query's own arithmetic ({@link buildIntervalHistogramSQL}). An edge often
 * falls between two microseconds, where the nearest one can belong to the bar
 * before; and a value exactly on an edge goes where the query's `FLOOR` sends
 * it, which rounding the edge up gets wrong about one time in twenty.
 */
function barStartMicros(bins: readonly IntervalHistogramBin[]): number[] {
  const n = bins.length;
  const minSec = bins[0]!.binStartSeconds;
  const maxSec = bins[n - 1]!.binEndSeconds;
  const starts = [secondsToMicros(minSec)];
  if (maxSec > minSec) {
    // As fetchIntervalNumericBins computes them.
    const binWidth = (maxSec - minSec) / n;
    const binOf = (micros: number): number => Math.floor((sqlSeconds(micros) - minSec) / binWidth);
    for (let j = 1; j < n; j++) {
      const previous = starts[j - 1]!;
      let micros = Math.max(secondsToMicros(minSec + j * binWidth), previous);
      // The query's boundary is within a microsecond of the edge. The step
      // limit also ends the search where a double no longer holds microseconds.
      for (let k = 0; k < 4 && micros > previous && binOf(micros - 1) >= j; k++) micros--;
      for (let k = 0; k < 4 && binOf(micros) < j; k++) micros++;
      starts.push(micros);
    }
  }
  starts.push(secondsToMicros(maxSec) + 1);
  return starts;
}

/**
 * The range filter a brush over bars `startIdx`–`endIdx` writes. It runs
 * from the first microsecond of the first bar to the first past the last
 * (to the maximum, inclusive, when the brush reaches the last bar), so it
 * matches exactly the rows those bars count.
 *
 * The bounds are INTERVAL literals, which DuckDB compares with 30-day months
 * and 360-day years (`INTERVAL '1 month' = INTERVAL '30 days'`), while the
 * bars put a month at 30.4375 days and a year at 365.25. A value with months
 * or years near a brush edge can therefore fall on the other side of it from
 * its bar: a brush from 10 years includes `3620 days`, which the bars put
 * below 10 years. That is left as it is on purpose: comparing the seconds
 * expression instead would change what saved interval filters match.
 */
export function intervalBrushFilter(
  column: string,
  bins: readonly IntervalHistogramBin[],
  startIdx: number,
  endIdx: number,
): RangeFilter {
  const starts = barStartMicros(bins);
  const toLast = endIdx === bins.length - 1;
  const end = toLast ? starts[endIdx + 1]! - 1 : starts[endIdx + 1]!;
  return {
    column,
    type: 'range',
    min: secondsToIntervalSQL(starts[startIdx]! / 1_000_000),
    max: secondsToIntervalSQL(end / 1_000_000),
    valueType: 'interval',
    ...(toLast && { maxInclusive: true }),
  };
}

/**
 * The bars a range filter on the column covers, `[first, last]`, or null for
 * none: those holding a value the filter passes. It compares in whole
 * microseconds, as {@link intervalBrushFilter} writes its bounds, so a brush's
 * own filter covers exactly its bars, however narrow, and a bound a hair off a
 * whole microsecond reads as that microsecond. A number is a bound in seconds,
 * and an infinite one leaves that side open.
 */
export function intervalFilterBars(
  filter: RangeFilter,
  bins: readonly IntervalHistogramBin[],
): [number, number] | null {
  const toMicros = (bound: string | number | Date, open: number): number => {
    if (typeof bound === 'number') return Number.isFinite(bound) ? secondsToMicros(bound) : open;
    return secondsToMicros(parseIntervalToSeconds(String(bound)) ?? 0);
  };
  // The microseconds the filter passes: from `low` up to, not including, `high`.
  const low = toMicros(filter.min, -Infinity) + (filter.minExclusive ? 1 : 0);
  const high = toMicros(filter.max, Infinity) + (filter.maxInclusive ? 1 : 0);

  const starts = barStartMicros(bins);
  let first = -1;
  let last = -1;
  for (let i = 0; i < bins.length; i++) {
    if (starts[i]! < high && starts[i + 1]! > low) {
      if (first === -1) first = i;
      last = i;
    }
  }
  return first === -1 ? null : [first, last];
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch interval column statistics (min, max, median, count, nulls).
 *
 * The minimum, median and maximum are those of {@link intervalToSecondsSQL},
 * the seconds the bins use, so every value falls in a bin. DuckDB's own MIN
 * and MAX order intervals with 30-day months: of `1 month` and
 * `30 days 06:00:00` they give `1 month` as the minimum, which this scale puts
 * above the maximum. DuckDB's `APPROX_QUANTILE` takes no INTERVAL.
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
  const sec = intervalToSecondsSQL(col);

  const sql = `
    SELECT
      MIN(${sec}) as min_sec,
      MAX(${sec}) as max_sec,
      APPROX_QUANTILE(${sec}, 0.5) as median_sec,
      COUNT(${col}) as count,
      COUNT(*) - COUNT(${col}) as null_count
    FROM ${tbl}
    ${whereSQL}
  `;
  const results = await bridge.query<IntervalStatsResult>(sql);

  if (results.length === 0) {
    return { minSeconds: null, maxSeconds: null, medianSeconds: null, count: 0, nullCount: 0 };
  }

  const row = results[0]!;
  return {
    minSeconds: row.min_sec ?? null,
    maxSeconds: row.max_sec ?? null,
    medianSeconds: row.median_sec ?? null,
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
  const binResults = await bridge.query<IntervalBinResult>(sql);

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
