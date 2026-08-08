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

// Re-export SQL utilities for use by other modules
export { filtersToWhereClause, formatSQLValue } from '../../filters/FilterSQL';

/** Default number of top categories to show */
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
  /** For "Other" segment: how many distinct values it represents */
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
  /** True when every value is unique (no repeated values) */
  isAllUnique: boolean;
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
      COUNT(DISTINCT ${col}) as distinct_count
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
 * @returns ValueCountsData with segments and metadata
 */
export async function fetchValueCountsData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  maxCategories: number = DEFAULT_MAX_CATEGORIES,
): Promise<ValueCountsData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge);

    // Handle edge case: no data (all nulls or empty)
    if (stats.nonNullCount === 0) {
      return {
        segments: [],
        nullCount: stats.nullCount,
        distinctCount: 0,
        total: stats.total,
        isAllUnique: false,
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

    // Step 4: Calculate "Other" segment if there are more categories
    if (stats.distinctCount > maxCategories) {
      const otherCount = stats.nonNullCount - topCategoriesTotal;
      const otherDistinctCount = stats.distinctCount - topCategories.length;

      if (otherCount > 0) {
        segments.push({
          value: 'Other',
          count: otherCount,
          isOther: true,
          otherCount: otherDistinctCount,
        });
      }
    }

    // Step 5: Determine if all values are unique
    // (every non-null value appears exactly once)
    const isAllUnique = stats.distinctCount === stats.nonNullCount && stats.nonNullCount > 1;

    return {
      segments,
      nullCount: stats.nullCount,
      distinctCount: stats.distinctCount,
      total: stats.total,
      isAllUnique,
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
 * @returns ValueCountsData with segments aligned to background categories
 */
export async function fetchAlignedValueCountsData(
  tableName: string,
  column: string,
  backgroundCategories: string[],
  backgroundHasOther: boolean,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<ValueCountsData> {
  try {
    // Step 1: Fetch foreground column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge);

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
      const otherCount = stats.nonNullCount - topCategoriesTotal;
      segments.push({
        value: 'Other',
        count: Math.max(otherCount, 0),
        isOther: true,
        otherCount: Math.max(stats.distinctCount - backgroundCategories.length, 0),
      });
    }

    // Step 4: Determine if all values are unique
    const isAllUnique = stats.distinctCount === stats.nonNullCount && stats.nonNullCount > 1;

    return {
      segments,
      nullCount: stats.nullCount,
      distinctCount: stats.distinctCount,
      total: stats.total,
      isAllUnique,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch aligned value counts for column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
