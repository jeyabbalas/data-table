/**
 * StatsComputer - Standalone stats computation for columns without visualizations
 *
 * Used for column types that don't have a registered visualization
 * (currently: interval). Visualized columns emit stats via their
 * onDefaultStatsChange callback instead.
 */

import type { Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import {
  parseIntervalToSeconds,
  secondsToIntervalString,
} from '../visualizations/histogram/IntervalHistogramData';
import type { IntervalColumnStats } from './ColumnStatsTypes';

/**
 * SQL query result for interval stats
 */
interface IntervalStatsResult {
  total: number;
  non_null: number;
  null_count: number;
  min_val: string | null;
  max_val: string | null;
  median_val: string | null;
}

/**
 * Fetch stats for an interval column via DuckDB SQL.
 *
 * DuckDB supports MIN, MAX, and APPROX_QUANTILE on INTERVAL types.
 * Results are cast to VARCHAR for display.
 */
export async function fetchIntervalStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  unfilteredTotal?: number,
): Promise<IntervalColumnStats> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';
  const col = quoteIdentifier(column);
  const table = quoteIdentifier(tableName);

  try {
    // Try full query with APPROX_QUANTILE first; fall back without it
    // since APPROX_QUANTILE may not support INTERVAL in all DuckDB versions.
    let results: IntervalStatsResult[];
    try {
      const sql = `
        SELECT
          COUNT(*) as total,
          COUNT(${col}) as non_null,
          COUNT(*) - COUNT(${col}) as null_count,
          MIN(${col})::VARCHAR as min_val,
          MAX(${col})::VARCHAR as max_val,
          APPROX_QUANTILE(${col}, 0.5)::VARCHAR as median_val
        FROM ${table}
        ${whereSQL}
      `;
      results = await bridge.query<IntervalStatsResult>(sql);
    } catch {
      // APPROX_QUANTILE not supported for INTERVAL — retry without median
      const sql = `
        SELECT
          COUNT(*) as total,
          COUNT(${col}) as non_null,
          COUNT(*) - COUNT(${col}) as null_count,
          MIN(${col})::VARCHAR as min_val,
          MAX(${col})::VARCHAR as max_val,
          NULL as median_val
        FROM ${table}
        ${whereSQL}
      `;
      results = await bridge.query<IntervalStatsResult>(sql);
    }

    if (results.length === 0) {
      return {
        kind: 'interval',
        totalRows: unfilteredTotal ?? 0,
        nonNullCount: 0,
        nullCount: 0,
        filteredTotalRows: unfilteredTotal !== undefined ? 0 : null,
        minDisplay: null,
        maxDisplay: null,
        medianDisplay: null,
      };
    }

    const row = results[0];
    const total = Number(row.total);
    const nonNull = Number(row.non_null);
    const nullCount = Number(row.null_count);

    return {
      kind: 'interval',
      totalRows: unfilteredTotal ?? total,
      nonNullCount: nonNull,
      nullCount: nullCount,
      filteredTotalRows: unfilteredTotal !== undefined ? total : null,
      minDisplay: row.min_val
        ? secondsToIntervalString(parseIntervalToSeconds(row.min_val)!)
        : null,
      maxDisplay: row.max_val
        ? secondsToIntervalString(parseIntervalToSeconds(row.max_val)!)
        : null,
      medianDisplay: row.median_val
        ? secondsToIntervalString(parseIntervalToSeconds(row.median_val)!)
        : null,
    };
  } catch (error) {
    console.error(
      `[StatsComputer] Failed to fetch interval stats for column "${column}":`,
      error instanceof Error ? error.message : String(error),
    );

    // Return safe fallback so the UI doesn't break
    return {
      kind: 'interval',
      totalRows: unfilteredTotal ?? 0,
      nonNullCount: 0,
      nullCount: 0,
      filteredTotalRows: unfilteredTotal !== undefined ? 0 : null,
      minDisplay: null,
      maxDisplay: null,
      medianDisplay: null,
    };
  }
}
