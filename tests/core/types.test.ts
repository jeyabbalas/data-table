import { describe, it, expect } from 'vitest';
import type { DataType, ColumnSchema, FilterType, Filter } from '@/core/types';

describe('Core Types', () => {
  it('should allow valid DataType values', () => {
    const types: DataType[] = [
      'integer',
      'float',
      'decimal',
      'string',
      'boolean',
      'uuid',
      'date',
      'timestamp',
      'time',
      'interval',
    ];
    expect(types).toHaveLength(10);
  });

  it('should allow valid ColumnSchema', () => {
    const schema: ColumnSchema = {
      name: 'test_column',
      type: 'integer',
      nullable: false,
      originalType: 'INTEGER',
    };
    expect(schema.name).toBe('test_column');
    expect(schema.type).toBe('integer');
    expect(schema.nullable).toBe(false);
    expect(schema.originalType).toBe('INTEGER');
  });

  it('should allow valid FilterType values', () => {
    const filterTypes: FilterType[] = [
      'range',
      'point',
      'set',
      'not-set',
      'null',
      'not-null',
      'pattern',
    ];
    expect(filterTypes).toHaveLength(7);
  });

  it('should allow valid Filter', () => {
    const filter: Filter = {
      column: 'age',
      type: 'range',
      min: 18,
      max: 65,
    };
    expect(filter.column).toBe('age');
    expect(filter.type).toBe('range');
  });
});
