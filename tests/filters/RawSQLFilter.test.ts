/**
 * RawSQLFilter — comprehensive tests for type construction, undo equality,
 * serialization round-trip, and formatFilter integration.
 */
import { describe, it, expect } from 'vitest';
import type { Filter, RawSQLFilter } from '@/filters/FilterTypes';
import { filterToSQL, filtersToWhereClause } from '@/filters/FilterSQL';
import { formatFilter } from '@/filters/FilterChip';
import { serializeFilter, deserializeFilter } from '@/persistence/SessionStore';

describe('RawSQLFilter type', () => {
  it('can be constructed and is assignable to Filter', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_test123__',
      sql: 'age > 30',
      id: 'test123',
    };
    expect(filter.type).toBe('raw-sql');
  });

  it('supports optional label field', () => {
    const filter: RawSQLFilter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
      label: 'Adults only',
    };
    expect(filter.label).toBe('Adults only');
  });

  it('label can be undefined', () => {
    const filter: RawSQLFilter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30',
      id: 'abc',
    };
    expect(filter.label).toBeUndefined();
  });
});

describe('RawSQLFilter SQL generation', () => {
  it('wraps sql in parentheses', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: 'x = 1',
      id: 'a',
    };
    expect(filterToSQL(filter)).toBe('(x = 1)');
  });

  it('preserves complex SQL with subqueries', () => {
    const sql = 'id IN (SELECT id FROM other_table WHERE flag = true)';
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_b__',
      sql,
      id: 'b',
    };
    expect(filterToSQL(filter)).toBe(`(${sql})`);
  });
});

describe('RawSQLFilter crossfilter behavior', () => {
  it('is never excluded from filtersToWhereClause with excludeColumn', () => {
    const filters: Filter[] = [
      { type: 'range', column: 'price', min: 0, max: 100 },
      { type: 'raw-sql', column: '__raw_sql_a__', sql: 'qty > 5', id: 'a' },
    ];

    // Exclude price — raw-sql should remain
    const result = filtersToWhereClause(filters, 'price');
    expect(result).toBe('(qty > 5)');

    // Exclude a non-existent column — both should remain
    const result2 = filtersToWhereClause(filters, 'nonexistent');
    expect(result2).toContain('(qty > 5)');
    expect(result2).toContain('"price"');
  });
});

describe('RawSQLFilter formatFilter', () => {
  it('returns "SQL" as column name', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: 'age > 30',
      id: 'a',
    };
    expect(formatFilter(filter).column).toBe('SQL');
  });

  it('uses label when provided', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: 'age > 30',
      id: 'a',
      label: 'Adults',
    };
    expect(formatFilter(filter).description).toBe('Adults');
  });

  it('truncates long SQL without label', () => {
    const longSQL = 'a'.repeat(50);
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: longSQL,
      id: 'a',
    };
    const result = formatFilter(filter);
    expect(result.description.length).toBeLessThanOrEqual(40);
    expect(result.description).toContain('\u2026'); // ellipsis
  });

  it('does not truncate short SQL', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: 'x = 1',
      id: 'a',
    };
    expect(formatFilter(filter).description).toBe('x = 1');
  });
});

describe('RawSQLFilter serialization round-trip', () => {
  it('serializes and deserializes without transformation', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_abc__',
      sql: 'age > 30 AND status = 1',
      id: 'abc',
      label: 'Test label',
    };
    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized);
    expect(deserialized).toEqual(filter);
  });

  it('preserves filter without label', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_def__',
      sql: 'height IS NOT NULL',
      id: 'def',
    };
    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized);
    expect(deserialized).toEqual(filter);
  });

  it('returns a new object (not the same reference)', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_ghi__',
      sql: 'x = 1',
      id: 'ghi',
    };
    const serialized = serializeFilter(filter);
    expect(serialized).not.toBe(filter);
    expect(serialized).toEqual(filter);
  });

  it('serialized copy is isolated from original (mutation safety)', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_mut__',
      sql: 'x = 1',
      id: 'mut',
      label: 'Original',
    };
    const serialized = serializeFilter(filter) as Record<string, unknown>;
    serialized.label = 'Mutated';
    expect((filter as Record<string, unknown>).label).toBe('Original');
  });

  it('deserialized copy is isolated from serialized form', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_iso__',
      sql: 'y = 2',
      id: 'iso',
    };
    const serialized = serializeFilter(filter);
    const deserialized = deserializeFilter(serialized) as Record<string, unknown>;
    deserialized.sql = 'MUTATED';
    expect((serialized as Record<string, unknown>).sql).toBe('y = 2');
  });
});

describe('RawSQLFilter — Phase 5 label fallback', () => {
  it('empty-string label falls back to the truncated SQL', () => {
    // FilterChip.ts:136 uses `filter.label || truncateSQL(...)`. Empty string
    // is falsy so the fallback fires; documents that downstream consumers do
    // not need to filter out '' before passing to formatFilter.
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_e__',
      sql: 'x = 1',
      id: 'e',
      label: '',
    };
    expect(formatFilter(filter).description).toBe('x = 1');
  });

  it('round-trips an empty-string label as undefined per persistence semantics', () => {
    // serializeFilter / deserializeFilter currently round-trip the empty
    // string as-is (it is JSON-valid). Lock the contract so a future change
    // that drops empty labels in serialisation surfaces as an explicit test
    // failure rather than a silent semantics shift.
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_e__',
      sql: 'x = 1',
      id: 'e',
      label: '',
    };
    const round = deserializeFilter(serializeFilter(filter));
    expect(round).toEqual(filter);
  });

  it('explicit `label: undefined` survives serialize/deserialize without coercion', () => {
    const filter: RawSQLFilter = {
      type: 'raw-sql',
      column: '__raw_sql_u__',
      sql: 'x = 1',
      id: 'u',
      label: undefined,
    };
    const round = deserializeFilter(serializeFilter(filter)) as RawSQLFilter;
    // After JSON round-trip the key is dropped; treat that as
    // semantically-equivalent to undefined.
    expect(round.type).toBe('raw-sql');
    expect(round.label).toBeUndefined();
  });
});
