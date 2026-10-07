/**
 * StatsComputer - Standalone stats computation
 *
 * Computes a column's stats without drawing its chart (currently: interval).
 * Visualized columns emit stats via their onDefaultStatsChange callback
 * instead.
 */

import type { Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import {
  fetchIntervalColumnStats,
  secondsToIntervalString,
} from '../visualizations/histogram/IntervalHistogramData';
import type { IntervalColumnStats } from './ColumnStatsTypes';

/**
 * Fetch stats for an interval column via DuckDB SQL.
 *
 * Runs the interval histogram's stats query, so the minimum, median and
 * maximum are computed on the chart's seconds scale (a month is 30.4375
 * days), and formatted like `4d 4h 0.5s`. All three are of the rows the
 * filters pass; under a filter the chart's stats line keeps the unfiltered
 * minimum and maximum beside the filtered median.
 */
export async function fetchIntervalStats(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
  unfilteredTotal?: number,
): Promise<IntervalColumnStats> {
  try {
    const stats = await fetchIntervalColumnStats(tableName, column, filters, bridge);
    const total = stats.count + stats.nullCount;
    const display = (seconds: number | null): string | null =>
      seconds === null ? null : secondsToIntervalString(seconds);

    return {
      kind: 'interval',
      totalRows: unfilteredTotal ?? total,
      nonNullCount: stats.count,
      nullCount: stats.nullCount,
      filteredTotalRows: unfilteredTotal !== undefined ? total : null,
      minDisplay: display(stats.minSeconds),
      maxDisplay: display(stats.maxSeconds),
      medianDisplay: display(stats.medianSeconds),
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
