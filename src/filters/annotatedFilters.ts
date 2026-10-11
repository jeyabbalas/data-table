/**
 * The `annotated` filter, which keeps the rows that have annotations.
 *
 * It reads the DuckDB table that holds its base table's annotated rows,
 * each with the bits of its annotations' severities (see
 * `annotatedRowsSource.ts`), named from the filter's `table`. A filter
 * restored from a saved session or loaded from a preset may name the table
 * it was saved on, which {@link annotatedFiltersFor} points at the table it
 * comes back to.
 */

import { ALL_SEVERITIES_MASK, SEVERITY_BIT } from '../annotations/severity';
import type { AnnotationSeverity } from '../annotations/types';
import type { AnnotatedFilter, Filter } from './FilterTypes';

/**
 * The column key of every annotated filter. It names no column, so adding
 * a filter on a column never replaces it.
 *
 * @internal
 */
export const ANNOTATED_FILTER_COLUMN = '__annotated__';

/**
 * Whether `value` is a severity's name.
 *
 * @internal
 */
export function isAnnotationSeverity(value: unknown): value is AnnotationSeverity {
  return value === 'error' || value === 'warning' || value === 'info';
}

/**
 * The severity bits of the annotations that keep a row: every severity's
 * when the filter names none. A name that is not a severity's adds no bit,
 * so a filter that names only such names keeps no row.
 *
 * @internal
 */
export function annotatedFilterMask(filter: AnnotatedFilter): number {
  const { severities } = filter;
  if (!Array.isArray(severities) || severities.length === 0) return ALL_SEVERITIES_MASK;
  let mask = 0;
  for (const severity of severities) {
    if (isAnnotationSeverity(severity)) mask |= SEVERITY_BIT[severity];
  }
  return mask;
}

/**
 * `filters`, with each annotated filter made to read the annotated rows of
 * `baseTable`: what filters restored from a saved session (its filters, and
 * its undo and redo entries) or loaded from a preset need, as they name the
 * table they were saved on, or none. Every other filter is kept as it is.
 * Returns `filters` itself when nothing changed.
 *
 * @example
 * ```ts
 * annotatedFiltersFor([{ type: 'annotated', column: '__annotated__', table: 'old' }], 'orders');
 * // [{ type: 'annotated', column: '__annotated__', table: 'orders' }]
 * ```
 *
 * @internal
 */
export function annotatedFiltersFor(filters: Filter[], baseTable: string): Filter[] {
  let changed = false;
  const result = filters.map((filter): Filter => {
    if (filter.type !== 'annotated') return filter;
    if (filter.table === baseTable && filter.column === ANNOTATED_FILTER_COLUMN) return filter;
    changed = true;
    return { ...filter, column: ANNOTATED_FILTER_COLUMN, table: baseTable };
  });
  return changed ? result : filters;
}
