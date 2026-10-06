/**
 * jsonFiltersAsText: the `valueType: 'text'` an exact filter on a JSON column
 * needs, given to the filters a session or preset restores without it.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema, Filter } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { jsonFiltersAsText } from '@/filters/jsonFilters';

function column(name: string, originalType: string): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const SCHEMA: ColumnSchema[] = [
  column('doc', 'JSON'),
  column('name', 'VARCHAR'),
  column('tags', 'VARCHAR[]'),
  column('docs', 'JSON[]'),
  column('point', 'STRUCT(x DOUBLE)'),
  column('v', 'VARIANT'),
];

describe('jsonFiltersAsText', () => {
  it('compares point, set and not-set filters on a JSON column as text', () => {
    const filters: Filter[] = [
      { type: 'point', column: 'doc', value: 'abc' },
      { type: 'set', column: 'doc', values: ['{"a": 1}', 'x'] },
      { type: 'not-set', column: 'doc', values: ['[]'], includeNull: true },
    ];
    expect(jsonFiltersAsText(filters, SCHEMA)).toEqual([
      { type: 'point', column: 'doc', value: 'abc', valueType: 'text' },
      { type: 'set', column: 'doc', values: ['{"a": 1}', 'x'], valueType: 'text' },
      { type: 'not-set', column: 'doc', values: ['[]'], includeNull: true, valueType: 'text' },
    ]);
    // The filters given are not changed.
    expect(filters[0]).toEqual({ type: 'point', column: 'doc', value: 'abc' });
  });

  it('keeps every other filter as it is, and returns the same array when none changed', () => {
    const filters: Filter[] = [
      // Nested columns compare by value without valueType, as they meant to.
      { type: 'point', column: 'tags', value: '[a, b]' },
      { type: 'set', column: 'docs', values: ['[1]'] },
      { type: 'point', column: 'point', value: "{'x': 1.0}" },
      { type: 'not-set', column: 'v', values: ['1'] },
      { type: 'point', column: 'name', value: 'abc' },
      { type: 'point', column: 'doc', value: 'abc', valueType: 'text' },
      { type: 'null', column: 'doc' },
      { type: 'pattern', column: 'doc', pattern: 'a', mode: 'contains' },
      { type: 'raw-sql', column: '__raw_sql_1__', sql: 'doc IS NOT NULL', id: '1' },
      { type: 'point', column: 'gone', value: 'abc' },
    ];
    expect(jsonFiltersAsText(filters, SCHEMA)).toBe(filters);
    expect(jsonFiltersAsText([], SCHEMA)).toEqual([]);
  });

  it('keeps a filter on a column the schema does not name', () => {
    const filters: Filter[] = [{ type: 'point', column: 'doc', value: 'abc' }];
    expect(jsonFiltersAsText(filters, [])).toBe(filters);
  });
});
