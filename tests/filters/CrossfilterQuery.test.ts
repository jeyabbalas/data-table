import { describe, it, expect } from 'vitest';
import { splitCrossfilterFilters } from '@/filters/CrossfilterQuery';
import type { Filter } from '@/filters/FilterTypes';

describe('splitCrossfilterFilters', () => {
  it('returns empty arrays and false for empty filters', () => {
    const result = splitCrossfilterFilters([], 'price');
    expect(result).toEqual({
      background: [],
      foreground: [],
      hasOwnFilter: false,
    });
  });

  it('returns empty background when no filter targets the column', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'age', min: 18, max: 65 },
      { type: 'set', column: 'color', values: ['red', 'blue'] },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.background).toEqual([]);
    expect(result.foreground).toEqual(filters);
    expect(result.hasOwnFilter).toBe(false);
  });

  it('excludes own column filter from background when column has a filter', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'range', column: 'age', min: 18, max: 65 },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.background).toEqual([
      { type: 'range', column: 'age', min: 18, max: 65 },
    ]);
    expect(result.foreground).toEqual(filters);
    expect(result.hasOwnFilter).toBe(true);
  });

  it('excludes only the target column from background with multiple filters', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'range', column: 'age', min: 18, max: 65 },
      { type: 'set', column: 'color', values: ['red'] },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.background).toHaveLength(2);
    expect(result.background).toEqual([
      { type: 'range', column: 'age', min: 18, max: 65 },
      { type: 'set', column: 'color', values: ['red'] },
    ]);
    expect(result.hasOwnFilter).toBe(true);
  });

  it('excludes all filters for the target column when multiple exist', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 50 },
      { type: 'range', column: 'age', min: 18, max: 65 },
      { type: 'range', column: 'price', min: 60, max: 100 },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.background).toEqual([
      { type: 'range', column: 'age', min: 18, max: 65 },
    ]);
    expect(result.hasOwnFilter).toBe(true);
  });

  it('returns empty background when all filters target the same column', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 50 },
      { type: 'range', column: 'price', min: 60, max: 100 },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.background).toEqual([]);
    expect(result.foreground).toEqual(filters);
    expect(result.hasOwnFilter).toBe(true);
  });

  it('foreground is the exact same array reference', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100 },
      { type: 'range', column: 'age', min: 18, max: 65 },
    ];
    const result = splitCrossfilterFilters(filters, 'price');
    expect(result.foreground).toBe(filters);
  });
});
