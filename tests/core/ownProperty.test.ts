import { describe, expect, it } from 'vitest';

import { setOwnProperty } from '@/core/ownProperty';

describe('setOwnProperty', () => {
  it('keeps a __proto__ key as an own value, leaving the prototype alone', () => {
    const row: Record<string, unknown> = {};
    setOwnProperty(row, '__proto__', { x: 1 });
    expect(Object.hasOwn(row, '__proto__')).toBe(true);
    expect(row['__proto__']).toEqual({ x: 1 });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(JSON.stringify(row)).toBe('{"__proto__":{"x":1}}');
  });

  it('defines a key over any inherited setter instead of calling it', () => {
    let called = false;
    Object.defineProperty(Object.prototype, 'zzOwnTrap', {
      set() {
        called = true;
      },
      configurable: true,
    });
    try {
      const row: Record<string, unknown> = {};
      setOwnProperty(row, 'zzOwnTrap', 1);
      expect(called).toBe(false);
      expect(Object.hasOwn(row, 'zzOwnTrap')).toBe(true);
      expect(row['zzOwnTrap']).toBe(1);
    } finally {
      delete (Object.prototype as Record<string, unknown>)['zzOwnTrap'];
    }
  });

  it('sets every other key as an enumerable own value, inherited names included', () => {
    const row: Record<string, unknown> = {};
    setOwnProperty(row, 'toString', 'a');
    setOwnProperty(row, 'constructor', null);
    setOwnProperty(row, 'b', 2);
    setOwnProperty(row, 'b', 3);
    expect(Object.entries(row)).toEqual([
      ['toString', 'a'],
      ['constructor', null],
      ['b', 3],
    ]);
  });
});
