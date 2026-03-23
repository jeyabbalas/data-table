/**
 * StatsComputer - Standalone stats computation for columns without visualizations
 *
 * Used for column types that don't have a registered visualization
 * (currently: interval). Visualized columns emit stats via their
 * onDefaultStatsChange callback instead.
 */

import type { Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { IntervalColumnStats } from './ColumnStatsTypes';
import { filtersToWhereClause } from '../filters/FilterSQL';

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
  unfilteredTotal?: number
): Promise<IntervalColumnStats> {
  const whereClause = filtersToWhereClause(filters);
  const whereSQL = whereClause ? `WHERE ${whereClause}` : '';

  const sql = `
    SELECT
      COUNT(*) as total,
      COUNT("${column}") as non_null,
      COUNT(*) - COUNT("${column}") as null_count,
      MIN("${column}")::VARCHAR as min_val,
      MAX("${column}")::VARCHAR as max_val,
      APPROX_QUANTILE("${column}", 0.5)::VARCHAR as median_val
    FROM "${tableName}"
    ${whereSQL}
  `;

  const results = await bridge.query<IntervalStatsResult>(sql);

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
    minDisplay: row.min_val ?? null,
    maxDisplay: row.max_val ?? null,
    medianDisplay: row.median_val ?? null,
  };
}
