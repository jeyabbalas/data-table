/**
 * Filters a session restore or a preset load brings back, made to run on the
 * table they come back to.
 *
 * A saved filter can lack a `valueType` this version needs, or carry one its
 * column cannot take. Each backfill goes in {@link normalizeRestoredFilters},
 * which every restore path calls, so none is applied in one path only.
 */

import type { ColumnSchema, Filter } from '../core/types';
import { jsonFiltersAsText } from './jsonFilters';
import { timeOfDayRanges } from './timeFilters';

/**
 * `filters`, as a session restore (its filters, and its undo and redo
 * entries) and `loadFilterPreset` apply them to a table of `schema`:
 *
 * - a point, set or not-set filter on a JSON column with no `valueType`
 *   compares the column's text ({@link jsonFiltersAsText});
 * - a range filter on a TIME WITH TIME ZONE column whose bounds are times of
 *   day without an offset compares the time of day, and a range's
 *   `valueType: 'time'` on a column that is not TIME or TIME WITH TIME ZONE
 *   goes ({@link timeOfDayRanges}).
 *
 * Returns `filters` itself when nothing changed.
 */
export function normalizeRestoredFilters(
  filters: Filter[],
  schema: readonly ColumnSchema[],
): Filter[] {
  return timeOfDayRanges(jsonFiltersAsText(filters, schema), schema);
}
