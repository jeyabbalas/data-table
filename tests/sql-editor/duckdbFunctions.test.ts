import { describe, it, expect } from 'vitest';
import { DUCKDB_FUNCTIONS } from '@/sql-editor/duckdbFunctions';

describe('DUCKDB_FUNCTIONS', () => {
  it('should be a non-empty array of strings', () => {
    expect(Array.isArray(DUCKDB_FUNCTIONS)).toBe(true);
    expect(DUCKDB_FUNCTIONS.length).toBeGreaterThan(0);
    for (const fn of DUCKDB_FUNCTIONS) {
      expect(typeof fn).toBe('string');
    }
  });

  it('should have no duplicate entries', () => {
    const unique = new Set(DUCKDB_FUNCTIONS);
    expect(unique.size).toBe(DUCKDB_FUNCTIONS.length);
  });

  it('should contain common DuckDB functions', () => {
    const common = [
      'avg', 'count', 'sum', 'substr', 'cast', 'round',
      'coalesce', 'length', 'upper', 'lower',
    ];
    for (const fn of common) {
      expect(DUCKDB_FUNCTIONS).toContain(fn);
    }
  });
});
