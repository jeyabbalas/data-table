/**
 * timeOfDayRanges: a range filter's `valueType: 'time'` made to fit its
 * column, for the filters a session or preset restores. A TIME WITH TIME
 * ZONE range written as the panel and the brush write one gets it; a range
 * whose bounds name instants keeps comparing instants; a column the cast
 * does not fit loses it.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema, Filter } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { timeOfDayRanges } from '@/filters/timeFilters';

function column(name: string, originalType: string): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const SCHEMA: ColumnSchema[] = [
  column('pickup', 'TIME WITH TIME ZONE'),
  column('start', 'TIME'),
  column('at', 'TIME_NS'),
  column('ts', 'TIMESTAMP WITH TIME ZONE'),
  column('day', 'DATE'),
  column('n', 'INTEGER'),
  column('wait', 'INTERVAL'),
];

describe('timeOfDayRanges', () => {
  it('compares a TIME WITH TIME ZONE range by time of day when its bounds have no offset', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00' },
      { type: 'range', column: 'pickup', min: '22:00', max: Infinity },
      { type: 'range', column: 'pickup', min: -Infinity, max: '9:15', maxInclusive: true },
      { type: 'range', column: 'pickup', min: '23:00:00', max: '24:00:00', maxInclusive: true },
      { type: 'range', column: 'pickup', min: '12:30:00.5', max: '12:30:01.25' },
    ];
    expect(timeOfDayRanges(filters, SCHEMA)).toEqual(
      filters.map((filter) => ({ ...filter, valueType: 'time' })),
    );
    // The filters given are not changed.
    expect(filters[0]).toEqual({
      type: 'range',
      column: 'pickup',
      min: '01:30:00',
      max: '06:00:00',
    });
  });

  it('keeps a TIME WITH TIME ZONE range whose bounds name instants comparing instants', () => {
    // Dropping the offset would change which rows these match.
    const filters: Filter[] = [
      { type: 'range', column: 'pickup', min: '20:00:00+00', max: '23:00:00+00' },
      { type: 'range', column: 'pickup', min: '01:30:00+05:30', max: Infinity },
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00-08' },
      { type: 'range', column: 'pickup', min: '01:30:00Z', max: '06:00:00Z' },
      { type: 'range', column: 'pickup', min: '01:30:00 +05:30', max: '06:00' },
      { type: 'range', column: 'pickup', min: new Date(0), max: '06:00' },
      { type: 'range', column: 'pickup', min: 5400, max: 21600 },
    ];
    expect(timeOfDayRanges(filters, SCHEMA)).toBe(filters);
  });

  it("takes valueType 'time' off a column the cast to TIME does not fit", () => {
    const filters: Filter[] = [
      { type: 'range', column: 'day', min: '2024-01-01', max: '2024-02-01', valueType: 'time' },
      { type: 'range', column: 'n', min: 1, max: 5, valueType: 'time' },
      { type: 'range', column: 'ts', min: '01:00', max: '02:00', valueType: 'time' },
      // The cast rounds a TIME_NS: 23:59:59.9999999 becomes 24:00:00.
      { type: 'range', column: 'at', min: '01:00', max: '02:00', valueType: 'time' },
    ];
    expect(timeOfDayRanges(filters, SCHEMA)).toEqual([
      { type: 'range', column: 'day', min: '2024-01-01', max: '2024-02-01' },
      { type: 'range', column: 'n', min: 1, max: 5 },
      { type: 'range', column: 'ts', min: '01:00', max: '02:00' },
      { type: 'range', column: 'at', min: '01:00', max: '02:00' },
    ]);
    expect(filters[0]).toHaveProperty('valueType', 'time');
  });

  it('keeps every other filter as it is, and returns the same array when none changed', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'pickup', min: '01:30', max: '06:00', valueType: 'time' },
      { type: 'range', column: 'start', min: '01:30', max: '06:00', valueType: 'time' },
      // A TIME or TIME_NS column is its time of day already.
      { type: 'range', column: 'start', min: '01:30', max: '06:00' },
      { type: 'range', column: 'at', min: '01:30', max: '06:00' },
      { type: 'range', column: 'ts', min: '2024-01-01', max: '2024-02-01' },
      { type: 'range', column: 'wait', min: '1 day', max: '2 days', valueType: 'interval' },
      { type: 'point', column: 'pickup', value: '01:30:00+05:30' },
      { type: 'null', column: 'pickup' },
      { type: 'raw-sql', column: '__raw_sql_1__', sql: 'pickup IS NOT NULL', id: '1' },
      // A column the schema does not name (a derived column a session brings
      // back, say) is not known to fit or not.
      { type: 'range', column: 'gone', min: '01:30', max: '06:00' },
      { type: 'range', column: 'gone', min: 1, max: 2, valueType: 'time' },
    ];
    expect(timeOfDayRanges(filters, SCHEMA)).toBe(filters);
    expect(timeOfDayRanges([], SCHEMA)).toEqual([]);
  });

  it('keeps a filter on a column the schema does not name', () => {
    const filters: Filter[] = [{ type: 'range', column: 'pickup', min: '01:30', max: '06:00' }];
    expect(timeOfDayRanges(filters, [])).toBe(filters);
  });
});
