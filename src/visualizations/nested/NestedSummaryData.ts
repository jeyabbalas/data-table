/**
 * NestedSummaryData - the counts behind a nested column's summary chart
 *
 * A nested column's chart shows how many of its values are NULL, with and
 * without the active filters. Both come from one query of two ungrouped
 * scans, with no GROUP BY and no cast of the values: `COUNT(c)` reads only
 * the column's validity, so a `FLOAT[768]` embedding column costs what an
 * integer column does. (Grouping such a column by value, as the value counts
 * do, took 18–21 seconds on 200k rows and froze the worker meanwhile.)
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

/** One row of {@link nestedSummarySQL}'s result. */
interface CountsRow {
  /** Whether the row counts the rows passing the filters, or all of them. */
  filtered: boolean;
  total: number | bigint;
  non_null: number | bigint;
}

/**
 * The SQL {@link fetchNestedSummaryData} runs: an ungrouped scan counting
 * rows and non-NULL values, and with filters a second one counting those of
 * the rows passing them, a row each, which `filtered` tells apart.
 *
 * The filters go in a WHERE clause, as the table's other queries put them. A
 * raw-SQL filter reads differently in an aggregate's `FILTER (WHERE …)`,
 * which is part of the SELECT list: there `COLUMNS('x|y') > 5` makes one
 * aggregate per matched column, not `x > 5 AND y > 5`. The two scans are a
 * UNION ALL rather than a join of two subqueries, where DuckDB lets the
 * second read the first's columns: a filter naming a column the relation
 * lacks would read a count there instead of failing, as it fails in the grid.
 */
export function nestedSummarySQL(tableName: string, column: string, filters: Filter[]): string {
  const counts = `COUNT(*) AS total, COUNT(${quoteIdentifier(column)}) AS non_null`;
  const from = `FROM ${quoteIdentifier(tableName)}`;
  const all = `SELECT FALSE AS filtered, ${counts} ${from}`;
  const where = filtersToWhereClause(filters);
  return where ? `${all} UNION ALL SELECT TRUE AS filtered, ${counts} ${from} WHERE ${where}` : all;
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
    const counts = (row: CountsRow | undefined) => ({
      total: Number(row?.total ?? 0),
      nonNullCount: Number(row?.non_null ?? 0),
    });
    // A UNION ALL keeps no order: each row says which count it is.
    const passing = rows.find((row) => row.filtered);
    return {
      ...counts(rows.find((row) => !row.filtered)),
      filtered: passing ? counts(passing) : null,
    };
  } catch (error) {
    throw new QueryError(
      `Failed to fetch the summary of column "${column}": ${error instanceof Error ? error.message : String(error)}`,
      { code: 'QUERY_RUNTIME', cause: error, details: { column } },
    );
  }
}
