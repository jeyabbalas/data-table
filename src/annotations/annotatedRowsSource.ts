/**
 * The DuckDB helper table that holds a table's annotated rows, and how a
 * reader gets it current.
 *
 * It has one row for each distinct `rowId` with row- or cell-scope
 * annotations: `__rowid__ BIGINT`, and `__mask__ UTINYINT`, whose bits are
 * the severities of that row's row- and cell-scope annotations (error 1,
 * warning 2, info 4). Column-scope annotations single out no rows, so it
 * leaves them out. The `annotated` filter selects a view's rows through it,
 * and navigation finds the next annotated row of a sorted or filtered view
 * with it.
 */

/**
 * The helper table's name for a base table. Base table names are unique on
 * a bridge, so two tables sharing one never share a helper.
 *
 * @internal
 */
export function annotatedRowsTableName(baseTable: string): string {
  return `__dt_annot_${baseTable}__`;
}

/**
 * Keeps a base table's helper table current with its annotation store.
 *
 * @internal
 */
export interface AnnotatedRowsSource {
  /**
   * The helper table's name once it holds the store's current annotated
   * rows: at once when it does, after a sync when the annotations changed
   * since the last one. Rejects with a `QueryError` coded `NO_TABLE` when no
   * table is loaded, and `QUERY_ABORTED` when `signal` aborts first.
   */
  ensureFresh(signal?: AbortSignal): Promise<string>;
}
