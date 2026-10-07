/**
 * HistogramData - Data fetching and processing for histogram visualizations
 *
 * This module provides:
 * - Histogram data fetching from DuckDB
 * - Optimal bin count calculation (Freedman-Diaconis/Sturges rules)
 * - Filter to SQL conversion utilities
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../../filters/FilterSQL';

// Re-export for backward compatibility
export { filtersToWhereClause, formatSQLValue } from '../../filters/FilterSQL';

/** Maximum distinct values to use discrete binning (one bin per unique value) */
const DISCRETE_BIN_THRESHOLD = 5;

// =========================================
// Interfaces
// =========================================

/**
 * A single histogram bin with range and count
 */
export interface HistogramBin {
  /** Lower bound of the bin (inclusive) */
  x0: number;
  /** Upper bound of the bin (exclusive, except for last bin) */
  x1: number;
  /** Number of values in this bin */
  count: number;
}

/**
 * Complete histogram data including bins and metadata.
 *
 * The bins, `min`, `max`, `median` and `distinctCount` are of the column's
 * finite values: `NaN`, `Infinity` and `-Infinity`, which a FLOAT or DOUBLE
 * column can hold, have no place on the axis, and are counted in
 * `nonFiniteCount` instead. `total` counts every row.
 */
export interface HistogramData {
  /** Array of histogram bins sorted by x0 */
  bins: HistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum finite value; `NaN` when there is none */
  min: number;
  /** Maximum finite value; `NaN` when there is none */
  max: number;
  /** Total count of all values (including nulls and non-finite values) */
  total: number;
  /** True when all finite values are identical (single value column) */
  isSingleValue: boolean;
  /** True when using discrete binning (one bin per unique value, ≤ threshold) */
  isDiscrete: boolean;
  /** Approximate median of the finite values */
  median: number | null;
  /** Count of distinct finite values */
  distinctCount: number;
  /**
   * Count of `NaN`, `Infinity` and `-Infinity` values, which the bins leave
   * out. Always set by the built-in fetch; optional so that data built
   * elsewhere still type-checks.
   */
  nonFiniteCount?: number | undefined;
}

/**
 * Statistics needed for optimal bin calculation. `min`, `max`, the quartiles
 * and `distinctCount` are of the finite values; `count` is of every
 * non-null value, `nonFiniteCount` of the non-finite ones among them.
 */
export interface ColumnStats {
  min: number | null;
  max: number | null;
  count: number;
  nullCount: number;
  nonFiniteCount: number;
  q1: number | null;
  q3: number | null;
  median: number | null;
  distinctCount: number;
}

/**
 * SQL query result for statistics
 */
interface StatsResult {
  min: number | null;
  max: number | null;
  count: number;
  null_count: number;
  non_finite_count: number;
  q1: number | null;
  q3: number | null;
  median: number | null;
  distinct_count: number;
}

/**
 * SQL query result for histogram bins
 */
interface BinResult {
  bin_idx: number;
  count: number;
}

/**
 * SQL query result for discrete value counts
 */
interface DiscreteResult {
  value: number;
  count: number;
}

// =========================================
// Bin Calculation
// =========================================

/**
 * Calculate the optimal number of bins for a histogram
 *
 * Uses Freedman-Diaconis rule as primary method:
 *   binWidth = 2 * IQR / n^(1/3)
 *   numBins = (max - min) / binWidth
 *
 * Falls back to Sturges' rule when IQR is 0:
 *   numBins = ceil(log2(n) + 1)
 *
 * @param min - Minimum value in the data
 * @param max - Maximum value in the data
 * @param count - Number of non-null values
 * @param iqr - Interquartile range (Q3 - Q1)
 * @param maxBins - Maximum allowed bins (default: 100)
 * @returns Optimal number of bins, clamped to [5, maxBins]
 */
export function calculateOptimalBins(
  min: number,
  max: number,
  count: number,
  iqr: number,
  maxBins = 100,
): number {
  // Edge cases
  if (count <= 1) {
    return 1;
  }

  if (min === max) {
    return 1; // All same value
  }

  const range = max - min;

  // Use Freedman-Diaconis rule if IQR is meaningful
  if (iqr > 0) {
    const binWidth = (2 * iqr) / Math.pow(count, 1 / 3);
    if (binWidth > 0) {
      const numBins = Math.ceil(range / binWidth);
      return clampBins(numBins, maxBins);
    }
  }

  // Fallback to Sturges' rule
  const sturgesBins = Math.ceil(Math.log2(count) + 1);
  return clampBins(sturgesBins, maxBins);
}

/**
 * Clamp bin count to reasonable range
 * @param numBins - Calculated number of bins
 * @param maxBins - Maximum allowed bins (default: 100)
 */
function clampBins(numBins: number, maxBins = 100): number {
  const MIN_BINS = 5;
  return Math.max(MIN_BINS, Math.min(maxBins, numBins));
}

// =========================================
// Data Fetching
// =========================================

/**
 * SQL that is true for a finite value and false for `NaN`, `Infinity` and
 * `-Infinity`, which a FLOAT or DOUBLE column can hold; NULL for NULL.
 *
 * Non-finite values have no place on a histogram's axis. DuckDB sorts `NaN`
 * above every number, so a column holding one had a maximum of `NaN`, which
 * the bin query printed into its SQL as a column name (`Binder Error:
 * Referenced column "NaN" not found`), and casting an infinite bin index to
 * INTEGER fails too. The cast to DOUBLE lets the test take a column of any
 * numeric type; an integer or DECIMAL value is always finite.
 */
function finiteSQL(col: string): string {
  return `isfinite(CAST(${col} AS DOUBLE))`;
}

/**
 * Fetch column statistics needed for histogram calculation.
 *
 * `min`, `max`, the quartiles and `distinctCount` are of the finite values.
 * `count` and `nullCount` still count every row, as line 1 of the stats and
 * the hover percentages do, and `nonFiniteCount` is the non-finite values
 * among `count`.
 */
export async function fetchColumnStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<ColumnStats> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  // CAST to DOUBLE ensures consistent JavaScript number types regardless of
  // source column type (DECIMAL, FLOAT, HUGEINT from parquet, etc.)
  //
  // The subquery's `f` is the value when it is finite and NULL otherwise,
  // so every aggregate of `f`, as each skips NULLs, is of the finite values.
  // Testing once per row there costs less than a FILTER clause on each
  // aggregate, which tests every row again for each one.
  const sql = `
    SELECT
      CAST(MIN(f) AS DOUBLE) as min,
      CAST(MAX(f) AS DOUBLE) as max,
      COUNT(v) as count,
      COUNT(*) - COUNT(v) as null_count,
      COUNT(v) - COUNT(f) as non_finite_count,
      CAST(APPROX_QUANTILE(f, 0.25) AS DOUBLE) as q1,
      CAST(APPROX_QUANTILE(f, 0.5) AS DOUBLE) as median,
      CAST(APPROX_QUANTILE(f, 0.75) AS DOUBLE) as q3,
      COUNT(DISTINCT f) as distinct_count
    FROM (
      SELECT ${col} AS v, CASE WHEN ${finiteSQL(col)} THEN ${col} END AS f
      FROM ${tbl}
      ${whereSQL}
    )
  `;

  const results = await bridge.query<StatsResult>(sql);

  if (results.length === 0) {
    return {
      min: null,
      max: null,
      count: 0,
      nullCount: 0,
      nonFiniteCount: 0,
      q1: null,
      q3: null,
      median: null,
      distinctCount: 0,
    };
  }

  const row = results[0]!;
  return {
    min: row.min,
    max: row.max,
    count: Number(row.count),
    nullCount: Number(row.null_count),
    nonFiniteCount: Number(row.non_finite_count ?? 0),
    q1: row.q1,
    q3: row.q3,
    median: row.median ?? null,
    distinctCount: Number(row.distinct_count),
  };
}

/**
 * Fetch distinct values with counts for discrete binning
 * Used when a column has few unique values (≤ DISCRETE_BIN_THRESHOLD).
 * Non-finite values get no bar: a click on one would filter `"v" = NULL`.
 */
export async function fetchDiscreteValues(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<DiscreteResult[]> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `${col} IS NOT NULL AND ${finiteSQL(col)}`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const sql = `
    SELECT ${col} as value, COUNT(*) as count
    FROM ${tbl}
    ${whereSQL}
    GROUP BY ${col}
    ORDER BY ${col}
  `;

  return bridge.query<DiscreteResult>(sql);
}

/**
 * Build SQL query for histogram binning
 *
 * Uses manual bin calculation with FLOOR since DuckDB WASM doesn't support WIDTH_BUCKET.
 * Formula: bin_idx = FLOOR((value - min) / binWidth)
 * Values at max are clamped to the last bin (numBins - 1).
 *
 * The value is cast to DOUBLE before `min` is subtracted. DuckDB binds an
 * integer literal to the other operand's type when it fits, so `col - -28775`
 * on a SMALLINT column is SMALLINT arithmetic, which overflows once a value
 * is more than 32,767 above the minimum (and likewise for every integer
 * width, and for a DECIMAL spanning most of its precision). `min`, `max` and
 * `binWidth` are DOUBLEs from {@link fetchColumnStats}, so the cast also
 * rounds each value as the minimum was rounded: past 2^53 a value can no
 * longer fall below a minimum that rounded up, which threw on UBIGINT and
 * dropped the row on BIGINT.
 */
function buildHistogramSQL(
  tableName: string,
  column: string,
  numBins: number,
  min: number,
  max: number,
  filters: Filter[],
): string {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);

  // Calculate bin width
  const binWidth = (max - min) / numBins;

  // Build WHERE clause - always exclude nulls and non-finite values, whose
  // bin index cannot be cast to INTEGER, add user filters if present
  const baseCondition = `${col} IS NOT NULL AND ${finiteSQL(col)}`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  // Manual bin calculation using FLOOR
  // Use LEAST to clamp the max value to the last bin (numBins - 1)
  // This handles the edge case where value == max
  const sql = `
    SELECT
      LEAST(FLOOR((CAST(${col} AS DOUBLE) - ${min}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM ${tbl}
    ${whereSQL}
    GROUP BY bin_idx
    HAVING bin_idx >= 0 AND bin_idx < ${numBins}
    ORDER BY bin_idx
  `;

  return sql;
}

/**
 * Fetch histogram bins using pre-computed bin parameters.
 * Used for crossfilter alignment: both background and foreground use the
 * same min/max/numBins so their bin edges match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column
 * @param min - Pre-computed minimum value for bin range
 * @param max - Pre-computed maximum value for bin range
 * @param numBins - Number of bins to create
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of HistogramBin with aligned edges
 */
export async function fetchHistogramBins(
  tableName: string,
  column: string,
  min: number,
  max: number,
  numBins: number,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<HistogramBin[]> {
  const sql = buildHistogramSQL(tableName, column, numBins, min, max, filters);
  const binResults = await bridge.query<BinResult>(sql);

  const binWidth = (max - min) / numBins;
  const bins: HistogramBin[] = [];

  // Create all bins (even empty ones) for consistent visualization
  for (let i = 0; i < numBins; i++) {
    const x0 = min + i * binWidth;
    const x1 = i === numBins - 1 ? max : min + (i + 1) * binWidth;
    bins.push({ x0, x1, count: 0 });
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
 * Fetch discrete bins for a column using a pre-determined set of discrete values.
 * Used for crossfilter alignment: both background and foreground use the same
 * discrete values so segments match exactly.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column
 * @param discreteValues - The discrete values to count (from background stats)
 * @param filters - Filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns Array of HistogramBin with matching discrete values
 */
export async function fetchDiscreteBins(
  tableName: string,
  column: string,
  discreteValues: number[],
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<HistogramBin[]> {
  const rawResults = await fetchDiscreteValues(tableName, column, filters, bridge);
  const countMap = new Map<number, number>();
  for (const dv of rawResults) {
    countMap.set(dv.value, Number(dv.count));
  }

  // Build bins matching the reference discrete values (from background)
  return discreteValues.map((v) => ({
    x0: v,
    x1: v,
    count: countMap.get(v) ?? 0,
  }));
}

/**
 * Fetch histogram data for a numeric column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column to histogram
 * @param maxBins - Maximum number of bins (optimal bins calculated and clamped to this)
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @returns HistogramData with bins and metadata
 */
export async function fetchHistogramData(
  tableName: string,
  column: string,
  maxBins: number | 'auto',
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<HistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge);
    const { nonFiniteCount } = stats;
    // The values the bins hold: NaN and ±Infinity have no place on the axis.
    const finiteCount = stats.count - nonFiniteCount;

    // Handle edge case: no data (all nulls, all non-finite, or empty)
    if (finiteCount === 0 || stats.min === null || stats.max === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        min: NaN, // NaN indicates no valid numeric range
        max: NaN, // NaN indicates no valid numeric range
        total: stats.count + stats.nullCount,
        isSingleValue: false,
        isDiscrete: false,
        median: null,
        distinctCount: 0,
        nonFiniteCount,
      };
    }

    // Step 2: Calculate optimal number of bins (clamped to maxBins)
    const iqr = stats.q1 !== null && stats.q3 !== null ? stats.q3 - stats.q1 : 0;
    const maxBinsValue = maxBins === 'auto' ? 100 : maxBins;
    const actualBins = calculateOptimalBins(stats.min, stats.max, finiteCount, iqr, maxBinsValue);

    // Handle edge case: all same value (single value column)
    if (stats.min === stats.max) {
      return {
        bins: [{ x0: stats.min, x1: stats.min, count: finiteCount }],
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
        isSingleValue: true,
        isDiscrete: true, // Single value is also discrete
        median: stats.median,
        distinctCount: stats.distinctCount,
        nonFiniteCount,
      };
    }

    // Step 2.5: Check for discrete binning (few unique values)
    if (stats.distinctCount <= DISCRETE_BIN_THRESHOLD) {
      const discreteValues = await fetchDiscreteValues(tableName, column, filters, bridge);

      // Create one bin per unique value (x0 = x1 = value)
      const bins: HistogramBin[] = discreteValues.map((dv) => ({
        x0: dv.value,
        x1: dv.value,
        count: Number(dv.count),
      }));

      return {
        bins,
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
        isSingleValue: false,
        isDiscrete: true,
        median: stats.median,
        distinctCount: stats.distinctCount,
        nonFiniteCount,
      };
    }

    // Step 3: Fetch histogram bins using shared helper
    const bins = await fetchHistogramBins(
      tableName,
      column,
      stats.min,
      stats.max,
      actualBins,
      filters,
      bridge,
    );

    return {
      bins,
      nullCount: stats.nullCount,
      min: stats.min,
      max: stats.max,
      total: stats.count + stats.nullCount,
      isSingleValue: false,
      isDiscrete: false,
      median: stats.median,
      distinctCount: stats.distinctCount,
      nonFiniteCount,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
