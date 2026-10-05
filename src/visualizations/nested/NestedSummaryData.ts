/**
 * NestedSummaryData - the counts behind a nested column's summary chart
 *
 * A nested column's chart shows how many of its values are NULL, with and
 * without the active filters. Both come from one scan of the relation, with
 * no GROUP BY and no cast of the values: `COUNT(c)` reads only the column's
 * validity, so a `FLOAT[768]` embedding column costs what an integer column
 * does. (Grouping such a column by value, as the value counts do, took 18–21
 * seconds on 200k rows and froze the worker meanwhile.)
 */

import { QueryError } from '../../core/errors';
import type { Filter } from '../../core/types';
import type { WorkerBridge } from '../../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../../filters/FilterSQL';

/**
 * The counts a nested column's summary chart draws: rows and non-NULL
 * values, over the whole relation and over the rows passing the filters.
 *
 * @example
 * ```ts
 * const data: NestedSummaryData = {
 *   total: 1000,
 *   nonNullCount: 990,
 *   filtered: { total: 120, nonNullCount: 118 },
 * };
 * ```
 */
export interface NestedSummaryData {
  /** Rows in the relation, filters aside. */
  total: number;
  /** Of them, rows whose value is not NULL. */
  nonNullCount: number;
  /**
   * Rows passing the filters, and of them those whose value is not NULL.
   * `null` when no filter is active.
   */
  filtered: { total: number; nonNullCount: number } | null;
}

interface CountsRow {
  total: number | bigint;
  non_null: number | bigint;
  filtered_total?: number | bigint;
  filtered_non_null?: number | bigint;
}

/**
 * The SQL {@link fetchNestedSummaryData} runs: one ungrouped scan counting
 * rows and non-NULL values, and with filters the same two counts of the rows
 * passing them, as `FILTER (WHERE …)` aggregates of the same scan.
 */
export function nestedSummarySQL(tableName: string, column: string, filters: Filter[]): string {
  const col = quoteIdentifier(column);
  const where = filtersToWhereClause(filters);
  const counts = ['COUNT(*) AS total', `COUNT(${col}) AS non_null`];
  if (where) {
    counts.push(
      `COUNT(*) FILTER (WHERE ${where}) AS filtered_total`,
      `COUNT(${col}) FILTER (WHERE ${where}) AS filtered_non_null`,
    );
  }
  return `SELECT ${counts.join(', ')} FROM ${quoteIdentifier(tableName)}`;
}

/**
 * Count a nested column's rows and non-NULL values, over the whole relation
 * and over the rows passing `filters` (the column's own filter included, as
 * the other charts count their foreground), in one query.
 *
 * @param tableName - The relation the table reads: its table, or the view
 *   its derived columns make.
 * @param column - The nested column.
 * @param filters - The active filters.
 * @param bridge - The worker bridge to query through.
 * @throws {@link QueryError} `QUERY_RUNTIME` when the query fails.
 *
 * @example
 * ```ts
 * const data = await fetchNestedSummaryData('trips', 'stops', filters, bridge);
 * const nullShare = 1 - data.nonNullCount / data.total;
 * ```
 */
export async function fetchNestedSummaryData(
  tableName: string,
  column: string,
  filters: Filter[],
  bridge: WorkerBridge,
): Promise<NestedSummaryData> {
  try {
    const rows = await bridge.query<CountsRow>(nestedSummarySQL(tableName, column, filters));
    const row = rows[0];
    const total = Number(row?.total ?? 0);
    const nonNullCount = Number(row?.non_null ?? 0);
    const filtered =
      row?.filtered_total === undefined
        ? null
        : {
            total: Number(row.filtered_total),
            nonNullCount: Number(row.filtered_non_null ?? 0),
          };
    return { total, nonNullCount, filtered };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch the summary of column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
