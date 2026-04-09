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
});
