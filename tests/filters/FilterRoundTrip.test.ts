/**
 * Phase 5 — filter serialize / deserialize round-trip.
 *
 * Locks the library's persistence contract for every filter type. The
 * SessionStore path round-trips via structured-clone (IndexedDB) which
 * preserves Date / Infinity / BigInt; the FilterPresetManager export-to-JSON
 * path additionally goes through JSON.stringify, where Infinity collapses
 * to null. Both behaviours are verified explicitly so any future change
 * surfaces here as a test diff rather than as a silent semantics shift.
 */
import { describe, it, expect } from 'vitest';
import { serializeFilter, deserializeFilter } from '@/persistence/SessionStore';
import type { Filter } from '@/filters/FilterTypes';

function roundTrip(filter: Filter): Filter | null {
  return deserializeFilter(serializeFilter(filter));
}

function jsonRoundTrip(filter: Filter): Filter | null {
  // Mirrors FilterPresetManager.exportToJSON → importFromJSON: serialize first,
  // stringify, parse, then deserialize back into a live Filter.
  const serialized = serializeFilter(filter);
  const parsed = JSON.parse(JSON.stringify(serialized));
  return deserializeFilter(parsed);
}

describe('Filter round-trip via structured-clone-equivalent path', () => {
  it('range with numeric bounds', () => {
    const filter: Filter = { type: 'range', column: 'price', min: 10, max: 100 };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('range with maxInclusive flag', () => {
    const filter: Filter = {
      type: 'range',
      column: 'price',
      min: 10,
      max: 100,
      maxInclusive: true,
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('range with Date min/max preserves instant identity', () => {
    const min = new Date('2024-01-01T00:00:00.000Z');
    const max = new Date('2025-01-01T00:00:00.000Z');
    const filter: Filter = { type: 'range', column: 'created_at', min, max };
    const round = roundTrip(filter) as Filter & { type: 'range' };
    expect(round.min).toBeInstanceOf(Date);
    expect(round.max).toBeInstanceOf(Date);
    expect((round.min as Date).getTime()).toBe(min.getTime());
    expect((round.max as Date).getTime()).toBe(max.getTime());
  });

  it('range with Infinity / -Infinity bounds preserves the sentinel', () => {
    const filter: Filter = { type: 'range', column: 'x', min: -Infinity, max: Infinity };
    const round = roundTrip(filter) as Filter & { type: 'range' };
    expect(round.min).toBe(-Infinity);
    expect(round.max).toBe(Infinity);
  });

  it('range with interval value-type', () => {
    const filter: Filter = {
      type: 'range',
      column: 'duration',
      min: '01:00:00',
      max: '02:00:00',
      valueType: 'interval',
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('point with string value', () => {
    const filter: Filter = { type: 'point', column: 'sku', value: 'A-42' };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('point with Date value preserves instant identity', () => {
    const value = new Date('2024-06-01T12:00:00.000Z');
    const filter: Filter = { type: 'point', column: 'created_at', value };
    const round = roundTrip(filter) as Filter & { type: 'point' };
    expect(round.value).toBeInstanceOf(Date);
    expect((round.value as Date).getTime()).toBe(value.getTime());
  });

  it('point with null value', () => {
    const filter: Filter = { type: 'point', column: 'x', value: null };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('point with boolean value', () => {
    const filter: Filter = { type: 'point', column: 'active', value: true };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('set with mixed-type values + includeNull', () => {
    const filter: Filter = {
      type: 'set',
      column: 'tag',
      values: ['plain', 42, true, null],
      includeNull: true,
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('not-set with mixed-type values', () => {
    const filter: Filter = {
      type: 'not-set',
      column: 'status',
      values: ['archived', 0],
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('null filter', () => {
    const filter: Filter = { type: 'null', column: 'deleted_at' };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('not-null filter', () => {
    const filter: Filter = { type: 'not-null', column: 'name' };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('pattern filter with regex special chars in pattern field', () => {
    const filter: Filter = {
      type: 'pattern',
      column: 'name',
      pattern: "(.+)+'\\d{3}\\W$",
      mode: 'regex',
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('pattern filter — every mode', () => {
    for (const mode of ['contains', 'starts', 'ends', 'regex'] as const) {
      const filter: Filter = { type: 'pattern', column: 'name', pattern: 'abc', mode };
      expect(roundTrip(filter)).toEqual(filter);
    }
  });

  it('raw-sql with label', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_a__',
      sql: 'age > 30',
      id: 'a',
      label: 'Adults',
    };
    expect(roundTrip(filter)).toEqual(filter);
  });

  it('raw-sql with undefined label', () => {
    const filter: Filter = {
      type: 'raw-sql',
      column: '__raw_sql_b__',
      sql: 'age > 30',
      id: 'b',
    };
    expect(roundTrip(filter)).toEqual(filter);
  });
});

describe('Filter round-trip via FilterPresetManager JSON path', () => {
  // These tests cover the JSON export/import contract. Crucially, JSON does
  // not preserve Infinity, NaN, or BigInt — Infinity → null on stringify.
  // This is a known limitation of the export-to-JSON path; the structured-clone
  // path above keeps the sentinel intact.

  it('range with Date min/max round-trips via JSON', () => {
    const min = new Date('2024-01-01T00:00:00.000Z');
    const max = new Date('2025-01-01T00:00:00.000Z');
    const filter: Filter = { type: 'range', column: 'created_at', min, max };
    const round = jsonRoundTrip(filter) as Filter & { type: 'range' };
    expect(round.min).toBeInstanceOf(Date);
    expect((round.min as Date).getTime()).toBe(min.getTime());
    expect((round.max as Date).getTime()).toBe(max.getTime());
  });

  it('range with Infinity bound collapses to null on JSON export', () => {
    // Documents the existing JSON limitation. The structured-clone path above
    // preserves the sentinel; the JSON path drops it. Phase 7 may revisit this.
    const filter: Filter = { type: 'range', column: 'x', min: -Infinity, max: 100 };
    const round = jsonRoundTrip(filter) as Filter & { type: 'range' };
    expect(round.min).toBeNull();
    expect(round.max).toBe(100);
  });

  it('every non-Infinity, non-bigint filter type round-trips through JSON unchanged', () => {
    const cases: Filter[] = [
      { type: 'range', column: 'price', min: 10, max: 100, maxInclusive: true },
      { type: 'point', column: 'sku', value: 'A-42' },
      { type: 'point', column: 'x', value: null },
      { type: 'set', column: 'tag', values: ['plain', 42, true, null], includeNull: true },
      { type: 'not-set', column: 'status', values: ['archived'] },
      { type: 'null', column: 'deleted_at' },
      { type: 'not-null', column: 'name' },
      { type: 'pattern', column: 'name', pattern: 'smith', mode: 'contains' },
      {
        type: 'raw-sql',
        column: '__raw_sql_a__',
        sql: 'age > 30',
        id: 'a',
        label: 'Adults',
      },
    ];
    for (const filter of cases) {
      expect(jsonRoundTrip(filter)).toEqual(filter);
    }
  });
});

describe('deserializeFilter — unknown type', () => {
  it('returns null and does not throw', () => {
    const fake = { type: 'unknown-type', column: 'x' } as unknown;
    expect(deserializeFilter(fake as never)).toBeNull();
  });
});
