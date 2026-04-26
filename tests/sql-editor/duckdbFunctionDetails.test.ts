import { describe, it, expect } from 'vitest';
import {
  DUCKDB_FUNCTION_DETAILS,
  type DuckDBFunctionCategory,
} from '@/sql-editor/duckdbFunctionDetails';
import { DUCKDB_FUNCTIONS } from '@/sql-editor/duckdbFunctions';

const VALID_CATEGORIES: ReadonlySet<DuckDBFunctionCategory> = new Set([
  'aggregate',
  'numeric',
  'string',
  'date/time',
  'casting',
  'conditional',
  'list',
  'struct',
  'window',
  'utility',
]);

describe('DUCKDB_FUNCTION_DETAILS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DUCKDB_FUNCTION_DETAILS)).toBe(true);
    expect(DUCKDB_FUNCTION_DETAILS.length).toBeGreaterThan(0);
  });

  it('has well-formed entries', () => {
    for (const f of DUCKDB_FUNCTION_DETAILS) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.name).toBe(f.name.toLowerCase());

      expect(VALID_CATEGORIES.has(f.category)).toBe(true);

      expect(typeof f.description).toBe('string');
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it('has unique function names', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const f of DUCKDB_FUNCTION_DETAILS) {
      if (seen.has(f.name)) duplicates.push(f.name);
      seen.add(f.name);
    }
    expect(duplicates).toEqual([]);
  });

  it('covers every declared category at least once', () => {
    const present = new Set(DUCKDB_FUNCTION_DETAILS.map((f) => f.category));
    for (const c of VALID_CATEGORIES) {
      expect(present.has(c)).toBe(true);
    }
  });

  it('is frozen at the array and entry level', () => {
    expect(Object.isFrozen(DUCKDB_FUNCTION_DETAILS)).toBe(true);
    expect(Object.isFrozen(DUCKDB_FUNCTION_DETAILS[0])).toBe(true);
    expect(Object.isFrozen(DUCKDB_FUNCTION_DETAILS[DUCKDB_FUNCTION_DETAILS.length - 1])).toBe(true);
  });

  it('contains common DuckDB functions across major categories', () => {
    const sample: Array<[string, DuckDBFunctionCategory]> = [
      ['avg', 'aggregate'],
      ['count', 'aggregate'],
      ['round', 'numeric'],
      ['upper', 'string'],
      ['date_trunc', 'date/time'],
      ['cast', 'casting'],
      ['coalesce', 'conditional'],
      ['list_contains', 'list'],
      ['struct_extract', 'struct'],
      ['row_number', 'window'],
      ['uuid', 'utility'],
    ];
    const byName = new Map(DUCKDB_FUNCTION_DETAILS.map((f) => [f.name, f]));
    for (const [name, expectedCategory] of sample) {
      const entry = byName.get(name);
      expect(entry, `expected ${name} to be present`).toBeDefined();
      expect(entry!.category).toBe(expectedCategory);
    }
  });
});

describe('DUCKDB_FUNCTIONS parity guard', () => {
  it('mirrors DUCKDB_FUNCTION_DETAILS in length', () => {
    expect(DUCKDB_FUNCTIONS.length).toBe(DUCKDB_FUNCTION_DETAILS.length);
  });

  it('contains exactly the names from DUCKDB_FUNCTION_DETAILS in the same order', () => {
    expect([...DUCKDB_FUNCTIONS]).toEqual(DUCKDB_FUNCTION_DETAILS.map((f) => f.name));
  });
});
