/**
 * ValueCountsData - Data fetching and processing for value counts visualization
 *
 * This module provides:
 * - Category value counting from DuckDB
 * - Top N category aggregation with "Other" segment
 * - Filter to SQL integration
 */

import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, formatSQLValue } from '../histogram/HistogramData';

// Re-export SQL utilities for use by other modules
export { filtersToWhereClause, formatSQLValue };

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
  bridge: WorkerBridge
): Promise<{ total: number; nonNullCount: number; nullCount: number; distinctCount: number }> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  const sql = `
    SELECT
      COUNT(*) as total,
      COUNT("${column}") as non_null_count,
      COUNT(*) - COUNT("${column}") as null_count,
      COUNT(DISTINCT "${column}") as distinct_count
    FROM "${tableName}"
    ${whereSQL}
  `;

  const results = await bridge.query<StatsResult>(sql);

  if (results.length === 0) {
    return {
      total: 0,
      nonNullCount: 0,
      nullCount: 0,
      distinctCount: 0,
    };
  }

  const row = results[0];
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
  limit: number
): Promise<CategoryResult[]> {
  const whereClause = filtersToWhereClause(filters);
  const baseCondition = `"${column}" IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  const sql = `
    SELECT
      CAST("${column}" AS VARCHAR) as value,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY "${column}"
    ORDER BY count DESC, value ASC
    LIMIT ${limit}
  `;

  return bridge.query<CategoryResult>(sql);
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
  maxCategories: number = DEFAULT_MAX_CATEGORIES
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
      maxCategories
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
    throw new Error(
      `Failed to fetch value counts for column "${column}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
