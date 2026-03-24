import { describe, it, expect } from 'vitest';
import type {
  Filter,
  FilterType,
  RangeFilter,
  PointFilter,
  SetFilter,
  NotSetFilter,
  NullFilter,
  PatternFilter,
} from '@/filters/FilterTypes';
import { filtersToWhereClause } from '@/filters/FilterSQL';

describe('FilterTypes', () => {
  it('FilterType should contain all expected string literals', () => {
    const types: FilterType[] = [
      'range',
      'point',
      'set',
      'not-set',
      'null',
      'not-null',
      'pattern',
    ];
    expect(types).toHaveLength(7);
  });

  it('should construct a RangeFilter', () => {
    const f: RangeFilter = { type: 'range', column: 'age', min: 18, max: 65 };
    expect(f.type).toBe('range');
    expect(f.min).toBe(18);
    expect(f.max).toBe(65);
  });

  it('should construct a PointFilter', () => {
    const f: PointFilter = { type: 'point', column: 'status', value: 'active' };
    expect(f.type).toBe('point');
    expect(f.value).toBe('active');
  });

  it('should construct a SetFilter', () => {
    const f: SetFilter = { type: 'set', column: 'category', values: ['A', 'B'] };
    expect(f.type).toBe('set');
    expect(f.values).toEqual(['A', 'B']);
  });

  it('should construct a SetFilter with includeNull', () => {
    const f: SetFilter = { type: 'set', column: 'status', values: ['active'], includeNull: true };
    expect(f.type).toBe('set');
    expect(f.includeNull).toBe(true);
  });

  it('should construct a NotSetFilter', () => {
    const f: NotSetFilter = { type: 'not-set', column: 'category', values: ['X'] };
    expect(f.type).toBe('not-set');
    expect(f.values).toEqual(['X']);
  });

  it('should construct a NotSetFilter with includeNull', () => {
    const f: NotSetFilter = { type: 'not-set', column: 'active', values: [false], includeNull: true };
    expect(f.type).toBe('not-set');
    expect(f.includeNull).toBe(true);
  });

  it('should construct a NullFilter', () => {
    const f: NullFilter = { type: 'null', column: 'notes' };
    expect(f.type).toBe('null');
    expect(f).not.toHaveProperty('value');
  });

  it('should construct a not-null NullFilter', () => {
    const f: NullFilter = { type: 'not-null', column: 'notes' };
    expect(f.type).toBe('not-null');
  });

  it('should construct a PatternFilter', () => {
    const f: PatternFilter = {
      type: 'pattern',
      column: 'name',
      pattern: 'test',
      mode: 'contains',
    };
    expect(f.type).toBe('pattern');
    expect(f.pattern).toBe('test');
    expect(f.mode).toBe('contains');
  });

  it('should narrow types in a switch statement', () => {
    const filter: Filter = { type: 'range', column: 'x', min: 0, max: 10 };
    let result = '';

    switch (filter.type) {
      case 'range':
        result = `${filter.min}-${filter.max}`;
        break;
      case 'point':
        result = `=${filter.value}`;
        break;
      case 'set':
        result = `in(${filter.values.join(',')})`;
        break;
      case 'not-set':
        result = `not in(${filter.values.join(',')})`;
        break;
      case 'null':
      case 'not-null':
        result = filter.type;
        break;
      case 'pattern':
        result = `${filter.mode}:${filter.pattern}`;
        break;
    }

    expect(result).toBe('0-10');
  });
});

describe('FilterSQL integration with discriminated unions', () => {
  it('should generate SQL for RangeFilter', () => {
    const filters: Filter[] = [{ type: 'range', column: 'price', min: 10, max: 100 }];
    expect(filtersToWhereClause(filters)).toBe('("price" >= 10 AND "price" < 100)');
  });

  it('should generate SQL for SetFilter', () => {
    const filters: Filter[] = [{ type: 'set', column: 'cat', values: ['A', 'B'] }];
    expect(filtersToWhereClause(filters)).toBe("\"cat\" IN ('A', 'B')");
  });

  it('should generate SQL for NotSetFilter', () => {
    const filters: Filter[] = [{ type: 'not-set', column: 'cat', values: ['X'] }];
    expect(filtersToWhereClause(filters)).toBe("\"cat\" NOT IN ('X')");
  });

  it('should generate SQL for NullFilter', () => {
    const filters: Filter[] = [{ type: 'null', column: 'notes' }];
    expect(filtersToWhereClause(filters)).toBe('"notes" IS NULL');
  });

  it('should generate SQL for PatternFilter contains', () => {
    const filters: Filter[] = [
      { type: 'pattern', column: 'name', pattern: 'test', mode: 'contains' },
    ];
    expect(filtersToWhereClause(filters)).toBe(`CAST("name" AS VARCHAR) LIKE '%test%' ESCAPE '\\'`);
  });

  it('should generate SQL for PatternFilter regex', () => {
    const filters: Filter[] = [
      { type: 'pattern', column: 'name', pattern: '^abc$', mode: 'regex' },
    ];
    expect(filtersToWhereClause(filters)).toBe("regexp_matches(CAST(\"name\" AS VARCHAR), '^abc$')");
  });
});
