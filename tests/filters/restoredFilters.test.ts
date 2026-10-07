/**
 * normalizeRestoredFilters: every backfill a session restore and a preset
 * load apply, in one pass both paths call.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema, Filter } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { normalizeRestoredFilters } from '@/filters/restoredFilters';

function column(name: string, originalType: string): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const SCHEMA: ColumnSchema[] = [
  column('doc', 'JSON'),
  column('pickup', 'TIME WITH TIME ZONE'),
  column('day', 'DATE'),
  column('tags', 'VARCHAR[]'),
];

describe('normalizeRestoredFilters', () => {
  it('gives each filter the valueType this table needs, and takes off one it cannot take', () => {
    const filters: Filter[] = [
      { type: 'point', column: 'doc', value: 'abc' },
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00' },
      { type: 'range', column: 'pickup', min: '20:00:00+00', max: '23:00:00+00' },
      { type: 'range', column: 'day', min: '2024-01-01', max: '2024-02-01', valueType: 'time' },
      { type: 'point', column: 'tags', value: '[a, b]' },
    ];
    expect(normalizeRestoredFilters(filters, SCHEMA)).toEqual([
      { type: 'point', column: 'doc', value: 'abc', valueType: 'text' },
      { type: 'range', column: 'pickup', min: '01:30:00', max: '06:00:00', valueType: 'time' },
      { type: 'range', column: 'pickup', min: '20:00:00+00', max: '23:00:00+00' },
      { type: 'range', column: 'day', min: '2024-01-01', max: '2024-02-01' },
      { type: 'point', column: 'tags', value: '[a, b]' },
    ]);
  });

  it('returns the same array when nothing changed', () => {
    const filters: Filter[] = [
      { type: 'point', column: 'doc', value: 'abc', valueType: 'text' },
      { type: 'range', column: 'pickup', min: '01:30', max: '06:00', valueType: 'time' },
    ];
    expect(normalizeRestoredFilters(filters, SCHEMA)).toBe(filters);
  });
});
