import { describe, it, expect } from 'vitest';
import { convertBigInts } from '@/worker/duckdb';

describe('convertBigInts', () => {
  it('passes null and undefined through', () => {
    expect(convertBigInts(null)).toBe(null);
    expect(convertBigInts(undefined)).toBe(undefined);
  });

  it('converts bigint to number', () => {
    expect(convertBigInts(42n)).toBe(42);
    expect(convertBigInts(-7n)).toBe(-7);
    expect(convertBigInts(0n)).toBe(0);
  });

  it('passes plain numbers through', () => {
    expect(convertBigInts(3.14)).toBe(3.14);
    expect(convertBigInts(0)).toBe(0);
  });

  it('passes strings through', () => {
    expect(convertBigInts('hello')).toBe('hello');
  });

  it('passes booleans through', () => {
    expect(convertBigInts(true)).toBe(true);
    expect(convertBigInts(false)).toBe(false);
  });

  it('converts bigints inside arrays', () => {
    expect(convertBigInts([1n, 2n, 3n])).toEqual([1, 2, 3]);
  });

  it('converts bigints inside objects', () => {
    expect(convertBigInts({ a: 1n, b: 'hello' })).toEqual({ a: 1, b: 'hello' });
  });

  it('handles nested objects with bigints', () => {
    const row = {
      id: 1n,
      name: 'test',
      nested: { count: 42n, label: 'x' },
    };
    expect(convertBigInts(row)).toEqual({
      id: 1,
      name: 'test',
      nested: { count: 42, label: 'x' },
    });
  });

  // Interval object conversion tests
  describe('interval object detection', () => {
    it('converts Arrow MonthDayNano interval to string (time only)', () => {
      const interval = { months: 0, days: 0, nanoseconds: 3_600_000_000_000n };
      expect(convertBigInts(interval)).toBe('01:00:00');
    });

    it('converts interval with days and time', () => {
      const interval = { months: 0, days: 3, nanoseconds: 14_706_000_000_000n }; // 4h 5m 6s
      expect(convertBigInts(interval)).toBe('3 days 04:05:06');
    });

    it('converts interval with months', () => {
      const interval = { months: 14, days: 0, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('1 year 2 months');
    });

    it('converts interval with all components', () => {
      const interval = { months: 14, days: 3, nanoseconds: 14_706_000_000_000n };
      expect(convertBigInts(interval)).toBe('1 year 2 months 3 days 04:05:06');
    });

    it('converts zero interval', () => {
      const interval = { months: 0, days: 0, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('00:00:00');
    });

    it('converts interval with micros field (DuckDB internal format)', () => {
      const interval = { months: 0, days: 1, micros: 3_600_000_000 };
      expect(convertBigInts(interval)).toBe('1 day 01:00:00');
    });

    it('converts interval inside a row object', () => {
      const row = {
        id: 1n,
        name: 'test',
        duration: { months: 0, days: 0, nanoseconds: 7_200_000_000_000n },
      };
      expect(convertBigInts(row)).toEqual({
        id: 1,
        name: 'test',
        duration: '02:00:00',
      });
    });

    it('converts interval with BigInt months/days fields', () => {
      const interval = { months: 0n, days: 1n, nanoseconds: 3_600_000_000_000n };
      expect(convertBigInts(interval)).toBe('1 day 01:00:00');
    });

    it('converts interval with all BigInt fields', () => {
      const interval = { months: 14n, days: 3n, nanoseconds: 14_706_000_000_000n };
      expect(convertBigInts(interval)).toBe('1 year 2 months 3 days 04:05:06');
    });

    it('converts zero interval with BigInt fields', () => {
      const interval = { months: 0n, days: 0n, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('00:00:00');
    });
  });

  describe('negative interval objects', () => {
    it('converts negative months', () => {
      const interval = { months: -1, days: 0, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('-1 month');
    });

    it('converts negative months decomposed into years', () => {
      const interval = { months: -14, days: 0, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('-1 year -2 months');
    });

    it('converts exactly negative one year', () => {
      const interval = { months: -12, days: 0, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('-1 year');
    });

    it('converts negative days', () => {
      const interval = { months: 0, days: -5, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('-5 days');
    });

    it('converts all-negative components', () => {
      const interval = { months: -14, days: -3, nanoseconds: -14_706_000_000_000n };
      expect(convertBigInts(interval)).toBe('-1 year -2 months -3 days -04:05:06');
    });

    it('converts mixed-sign components (positive months, negative days)', () => {
      const interval = { months: 14, days: -3, nanoseconds: 0n };
      expect(convertBigInts(interval)).toBe('1 year 2 months -3 days');
    });

    it('converts negative time only', () => {
      const interval = { months: 0, days: 0, nanoseconds: -3_600_000_000_000n };
      expect(convertBigInts(interval)).toBe('-01:00:00');
    });
  });
});
