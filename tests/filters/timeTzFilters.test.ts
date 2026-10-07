/**
 * timeTzRangesAsTime: the `valueType: 'time'` a range filter on a TIME WITH
 * TIME ZONE column needs to compare the time of day its chart shows, given to
 * the filters a session or preset restores without it.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema, Filter } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { timeTzRangesAsTime } from '@/filters/timeTzFilters';

function column(name: string, originalType: string): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const SCHEMA: ColumnSchema[] = [
  column('pickup', 'TIME WITH TIME ZONE'),
  column('start', 'TIME'),
  column('at', 'TIME_NS'),
  column('ts', 'TIMESTAMP WITH TIME ZONE'),
  column('wait', 'INTERVAL'),
];

describe('timeTzRangesAsTime', () => {
  it('compares range filters on a TIME WITH TIME ZONE column by time of day', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00' },
      { type: 'range', column: 'pickup', min: '22:00', max: Infinity },
    ];
    expect(timeTzRangesAsTime(filters, SCHEMA)).toEqual([
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00', valueType: 'time' },
      { type: 'range', column: 'pickup', min: '22:00', max: Infinity, valueType: 'time' },
    ]);
    // The filters given are not changed.
    expect(filters[0]).toEqual({
      type: 'range',
      column: 'pickup',
      min: '01:30:00',
      max: '06:00:00',
    });
  });

  it('keeps every other filter as it is, and returns the same array when none changed', () => {
    const filters: Filter[] = [
      // A TIME or TIME_NS column is its time of day already, and a cast
      // would round a TIME_NS.
      { type: 'range', column: 'start', min: '01:30', max: '06:00' },
      { type: 'range', column: 'at', min: '01:30', max: '06:00' },
      { type: 'range', column: 'ts', min: '2024-01-01', max: '2024-02-01' },
      { type: 'range', column: 'wait', min: '1 day', max: '2 days', valueType: 'interval' },
      { type: 'range', column: 'pickup', min: '01:30', max: '06:00', valueType: 'time' },
      { type: 'point', column: 'pickup', value: '01:30:00+05:30' },
      { type: 'null', column: 'pickup' },
      { type: 'raw-sql', column: '__raw_sql_1__', sql: 'pickup IS NOT NULL', id: '1' },
      { type: 'range', column: 'gone', min: '01:30', max: '06:00' },
    ];
    expect(timeTzRangesAsTime(filters, SCHEMA)).toBe(filters);
    expect(timeTzRangesAsTime([], SCHEMA)).toEqual([]);
  });

  it('keeps a filter on a column the schema does not name', () => {
    const filters: Filter[] = [{ type: 'range', column: 'pickup', min: '01:30', max: '06:00' }];
    expect(timeTzRangesAsTime(filters, [])).toBe(filters);
  });
});
