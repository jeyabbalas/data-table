/**
 * The shapes of annotation navigation: `actions.nextAnnotation`,
 * `actions.previousAnnotation` and `actions.revealRow`, and the contract
 * `StateActions` delegates them through.
 *
 * Types only: the navigation itself is a chunk of its own
 * (`AnnotationNavigator`), loaded the first time it runs.
 */

import type { Annotation, AnnotationSeverity } from './types';

/**
 * Options for `actions.nextAnnotation` and `actions.previousAnnotation`.
 *
 * @example
 * // Errors only, and stop at the last one rather than go round to the first.
 * await table.actions.nextAnnotation({ severities: ['error'], wrap: false });
 */
export interface AnnotationNavigationOptions {
  /**
   * The severities to go to. Default: the ones the severity filter shows
   * (`table.annotations.setSeverityFilter`), so that the keys skip what the
   * table does not paint. Each must be `'error'`, `'warning'` or `'info'`;
   * an empty list goes nowhere.
   */
  severities?: AnnotationSeverity[] | undefined;
  /**
   * Go round to the first annotation after the last one (the last before
   * the first, going back). Default: `true`. With `false`, the search stops
   * at the end of the view and resolves `null`.
   */
  wrap?: boolean | undefined;
  /**
   * Aborts the search: the promise rejects with a `QueryError` coded
   * `QUERY_ABORTED`, and a query it was running is cancelled in the DuckDB
   * worker.
   */
  signal?: AbortSignal | undefined;
}

/**
 * Where `actions.nextAnnotation` or `actions.previousAnnotation` put the
 * cursor.
 *
 * @example
 * const landed = await table.actions.nextAnnotation();
 * if (landed) console.log(`row ${landed.row + 1}, ${landed.column}`, landed.annotations);
 */
export interface AnnotationNavigationResult {
  /** The row's `__rowid__`. */
  rowId: number;
  /** The row's 0-based position in the view, as filtered and sorted. */
  row: number;
  /**
   * The column the cursor is on: the annotated cell's, or, for a row whose
   * annotations are its own or in hidden columns, the column the cursor was
   * on before.
   */
  column: string;
  /** Whether the search went round the end of the view to get there. */
  wrapped: boolean;
  /**
   * The annotations there, of the severities the search was for: the row's
   * own, and the cell's (the hidden cell's, when the row's annotations are
   * in hidden columns), sorted as `getByCell` sorts them.
   */
  annotations: Annotation[];
}

/**
 * Options for `actions.revealRow`.
 *
 * @example
 * // Scroll the row to the top of the view, and leave the cursor where it is.
 * await table.actions.revealRow(1204, undefined, { align: 'start', focus: false });
 */
export interface RevealRowOptions {
  /** Where in the view the row goes. Default: `'center'`. */
  align?: 'start' | 'center' | 'end' | undefined;
  /**
   * Put the cursor on the row too, closing the annotation popover and the
   * value inspector, which belong to the cell it leaves. Default: `true`.
   * With `false`, the cursor and those stay as they are.
   */
  focus?: boolean | undefined;
  /**
   * Aborts the reveal: the promise rejects with a `QueryError` coded
   * `QUERY_ABORTED`, and a query it was running is cancelled in the DuckDB
   * worker.
   */
  signal?: AbortSignal | undefined;
}

/**
 * Where `actions.revealRow` showed a row.
 *
 * @example
 * const shown = await table.actions.revealRow(1204, 'age');
 * if (shown === null) console.log('The filters hide that row');
 */
export interface RevealRowResult {
  /** The row's 0-based position in the view, as filtered and sorted. */
  row: number;
  /** The column brought into view, where the cursor is when it moved. */
  column: string;
}

/**
 * What `StateActions` hands `nextAnnotation`, `previousAnnotation` and
 * `revealRow` to. `TableContainer` provides it, loading the navigator's
 * chunk on first use.
 *
 * @internal
 */
export interface AnnotationNavigation {
  next(options?: AnnotationNavigationOptions): Promise<AnnotationNavigationResult | null>;
  previous(options?: AnnotationNavigationOptions): Promise<AnnotationNavigationResult | null>;
  reveal(
    rowId: number | bigint,
    column?: string,
    options?: RevealRowOptions,
  ): Promise<RevealRowResult | null>;
}
