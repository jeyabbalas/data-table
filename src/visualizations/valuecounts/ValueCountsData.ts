/**
 * ValueCountsData - Data fetching and processing for value counts visualization
 *
 * This module provides:
 * - Category value counting from DuckDB
 * - Top N category aggregation with "Other" segment
 * - Filter to SQL integration
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, formatSQLValue, quoteIdentifier } from '../../filters/FilterSQL';
import { distinctCountExpr } from '../histogram/HistogramData';
import type { DistinctCountOptions } from '../histogram/HistogramData';

// Re-export SQL utilities for use by other modules
export { filtersToWhereClause, formatSQLValue } from '../../filters/FilterSQL';

/**
 * Default number of top categories to show — the `LIMIT` on the top-categories
 * query.
 *
 * Deliberately never compared against `distinctCount`: the "Other" segment is
 * keyed on `nonNullCount − Σ(top counts)`, two exact aggregates, so the
 * decision is unaffected by `approx_count_distinct`. It has to be. Unlike
 * `DISCRETE_BIN_THRESHOLD = 5` this number sits outside the range where the
 * sketch is exact (through cardinality 7) — at a true 10 DuckDB-WASM already
 * reports 11, measured in
 * `tests/visualizations/histogram/HistogramData.duckdb.test.ts` — so a
 * `distinctCount > maxCategories` gate would misfire at exactly the
 * cardinality it decides, and a miss drops the whole Other segment: the 11th
 * category's rows disappear from the bar instead of being mis-sized.
 */
const DEFAULT_MAX_CATEGORIES = 10;

// =========================================
// Interfaces
// =========================================

/**
 * A single category segment in the stacked bar
 */
export interface CategorySegment {
  /** The category value (string representation) */
  value: string;
  /** Count of rows with this value */
  count: number;
  /** Is this the "Other" aggregation segment? */
  isOther: boolean;
  /**
   * For "Other" segment: how many distinct values it represents.
   *
   * Derived from {@link ValueCountsData.distinctCount}, so it is an estimate —
   * floored at 1 — whenever {@link ValueCountsData.distinctCountApprox} is set
   * on the enclosing result. {@link CategorySegment.count} is exact either way.
   */
  otherCount?: number;
}

/**
 * Complete value counts data including segments and metadata
 */
export interface ValueCountsData {
  /** Array of category segments (top N + "Other" if applicable) */
  segments: CategorySegment[];
  /** Count of null values in the column */
  nullCount: number;
  /** Total number of distinct non-null values */
  distinctCount: number;
  /** Total row count (including nulls) */
  total: number;
  /**
   * True when every value is unique (no repeated values).
   *
   * Always `false` when {@link ValueCountsData.distinctCountApprox} is set —
   * see the derivation in `fetchValueCountsData`.
   */
  isAllUnique: boolean;
  /**
   * True when `distinctCount` came from `approx_count_distinct` rather than
   * an exact `COUNT(DISTINCT …)`. Absent means exact.
   */
  distinctCountApprox?: boolean;
}

/**
 * SQL query result for column statistics
 */
interface StatsResult {
  total: number;
  non_null_count: number;
  null_count: number;
  distinct_count: number;
}

/**
 * SQL query result for category counts
 */
interface CategoryResult {
  value: string;
  count: number;
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch column statistics for value counts
 */
async function fetchColumnStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  useApproxDistinct: boolean,
): Promise<{ total: number; nonNullCount: number; nullCount: number; distinctCount: number }> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  const sql = `
    SELECT
      COUNT(*) as total,
      COUNT(${col}) as non_null_count,
      COUNT(*) - COUNT(${col}) as null_count,
      ${distinctCountExpr(col, useApproxDistinct)} as distinct_count
    FROM ${tbl}
    ${whereSQL}
  `;

  const results = await bridge.query<StatsResult>(sql, undefined, { priority: 'low' });

  if (results.length === 0) {
    return {
      total: 0,
      nonNullCount: 0,
      nullCount: 0,
      distinctCount: 0,
    };
  }

  const row = results[0]!;
  return {
    total: Number(row.total),
    nonNullCount: Number(row.non_null_count),
    nullCount: Number(row.null_count),
    distinctCount: Number(row.distinct_count),
  };
}

/**
 * Fetch top N categories with counts
 */
async function fetchTopCategories(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  limit: number,
): Promise<CategoryResult[]> {
  const col = quoteIdentifier(column);
  const tbl = quoteIdentifier(tableName);
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `${col} IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const sql = `
    SELECT
      CAST(${col} AS VARCHAR) as value,
      COUNT(*) as count
    FROM ${tbl}
    ${whereSQL}
    GROUP BY ${col}
    ORDER BY count DESC, value ASC
    LIMIT ${limit}
  `;

  return bridge.query<CategoryResult>(sql, undefined, { priority: 'low' });
}

/**
 * Fetch value counts data for a categorical column
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column to analyze
 * @param filters - Active filters to apply
 * @param bridge - WorkerBridge for executing queries
 * @param maxCategories - Maximum number of top categories to show (default: 10)
 * @param options - `{ useApproxDistinct }`; omitted means exact distinct count
 * @returns ValueCountsData with segments and metadata
 */
export async function fetchValueCountsData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxCategories: number = DEFAULT_MAX_CATEGORIES,
  options?: DistinctCountOptions,
): Promise<ValueCountsData> {
  const useApproxDistinct = options?.useApproxDistinct === true;
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge, useApproxDistinct);

    // Handle edge case: no data (all nulls or empty)
    if (stats.nonNullCount === 0) {
      return {
        segments: [],
        nullCount: stats.nullCount,
        distinctCount: 0,
        total: stats.total,
        isAllUnique: false,
        distinctCountApprox: useApproxDistinct,
      };
    }

    // Step 2: Fetch top categories
    const topCategories = await fetchTopCategories(
      tableName,
      column,
      filters,
      bridge,
      maxCategories,
    );

    // Step 3: Build segments array
    const segments: CategorySegment[] = [];
    let topCategoriesTotal = 0;

    for (const cat of topCategories) {
      const count = Number(cat.count);
      topCategoriesTotal += count;
      segments.push({
        value: cat.value,
        count,
        isOther: false,
      });
    }

    // Step 4: Calculate "Other" segment if the LIMIT truncated the categories.
    // Keyed on the row remainder alone — both terms are exact aggregates, and
    // the remainder is > 0 exactly when `LIMIT maxCategories` left categories
    // behind. See DEFAULT_MAX_CATEGORIES for why a `distinctCount >
    // maxCategories` gate cannot be trusted to say the same thing.
    const otherCount = stats.nonNullCount - topCategoriesTotal;
    if (otherCount > 0) {
      segments.push({
        value: 'Other',
        count: otherCount,
        isOther: true,
        // Floored at 1: an under-estimating sketch can subtract to <= 0 (a
        // reported 10 minus 10 top categories) while the row remainder above
        // proves at least one more distinct value is in there.
        otherCount: Math.max(stats.distinctCount - topCategories.length, 1),
      });
    }

    // Step 5: Determine if all values are unique
    // (every non-null value appears exactly once)
    //
    // Suppressed under approximate counts: `approx_count_distinct` is a
    // HyperLogLog sketch carrying ~2% error, so `distinctCount ===
    // nonNullCount` becomes a coin flip on a genuinely all-unique column and
    // an occasional false positive on one that is merely near-unique. The
    // flag drives a full-width display-only "All unique (n)" segment that
    // emits no filter and replaces the real category breakdown, so getting
    // it wrong is a visible, un-clickable lie rather than a rounding error.
    const isAllUnique =
      !useApproxDistinct && stats.distinctCount === stats.nonNullCount && stats.nonNullCount > 1;

    return {
      segments,
      nullCount: stats.nullCount,
      distinctCount: stats.distinctCount,
      total: stats.total,
      isAllUnique,
      distinctCountApprox: useApproxDistinct,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch value counts for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}

/**
 * Fetch foreground value counts aligned to the background's category set.
 *
 * This ensures foreground segments match the background's categories in the same order,
 * preventing category mismatch in crossfilter mode. Mirrors the pattern of fetchDiscreteBins
 * in HistogramData.ts.
 *
 * @param tableName - Name of the DuckDB table
 * @param column - Name of the column to analyze
 * @param backgroundCategories - Category values from the background data (non-Other segments)
 * @param backgroundHasOther - Whether the background data has an "Other" segment
 * @param filters - Active filters to apply (all filters including own)
 * @param bridge - WorkerBridge for executing queries
 * @param options - `{ useApproxDistinct }`; omitted means exact distinct count
 * @returns ValueCountsData with segments aligned to background categories
 */
export async function fetchAlignedValueCountsData(
  tableName: string,
  column: string,
  backgroundCategories: string[],
  backgroundHasOther: boolean,
  filters: Filter[],
  bridge: WorkerBridge,
  options?: DistinctCountOptions,
): Promise<ValueCountsData> {
  const useApproxDistinct = options?.useApproxDistinct === true;
  try {
    // Step 1: Fetch foreground column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge, useApproxDistinct);

    // Handle edge case: no non-null data
    if (stats.nonNullCount === 0) {
      // Return empty segments for each background category (count=0) to maintain alignment
      const segments: CategorySegment[] = backgroundCategories.map((value) => ({
        value,
        count: 0,
        isOther: false,
      }));
      if (backgroundHasOther) {
        segments.push({
          value: 'Other',
          count: 0,
          isOther: true,
          otherCount: 0,
        });
      }
      return {
        segments,
        nullCount: stats.nullCount,
        distinctCount: 0,
        total: stats.total,
        isAllUnique: false,
        distinctCountApprox: useApproxDistinct,
      };
    }

    // Step 2: Query counts for the background's categories only
    let segments: CategorySegment[];
    let topCategoriesTotal = 0;

    if (backgroundCategories.length > 0) {
      const col = quoteIdentifier(column);
      const tbl = quoteIdentifier(tableName);
      const whereClause = filtersToWhereClause(filters);
      const inValues = backgroundCategories.map((v) => formatSQLValue(v)).join(', ');
      const baseCondition = `CAST(${col} AS VARCHAR) IN (${inValues})`;
      const whereSQL = whereClause
        ? `WHERE ${baseCondition} AND ${whereClause}`
        : `WHERE ${baseCondition}`;

      const sql = `
        SELECT
          CAST(${col} AS VARCHAR) as value,
          COUNT(*) as count
        FROM ${tbl}
        ${whereSQL}
        GROUP BY CAST(${col} AS VARCHAR)
      `;

      const results = await bridge.query<CategoryResult>(sql, undefined, { priority: 'low' });
      const countByValue = new Map<string, number>();
      for (const row of results) {
        countByValue.set(row.value, Number(row.count));
      }

      // Build segments in same order as background, defaulting to count: 0
      segments = backgroundCategories.map((value) => {
        const count = countByValue.get(value) ?? 0;
        topCategoriesTotal += count;
        return {
          value,
          count,
          isOther: false,
        };
      });
    } else {
      segments = [];
    }

    // Step 3: Compute foreground "Other" if background has Other
    if (backgroundHasOther) {
      const otherCount = Math.max(stats.nonNullCount - topCategoriesTotal, 0);
      segments.push({
        value: 'Other',
        count: otherCount,
        isOther: true,
        // Same floor as the unfiltered path, but only while rows remain: an
        // aligned Other with no foreground rows really does hold 0 values.
        otherCount: Math.max(
          stats.distinctCount - backgroundCategories.length,
          otherCount > 0 ? 1 : 0,
        ),
      });
    }

    // Step 4: Determine if all values are unique.
    // Suppressed under approximate counts for the same reason as the
    // unfiltered path above — a HyperLogLog estimate cannot support an
    // exact-equality claim.
    const isAllUnique =
      !useApproxDistinct && stats.distinctCount === stats.nonNullCount && stats.nonNullCount > 1;

    return {
      segments,
      nullCount: stats.nullCount,
      distinctCount: stats.distinctCount,
      total: stats.total,
      isAllUnique,
      distinctCountApprox: useApproxDistinct,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch aligned value counts for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
