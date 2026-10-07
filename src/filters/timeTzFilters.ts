/**
 * Range filters on TIME WITH TIME ZONE columns, as saved sessions and presets
 * hold them.
 *
 * A TIME WITH TIME ZONE column's chart places each value by its time of day
 * as written, its offset ignored (`01:30:00+05:30` in the 1am bar), and its
 * brush and the filter panel give a range filter on it `valueType: 'time'`,
 * which compares `CAST("t" AS TIME)` the same way. A range filter saved by a
 * version before 0.9, or written by hand, may lack it: compared as TIME WITH
 * TIME ZONE, its bounds take the offset of DuckDB's session time zone and
 * rows compare by instant, so it matched different rows in different time
 * zones, and not the rows the chart's bars now count.
 */

import { isTimeWithTimeZone } from '../core/duckdbType';
import type { ColumnSchema, Filter } from '../core/types';

/**
 * `filters`, with `valueType: 'time'` given to each range filter on a TIME
 * WITH TIME ZONE column (`originalType` `TIME WITH TIME ZONE`) that has no
 * `valueType`: what filters restored from a saved session or loaded from a
 * preset need.
 *
 * Every other filter is kept as it is: a range filter on a TIME or TIME_NS
 * column compares the column itself, which is its time of day already, and
 * a point or set filter on a TIME WITH TIME ZONE column compares a value, as
 * it meant to. A column `schema` does not name is kept as it is too. Returns
 * `filters` itself when nothing changed.
 *
 * @example
 * ```ts
 * const schema = [{ name: 't', type: 'time', nullable: true, originalType: 'TIME WITH TIME ZONE' }];
 * timeTzRangesAsTime([{ type: 'range', column: 't', min: '01:30', max: '06:00' }], schema);
 * // [{ type: 'range', column: 't', min: '01:30', max: '06:00', valueType: 'time' }]
 * ```
 */
export function timeTzRangesAsTime(filters: Filter[], schema: readonly ColumnSchema[]): Filter[] {
  let timeTzColumns: Set<string> | undefined;
  let changed = false;
  const result = filters.map((filter) => {
    if (filter.type !== 'range' || filter.valueType !== undefined) return filter;
    timeTzColumns ??= new Set(
      schema.filter((column) => isTimeWithTimeZone(column.originalType)).map((c) => c.name),
    );
    if (!timeTzColumns.has(filter.column)) return filter;
    changed = true;
    return { ...filter, valueType: 'time' as const };
  });
  return changed ? result : filters;
}
