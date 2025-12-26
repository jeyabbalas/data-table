import { describe, it, expect } from 'vitest';
import type { DataType, ColumnSchema, FilterType, Filter, DataTableOptions } from '@/core/types';

describe('Core Types', () => {
  it('should allow valid DataType values', () => {
    const types: DataType[] = [
      'integer',
      'float',
      'decimal',
      'string',
      'boolean',
      'date',
      'timestamp',
      'time',
      'interval',
    ];
    expect(types).toHaveLength(9);
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
    const filterTypes: FilterType[] = ['range', 'point', 'set', 'null', 'not-null', 'pattern'];
    expect(filterTypes).toHaveLength(6);
  });

  it('should allow valid Filter', () => {
    const filter: Filter = {
      column: 'age',
      type: 'range',
      value: { min: 18, max: 65 },
    };
    expect(filter.column).toBe('age');
    expect(filter.type).toBe('range');
  });

  it('should allow valid DataTableOptions', () => {
    const options: DataTableOptions = {
      headless: true,
    };
    expect(options.headless).toBe(true);
    expect(options.container).toBeUndefined();
  });
});
