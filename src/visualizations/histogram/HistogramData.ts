/**
 * HistogramData - Data fetching and processing for histogram visualizations
 *
 * This module provides:
 * - Histogram data fetching from DuckDB
 * - Optimal bin count calculation (Freedman-Diaconis/Sturges rules)
 * - Filter to SQL conversion utilities
 */

import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';

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
 * Complete histogram data including bins and metadata
 */
export interface HistogramData {
  /** Array of histogram bins sorted by x0 */
  bins: HistogramBin[];
  /** Count of null values in the column */
  nullCount: number;
  /** Minimum non-null value */
  min: number;
  /** Maximum non-null value */
  max: number;
  /** Total count of all values (including nulls) */
  total: number;
}

/**
 * Statistics needed for optimal bin calculation (internal)
 */
interface ColumnStats {
  min: number | null;
  max: number | null;
  count: number;
  nullCount: number;
  q1: number | null;
  q3: number | null;
}

/**
 * SQL query result for statistics
 */
interface StatsResult {
  min: number | null;
  max: number | null;
  count: number;
  null_count: number;
  q1: number | null;
  q3: number | null;
}

/**
 * SQL query result for histogram bins
 */
interface BinResult {
  bin_idx: number;
  count: number;
}

// =========================================
// SQL Utilities
// =========================================

/**
 * Format a value for use in SQL queries
 * Handles proper escaping and quoting
 */
export function formatSQLValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 'NULL';
    }
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  // String - escape single quotes by doubling them
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Convert a single filter to SQL WHERE clause fragment
 */
function filterToSQL(filter: Filter): string {
  const column = `"${filter.column}"`;

  switch (filter.type) {
    case 'range': {
      const range = filter.value as { min: number | Date; max: number | Date };
      const minVal = formatSQLValue(range.min);
      const maxVal = formatSQLValue(range.max);
      return `(${column} >= ${minVal} AND ${column} < ${maxVal})`;
    }

    case 'point': {
      const val = formatSQLValue(filter.value);
      return `${column} = ${val}`;
    }

    case 'set': {
      const values = filter.value as unknown[];
      if (values.length === 0) {
        return 'FALSE'; // Empty set matches nothing
      }
      const formattedValues = values.map(formatSQLValue).join(', ');
      return `${column} IN (${formattedValues})`;
    }

    case 'null': {
      return `${column} IS NULL`;
    }

    case 'not-null': {
      return `${column} IS NOT NULL`;
    }

    case 'pattern': {
      // Escape SQL LIKE special characters in pattern value
      // But preserve % and _ as wildcards
      const pattern = formatSQLValue(filter.value);
      return `${column} LIKE ${pattern}`;
    }

    default: {
      // Unknown filter type - return always true
      console.warn(`Unknown filter type: ${(filter as Filter).type}`);
      return 'TRUE';
    }
  }
}

/**
 * Convert an array of filters to a SQL WHERE clause
 *
 * @param filters - Array of filters to convert
 * @param excludeColumn - Optional column name to exclude from the WHERE clause
 *                        (used for crossfilter behavior)
 * @returns SQL WHERE clause (without the WHERE keyword), or empty string if no filters
 */
export function filtersToWhereClause(
  filters: Filter[],
  excludeColumn?: string
): string {
  // Filter out excluded column if specified
  const applicableFilters = excludeColumn
    ? filters.filter((f) => f.column !== excludeColumn)
    : filters;

  if (applicableFilters.length === 0) {
    return '';
  }

  // Convert each filter to SQL and join with AND
  const clauses = applicableFilters.map(filterToSQL);
  return clauses.join(' AND ');
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
  maxBins: number = 100
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
function clampBins(numBins: number, maxBins: number = 100): number {
  const MIN_BINS = 5;
  return Math.max(MIN_BINS, Math.min(maxBins, numBins));
}

// =========================================
// Data Fetching
// =========================================

/**
 * Fetch column statistics needed for histogram calculation
 */
async function fetchColumnStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge
): Promise<ColumnStats> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  const sql = `
    SELECT
      MIN("${column}") as min,
      MAX("${column}") as max,
      COUNT("${column}") as count,
      COUNT(*) - COUNT("${column}") as null_count,
      APPROX_QUANTILE("${column}", 0.25) as q1,
      APPROX_QUANTILE("${column}", 0.75) as q3
    FROM "${tableName}"
    ${whereSQL}
  `;

  const results = await bridge.query<StatsResult>(sql);

  if (results.length === 0) {
    return {
      min: null,
      max: null,
      count: 0,
      nullCount: 0,
      q1: null,
      q3: null,
    };
  }

  const row = results[0];
  return {
    min: row.min,
    max: row.max,
    count: Number(row.count),
    nullCount: Number(row.null_count),
    q1: row.q1,
    q3: row.q3,
  };
}

/**
 * Build SQL query for histogram binning
 *
 * Uses manual bin calculation with FLOOR since DuckDB WASM doesn't support WIDTH_BUCKET.
 * Formula: bin_idx = FLOOR((value - min) / binWidth)
 * Values at max are clamped to the last bin (numBins - 1).
 */
function buildHistogramSQL(
  tableName: string,
  column: string,
  numBins: number,
  min: number,
  max: number,
  filters: Filter[]
): string {
  const whereClause = filtersToWhereClause(filters);

  // Calculate bin width
  const binWidth = (max - min) / numBins;

  // Build WHERE clause - always exclude nulls, add user filters if present
  const baseCondition = `"${column}" IS NOT NULL`;
  const whereSQL = whereClause
    ? `WHERE ${baseCondition} AND ${whereClause}`
    : `WHERE ${baseCondition}`;

  // Manual bin calculation using FLOOR
  // Use LEAST to clamp the max value to the last bin (numBins - 1)
  // This handles the edge case where value == max
  const sql = `
    SELECT
      LEAST(FLOOR(("${column}" - ${min}) / ${binWidth})::INTEGER, ${numBins - 1}) as bin_idx,
      COUNT(*) as count
    FROM "${tableName}"
    ${whereSQL}
    GROUP BY bin_idx
    HAVING bin_idx >= 0 AND bin_idx < ${numBins}
    ORDER BY bin_idx
  `;

  return sql;
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
  bridge: WorkerBridge
): Promise<HistogramData> {
  try {
    // Step 1: Fetch column statistics
    const stats = await fetchColumnStats(tableName, column, filters, bridge);

    // Handle edge case: no data
    if (stats.count === 0 || stats.min === null || stats.max === null) {
      return {
        bins: [],
        nullCount: stats.nullCount,
        min: 0,
        max: 0,
        total: stats.count + stats.nullCount,
      };
    }

    // Step 2: Calculate optimal number of bins (clamped to maxBins)
    const iqr =
      stats.q1 !== null && stats.q3 !== null ? stats.q3 - stats.q1 : 0;
    const maxBinsValue = maxBins === 'auto' ? 100 : maxBins;
    const actualBins = calculateOptimalBins(
      stats.min,
      stats.max,
      stats.count,
      iqr,
      maxBinsValue
    );

    // Handle edge case: all same value
    if (stats.min === stats.max) {
      return {
        bins: [{ x0: stats.min, x1: stats.min, count: stats.count }],
        nullCount: stats.nullCount,
        min: stats.min,
        max: stats.max,
        total: stats.count + stats.nullCount,
      };
    }

    // Step 3: Fetch histogram bins
    const sql = buildHistogramSQL(
      tableName,
      column,
      actualBins,
      stats.min,
      stats.max,
      filters
    );
    const binResults = await bridge.query<BinResult>(sql);

    // Step 4: Convert results to HistogramBin format
    const binWidth = (stats.max - stats.min) / actualBins;
    const bins: HistogramBin[] = [];

    // Create all bins (even empty ones) for consistent visualization
    for (let i = 0; i < actualBins; i++) {
      const x0 = stats.min + i * binWidth;
      const x1 = i === actualBins - 1 ? stats.max : stats.min + (i + 1) * binWidth;
      bins.push({ x0, x1, count: 0 });
    }

    // Fill in counts from query results
    for (const result of binResults) {
      const idx = Number(result.bin_idx);
      if (idx >= 0 && idx < bins.length) {
        bins[idx].count = Number(result.count);
      }
    }

    return {
      bins,
      nullCount: stats.nullCount,
      min: stats.min,
      max: stats.max,
      total: stats.count + stats.nullCount,
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch histogram data for column "${column}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
