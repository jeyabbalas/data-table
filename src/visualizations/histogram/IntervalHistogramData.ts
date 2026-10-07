/**
 * IntervalHistogramData - Data fetching and processing for INTERVAL histogram visualizations
 *
 * Converts DuckDB INTERVAL values to a total-seconds numeric scale for equal-width binning.
 * Month/year components use standard approximations (1 month = 30.4375 days).
 *
 * The conversion runs in SQL ({@link intervalToSecondsSQL}), and the stats and the bins
 * both read it, so every value lies between the minimum and maximum it is binned by.
 * The unfiltered bins also carry their smallest and largest values, which a brush
 * filters between. Interval text ("1 year 2 months 3 days 04:05:06") is read as DuckDB
 * reads it ({@link parseIntervalFields}).
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

const MILLION = 1_000_000;

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
  /**
   * The bin's smallest value as DuckDB writes it (`400 days 07:30:00.000001`).
   * Set by the unfiltered fetch for a bin holding values: a brush filters from
   * the first such bin's smallest value to the last one's largest.
   */
  minValue?: string;
  /** The bin's largest value as DuckDB writes it; set with {@link minValue}. */
  maxValue?: string;
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
 * An interval as DuckDB stores it: whole months, days and microseconds, each
 * with its own sign.
 */
export interface IntervalFields {
  months: number;
  days: number;
  micros: number;
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
  min_value?: string | null;
  max_value?: string | null;
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
 * The months, days or microseconds one of each unit adds to an interval, by
 * every name DuckDB reads in interval text: singular, plural and short.
 */
const INTERVAL_UNITS = new Map<string, readonly ['months' | 'days' | 'micros', number]>();
for (const [names, part, per] of [
  ['millennium millennia millenniums mil mils', 'months', 12000],
  ['century centuries cent c', 'months', 1200],
  ['decade decades dec decs', 'months', 120],
  ['year years yr yrs y', 'months', 12],
  ['quarter quarters', 'months', 3],
  ['month months mon mons', 'months', 1],
  ['week weeks w', 'days', 7],
  ['day days d', 'days', 1],
  ['hour hours hr hrs h', 'micros', 3_600_000_000],
  ['minute minutes min mins m', 'micros', 60_000_000],
  ['second seconds sec secs s', 'micros', MILLION],
  ['millisecond milliseconds msecond mseconds msec msecs ms', 'micros', 1000],
  ['microsecond microseconds usecond useconds usec usecs us', 'micros', 1],
] as const) {
  for (const name of names.split(' ')) INTERVAL_UNITS.set(name, [part, per]);
}

/** `[⌊n / d⌋, n mod d]` for a whole `n` ≥ 0: exact, as `%` is, below 2^53. */
function divmod(n: number, d: number): [number, number] {
  const r = n % d;
  return [(n - r) / d, r];
}

/** Up to six digits of a decimal fraction as millionths, the rest dropped, as DuckDB keeps them. */
function millionths(digits: string | undefined): number {
  return Number((digits ?? '').slice(0, 6).padEnd(6, '0'));
}

/**
 * Parse DuckDB interval text into the fields DuckDB stores, as DuckDB reads
 * it: every `<number> <unit>` pair, in any unit DuckDB knows and each with
 * its own sign (`-1 year -2 months 3 days`, `2 hours`, `1.5 seconds`,
 * `500ms`), plus a clock part (`04:05:06.789`, `100:00:00.5`, `10:00`).
 *
 * A number keeps six digits of its fraction. Its fraction splits as DuckDB
 * splits it: of a month or a quarter into whole days, 30 to a month; of a day
 * or a week into microseconds; of a year, decade, century or millennium into
 * whole months only. Anything finer than a microsecond is dropped
 * (`01:02:03.1234567` is `.123456`), except that `us` rounds. A trailing `ago`
 * negates text with no clock part, as in DuckDB, which ignores it after one.
 *
 * @returns The fields, or null for empty text
 */
export function parseIntervalFields(text: string): IntervalFields | null {
  const input = text.trim();
  if (!input) return null;

  let months = 0;
  let days = 0;
  let micros = 0;
  for (const [, minus, whole, digits, name] of input.matchAll(
    /(-?)(\d+)(?:\.(\d*))?\s*([a-z]+)/gi,
  )) {
    const unit = INTERVAL_UNITS.get(name!.toLowerCase());
    if (!unit) continue;
    const [part, per] = unit;
    const sign = minus ? -1 : 1;
    const n = Number(whole);
    const f = millionths(digits);
    if (part === 'micros') {
      // A unit of a microsecond rounds its fraction; the others drop what is finer.
      const fraction = per === 1 ? Number(f >= MILLION / 2) : divmod(f * per, MILLION)[0];
      micros += sign * (n * per + fraction);
    } else if (part === 'days') {
      const [extraDays, rest] = divmod(f * per, MILLION);
      days += sign * (n * per + extraDays);
      micros += sign * rest * DAY_SECONDS; // millionths of a day
    } else {
      const [extraMonths, rest] = divmod(f * per, MILLION);
      months += sign * (n * per + extraMonths);
      if (per <= 3) days += sign * divmod(rest * 30, MILLION)[0];
    }
  }

  // The clock part, `[-]H:MM[:SS[.ffffff]]`. DuckDB writes every hour of it,
  // so there can be more than two digits ("100:00:00.5").
  const clock = input.match(/(-?)(\d+):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (clock) {
    const time =
      Number(clock[2]) * 3_600_000_000 +
      Number(clock[3]) * 60_000_000 +
      Number(clock[4] ?? 0) * MILLION +
      millionths(clock[5]);
    micros += clock[1] ? -time : time;
  }

  const sign = !clock && /\bago$/i.test(input) ? -1 : 1;
  return { months: sign * months || 0, days: sign * days || 0, micros: sign * micros || 0 };
}

/**
 * Parse a DuckDB INTERVAL value to total seconds.
 *
 * Accepts either a string, read as {@link parseIntervalFields} reads it, or a
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

    return months * MONTH_SECONDS + days * DAY_SECONDS + totalMicros / MILLION;
  }

  if (typeof value !== 'string') return null;
  const fields = parseIntervalFields(value);
  if (!fields) return null;
  return fields.months * MONTH_SECONDS + fields.days * DAY_SECONDS + fields.micros / MILLION;
}

/** An interval's parts on the chart's scale, each whole and not negative. */
interface IntervalParts {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 0–999,999 */
  micros: number;
}

const NO_PARTS: IntervalParts = {
  years: 0,
  months: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  micros: 0,
};

/** The hours (however many), minutes, seconds and microseconds in `micros` ≥ 0. */
function clockParts(
  micros: number,
): Pick<IntervalParts, 'hours' | 'minutes' | 'seconds' | 'micros'> {
  const [wholeSeconds, rest] = divmod(micros, MILLION);
  const [wholeMinutes, seconds] = divmod(wholeSeconds, 60);
  const [hours, minutes] = divmod(wholeMinutes, 60);
  return { hours, minutes, seconds, micros: rest };
}

/**
 * Split seconds into an interval's parts, rounded once to whole multiples of
 * `unit` microseconds (1, or 1,000 for milliseconds). A fraction that rounds
 * up to a whole second carries into the seconds, and on into the minutes,
 * hours and days: 119.9999999 s is 2 minutes.
 */
function splitSeconds(total: number, unit: number): IntervalParts & { negative: boolean } {
  const abs = Math.abs(total);
  let whole = Math.floor(abs);
  let micros = Math.round(((abs - whole) * MILLION) / unit) * unit;
  if (micros >= MILLION) {
    whole += 1;
    micros -= MILLION;
  }
  const [years, afterYears] = divmod(whole, YEAR_SECONDS);
  const [months, afterMonths] = divmod(afterYears, MONTH_SECONDS);
  const [days, afterDays] = divmod(afterMonths, DAY_SECONDS);
  const negative = total < 0 && (whole > 0 || micros > 0);
  return { negative, years, months, days, ...clockParts(afterDays * MILLION + micros) };
}

/** `1y 2mo 3d 4h 5m 6.5s`: the parts that are not zero, the seconds with every microsecond. */
function partsText(p: IntervalParts): string {
  const text: string[] = [];
  if (p.years) text.push(`${p.years}y`);
  if (p.months) text.push(`${p.months}mo`);
  if (p.days) text.push(`${p.days}d`);
  if (p.hours) text.push(`${p.hours}h`);
  if (p.minutes) text.push(`${p.minutes}m`);
  if (p.seconds || p.micros) {
    const fraction = p.micros ? `.${String(p.micros).padStart(6, '0').replace(/0+$/, '')}` : '';
    text.push(`${p.seconds}${fraction}s`);
  }
  return text.join(' ');
}

/**
 * Convert total seconds to compact human-readable interval string, the
 * chart's labels and stats: "1y 2mo 3d 4h 5m 6s", split on the chart's
 * scale (a month is 30.4375 days, so 45 days is `1mo 14d 13h 30m`). Only
 * non-zero components are shown. Returns "0s" for zero. Under a second the
 * seconds keep every microsecond (`0.0005s`), above it the milliseconds, and
 * rounding carries: 119.9999999 is `2m`, not `1m 60s`. The grid's cells use
 * the same units for each value's parts as DuckDB stores them
 * ({@link intervalFieldsToString}).
 *
 * @param seconds Total seconds (can be negative)
 */
export function secondsToIntervalString(seconds: number): string {
  const parts = splitSeconds(seconds, Math.abs(seconds) < 1 ? 1 : 1000);
  const text = partsText(parts) || '0s';
  return parts.negative ? `-${text}` : text;
}

/**
 * Format an interval's fields compactly, as DuckDB stores them: months as
 * years and months, then days, then the time, each field with every unit it
 * holds (`45d`, `100h 0.5s`, `0.000001s`). One sign leads when every field is
 * negative (`-1y 2mo 3d`); fields of different signs keep their own
 * (`1d -1h`). Returns "0s" for zero.
 */
export function intervalFieldsToString({ months, days, micros }: IntervalFields): string {
  const fields = [
    {
      sign: Math.sign(months),
      text: partsText({
        ...NO_PARTS,
        years: Math.trunc(Math.abs(months) / 12),
        months: Math.abs(months) % 12,
      }),
    },
    { sign: Math.sign(days), text: partsText({ ...NO_PARTS, days: Math.abs(days) }) },
    { sign: Math.sign(micros), text: partsText({ ...NO_PARTS, ...clockParts(Math.abs(micros)) }) },
  ].filter((field) => field.sign !== 0);

  if (fields.length === 0) return '0s';
  if (fields.every((field) => field.sign < 0)) {
    return `-${fields.map((field) => field.text).join(' ')}`;
  }
  return fields.map((field) => (field.sign < 0 ? `-${field.text}` : field.text)).join(' ');
}

// =========================================
// Brush ↔ Filter
// =========================================

/**
 * The range filter a brush over bars `startIdx`–`endIdx` writes, or null when
 * those bars hold no value: from the smallest value of the first bar holding
 * any to the largest of the last, both inclusive, written as DuckDB writes
 * those values. The bars split the column's sorted values, so the filter
 * matches exactly the rows they count, whatever the floating-point arithmetic
 * of their edges. The bars need the values the unfiltered fetch sets
 * ({@link IntervalHistogramBin.minValue}).
 *
 * DuckDB compares two intervals part by part, after counting 30 days to a
 * month and 24 hours to a day, while the bars put a month at 30.4375 days. That
 * is the total-time order for a column whose values hold months only, or
 * days and time only with one sign: those brushes are exact. A column whose
 * values mix months with days or time, or a day and a time of opposite signs
 * (`1 day -00:00:02`), can have a value near a bound fall on the other side of
 * it from its bar: `30 days 06:00:00` passes a filter from `1 month`, though its
 * bar lies below. That is left as it is on purpose: comparing the chart's
 * seconds instead would change what saved interval filters match.
 */
export function intervalBrushFilter(
  column: string,
  bins: readonly IntervalHistogramBin[],
  startIdx: number,
  endIdx: number,
): RangeFilter | null {
  const holding = bins
    .slice(startIdx, endIdx + 1)
    .filter((bin) => bin.minValue !== undefined && bin.maxValue !== undefined);
  if (holding.length === 0) return null;
  return {
    column,
    type: 'range',
    min: holding[0]!.minValue!,
    max: holding[holding.length - 1]!.maxValue!,
    valueType: 'interval',
    maxInclusive: true,
  };
}

/** Text or seconds as whole microseconds on the chart's scale; exact below 2^53 (285 years). */
function toMicros(value: string | number): number {
  if (typeof value === 'number') {
    const whole = Math.floor(value);
    return whole * MILLION + Math.round((value - whole) * MILLION);
  }
  const fields = parseIntervalFields(value) ?? { months: 0, days: 0, micros: 0 };
  return (fields.months * MONTH_SECONDS + fields.days * DAY_SECONDS) * MILLION + fields.micros;
}

/**
 * The bars a range filter on the column covers, `[first, last]`, or null for
 * none: those holding values whose range meets the filter's, by the values the
 * unfiltered fetch sets ({@link IntervalHistogramBin.minValue}). A brush's own
 * filter covers exactly its bars, and a filter written by an older version,
 * from rounded bar edges, the bars holding the values it passes. A number is
 * a bound in seconds, and an infinite one leaves that side open.
 */
export function intervalFilterBars(
  filter: RangeFilter,
  bins: readonly IntervalHistogramBin[],
): [number, number] | null {
  const bound = (value: string | number | Date, open: number): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? toMicros(value) : open;
    return toMicros(String(value));
  };
  // The microseconds the filter passes, both ends included.
  const low = bound(filter.min, -Infinity) + (filter.minExclusive ? 1 : 0);
  const high = bound(filter.max, Infinity) - (filter.maxInclusive ? 0 : 1);

  let first = -1;
  let last = -1;
  bins.forEach((bin, i) => {
    if (bin.minValue === undefined || bin.maxValue === undefined) return;
    if (toMicros(bin.minValue) <= high && toMicros(bin.maxValue) >= low) {
      if (first === -1) first = i;
      last = i;
    }
  });
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
 * the range [minSec, maxSec] into numBins equal-width bins. With `values`, each
 * bin also gives its smallest and largest value as DuckDB writes them.
 */
function buildIntervalHistogramSQL(
  tableName: string,
  column: string,
  numBins: number,
  minSec: number,
  maxSec: number,
  filters: Filter[],
  values: boolean,
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
  // One bin takes every value, also when they are all equal and it has no width.
  const binIdx =
    numBins === 1
      ? '0'
      : `LEAST(FLOOR((${secExpr} - ${minSec}) / ${binWidth})::INTEGER, ${numBins - 1})`;
  const extremes = values
    ? `,
      CAST(arg_min(${col}, ${secExpr}) AS VARCHAR) as min_value,
      CAST(arg_max(${col}, ${secExpr}) AS VARCHAR) as max_value`
    : '';

  return `
    SELECT
      ${binIdx} as bin_idx,
      COUNT(*) as count${extremes}
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
 * edges match for crossfilter ghost-bar rendering. With `values`, each bin
 * holding values gets its smallest and largest ({@link IntervalHistogramBin.minValue}).
 */
export async function fetchIntervalNumericBins(
  tableName: string,
  column: string,
  numBins: number,
  minSec: number,
  maxSec: number,
  filters: Filter[],
  bridge: WorkerBridge,
  values = false,
): Promise<IntervalHistogramBin[]> {
  const binWidth = (maxSec - minSec) / numBins;

  const sql = buildIntervalHistogramSQL(
    tableName,
    column,
    numBins,
    minSec,
    maxSec,
    filters,
    values,
  );
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
      const bin = bins[idx]!;
      bin.count = Number(result.count);
      if (result.min_value != null && result.max_value != null) {
        bin.minValue = result.min_value;
        bin.maxValue = result.max_value;
      }
    }
  }

  return bins;
}

/**
 * Fetch interval histogram data for an INTERVAL column.
 *
 * The bins carry their smallest and largest values, for a brush. There are at
 * most `maxBins`, and none narrower than a microsecond, the finest step DuckDB
 * holds: 1 µs and 3 µs make 2 bins.
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

    // Step 2: Fetch equal-width bins: one for a single value (all identical intervals)
    const isSingleValue = stats.minSeconds === stats.maxSeconds;
    const micros = Math.round((stats.maxSeconds - stats.minSeconds) * MILLION);
    const numBins = isSingleValue ? 1 : Math.min(maxBins, Math.max(1, micros));
    const bins = await fetchIntervalNumericBins(
      tableName,
      column,
      numBins,
      stats.minSeconds,
      stats.maxSeconds,
      filters,
      bridge,
      true,
    );

    return {
      bins,
      nullCount: stats.nullCount,
      minSeconds: stats.minSeconds,
      maxSeconds: stats.maxSeconds,
      medianSeconds: stats.medianSeconds,
      total: stats.count + stats.nullCount,
      isSingleValue,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch interval histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
