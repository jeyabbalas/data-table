/**
 * Range filters compared by time of day (`valueType: 'time'`), as saved
 * sessions and presets hold them.
 *
 * A TIME WITH TIME ZONE column's chart places each value by its time of day
 * as written, its offset ignored (`01:30:00+05:30` in the 1am bar), and its
 * brush and the filter panel give a range filter on it `valueType: 'time'`,
 * which compares `CAST("t" AS TIME)` the same way. A range filter saved by a
 * version before 0.9, or written by hand, may lack it: compared as TIME WITH
 * TIME ZONE, bounds such as `'01:30:00'` take the offset of DuckDB's session
 * time zone and rows compare by instant, so it matched different rows in
 * different time zones, and not the rows the chart's bars now count.
 *
 * A filter can also carry `valueType: 'time'` onto a column the cast does not
 * fit: a preset saved on another table, or a column whose type changed. On a
 * DATE or INTEGER column, `CAST("d" AS TIME)` is a Conversion Error that
 * fails every query the filter is in.
 */

import { castsToTimeExactly, isTimeWithTimeZone } from '../core/duckdbType';
import type { ColumnSchema, Filter } from '../core/types';
import type { RangeFilter } from './FilterTypes';

/**
 * A time of day as the filter panel and the chart's brush write one, with no
 * offset: `09:30`, `01:30:00`, `24:00:00`, `12:30:00.5`.
 */
const PLAIN_TIME = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** Whether `bound` is open (`±Infinity`) or a time of day with no offset. */
function isPlainTimeBound(bound: RangeFilter['min']): boolean {
  if (typeof bound === 'number') return !Number.isFinite(bound);
  return typeof bound === 'string' && PLAIN_TIME.test(bound);
}

/**
 * `filters`, with each range filter's `valueType: 'time'` made to fit its
 * column in `schema`: what filters restored from a saved session or loaded
 * from a preset need.
 *
 * - A range filter on a TIME WITH TIME ZONE column (`originalType`
 *   `TIME WITH TIME ZONE`) with no `valueType` gets `valueType: 'time'` when
 *   both its bounds are times of day without an offset (`'01:30:00'`, or
 *   open), as the panel and the brush write them. Those compared the
 *   session's local time with each row's instant; by time of day they match
 *   the rows the chart's bars count. A bound with an offset
 *   (`'20:00:00+00'`) or a `Date` named an instant, which dropping the
 *   offset would change, so such a filter is kept as it is.
 * - A range filter with `valueType: 'time'` on a column whose type is not
 *   TIME or TIME WITH TIME ZONE loses it, and compares the column itself:
 *   the cast fails on a DATE or INTEGER, and rounds a TIME_NS.
 *
 * Every other filter is kept as it is, and so is a filter on a column
 * `schema` does not name (a derived column a session brings back, say).
 * Returns `filters` itself when nothing changed.
 *
 * @example
 * ```ts
 * const schema = [{ name: 't', type: 'time', nullable: true, originalType: 'TIME WITH TIME ZONE' }];
 * timeOfDayRanges([{ type: 'range', column: 't', min: '01:30', max: '06:00' }], schema);
 * // [{ type: 'range', column: 't', min: '01:30', max: '06:00', valueType: 'time' }]
 * ```
 */
export function timeOfDayRanges(filters: Filter[], schema: readonly ColumnSchema[]): Filter[] {
  let types: Map<string, string | undefined> | undefined;
  let changed = false;
  const result = filters.map((filter): Filter => {
    if (filter.type !== 'range') return filter;
    if (filter.valueType !== undefined && filter.valueType !== 'time') return filter;
    types ??= new Map(schema.map((column) => [column.name, column.originalType]));
    if (!types.has(filter.column)) return filter;
    const originalType = types.get(filter.column);

    if (filter.valueType === 'time') {
      if (castsToTimeExactly(originalType)) return filter;
      changed = true;
      const byValue: RangeFilter = { ...filter };
      delete byValue.valueType;
      return byValue;
    }
    if (
      !isTimeWithTimeZone(originalType) ||
      !isPlainTimeBound(filter.min) ||
      !isPlainTimeBound(filter.max)
    ) {
      return filter;
    }
    changed = true;
    return { ...filter, valueType: 'time' };
  });
  return changed ? result : filters;
}
