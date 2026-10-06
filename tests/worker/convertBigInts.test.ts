import { describe, it, expect } from 'vitest';
import { convertBatch, convertBigInts, type ResultBatch } from '@/worker/duckdb';

const kEntries = Symbol('entries');

const hasEntry = (row: FakeRow, key: PropertyKey): boolean =>
  row[kEntries].some(([name]) => String(name) === key);

/** Arrow's row proxy handler, reduced to what a read goes through. */
const rowHandler: ProxyHandler<FakeRow> = {
  get(row, key) {
    // Arrow's order: the row object, prototype chain included, then the fields.
    if (Reflect.has(row, key)) return Reflect.get(row, key);
    return row[kEntries].find(([name]) => String(name) === key)?.[1];
  },
  has: (row, key) => hasEntry(row, key),
  ownKeys: (row) => row[kEntries].map(([name]) => String(name)),
  getOwnPropertyDescriptor: (row, key) =>
    hasEntry(row, key) ? { writable: true, enumerable: true, configurable: true } : undefined,
};

/**
 * A stand-in for Arrow's STRUCT and MAP values (apache-arrow 17's
 * `StructRow` and `MapRow`): a proxy tagged `Row` whose `get` looks a name
 * up on the row object first, so a field named `size`, `toJSON`,
 * `constructor` or `__proto__` reads as the row's own member, and whose
 * prototype iterates the `[name, value]` entries. `toJSON()` assigns the
 * entries to a plain object, as Arrow's does.
 */
abstract class FakeRow {
  [kEntries]: [unknown, unknown][];

  constructor(entries: [unknown, unknown][]) {
    this[kEntries] = entries;
    return new Proxy(this, rowHandler);
  }

  [Symbol.iterator](): Iterator<[unknown, unknown]> {
    return this[kEntries][Symbol.iterator]();
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {};
    for (const [name, value] of this[kEntries]) json[String(name)] = value;
    return json;
  }

  toArray(): unknown[] {
    return Object.values(this.toJSON());
  }
}
Object.defineProperty(FakeRow.prototype, Symbol.toStringTag, { value: 'Row' });

class FakeStructRow extends FakeRow {}
// Arrow keeps a STRUCT row's index on StructRow.prototype; MapRow has none.
Object.defineProperty(FakeStructRow.prototype, Symbol.for('rowIndex'), {
  value: -1,
  writable: true,
});

class FakeMapRow extends FakeRow {
  get size(): number {
    return this[kEntries].length;
  }
}

/** `convertBigInts`, checking that the result clones as `postMessage` clones it. */
function convertAndClone(value: unknown): unknown {
  const converted = convertBigInts(value);
  expect(structuredClone(converted)).toEqual(converted);
  return converted;
}

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

  describe('interval-shaped objects in nested values', () => {
    // Arrow never returns an interval object inside a list, a STRUCT or a
    // MAP: there `months` and `days` are data.
    it('leaves one inside a list alone', () => {
      expect(convertAndClone([{ months: 14, days: 3, nanoseconds: 0n }])).toEqual([
        { months: 14, days: 3, nanoseconds: 0 },
      ]);
    });

    it('leaves one inside a STRUCT or MAP value alone', () => {
      const span = { months: 1n, days: 2n };
      expect(convertAndClone(new FakeStructRow([['span', span]]))).toEqual({
        span: { months: 1, days: 2 },
      });
      expect(convertAndClone(new FakeMapRow([['k', span]]))).toEqual({
        k: { months: 1, days: 2 },
      });
    });
  });

  describe('Arrow rows: STRUCT and MAP values', () => {
    // Field names that trip a read through properties: members of the row
    // object, which the proxy's `get` answers instead of the data, and the
    // names of a Vector's and an interval's own properties.
    const ODD_NAMES = [
      'size',
      'length',
      'toJSON',
      'toArray',
      'constructor',
      '__proto__',
      'hasOwnProperty',
      'type',
      'data',
      'months',
      'days',
      'nanoseconds',
    ];

    it('reads every field of a STRUCT, whatever its name', () => {
      const row = new FakeStructRow(ODD_NAMES.map((name, i) => [name, BigInt(i)]));
      // Read through the proxy, these fields are a function, a class, the
      // prototype and, together, an interval.
      expect(typeof (row as unknown as Record<string, unknown>)['toJSON']).toBe('function');

      const converted = convertAndClone(row) as Record<string, unknown>;
      // Object.fromEntries defines `__proto__` as an own property.
      expect(converted).toEqual(Object.fromEntries(ODD_NAMES.map((name, i) => [name, i])));
      expect(Object.hasOwn(converted, '__proto__')).toBe(true);
      expect(Object.getPrototypeOf(converted)).toBe(Object.prototype);
    });

    it('reads every key of a MAP, size included', () => {
      const keys = ['size', 'toJSON', 'constructor', '__proto__', '2', '1', 'k=v'];
      const map = new FakeMapRow(keys.map((key, i) => [key, i]));
      // A MapRow answers `size` with its entry count.
      expect((map as unknown as { size: number }).size).toBe(7);

      expect(convertAndClone(map)).toEqual(Object.fromEntries(keys.map((key, i) => [key, i])));
    });

    it('writes MAP keys as strings', () => {
      const map = new FakeMapRow([
        [1, 'a'],
        [10n, 'b'],
        [1.5, 'c'],
      ]);
      expect(convertAndClone(map)).toEqual({ '1': 'a', '10': 'b', '1.5': 'c' });
    });

    it('keeps a STRUCT with months and days fields a record', () => {
      const row = new FakeStructRow([
        ['months', 14],
        ['days', 3],
        ['nanoseconds', 0n],
      ]);
      expect(convertAndClone(row)).toEqual({ months: 14, days: 3, nanoseconds: 0 });
    });

    it('keeps a __proto__ field that holds a STRUCT a field', () => {
      // Arrow's toJSON() would make the inner row the prototype, and its
      // proxy would then refuse the assignment of `b`.
      const row = new FakeStructRow([
        ['__proto__', new FakeStructRow([['a', 1n]])],
        ['b', 2],
      ]);
      const converted = convertAndClone(row) as Record<string, unknown>;
      expect(converted).toEqual(
        Object.fromEntries([
          ['__proto__', { a: 1 }],
          ['b', 2],
        ]),
      );
      expect(Object.getPrototypeOf(converted)).toBe(Object.prototype);
    });

    it('turns an unnamed STRUCT into an array of its fields', () => {
      // row(1, 'a') names both fields '': the proxy's own keys repeat, and
      // as an object one field would overwrite the other.
      const row = new FakeStructRow([
        ['', 1n],
        ['', 'a'],
      ]);
      expect(() => Object.keys(row)).toThrow(TypeError);
      expect(convertAndClone(row)).toEqual([1, 'a']);
    });

    it("keeps a MAP whose only key is '' an object", () => {
      expect(convertAndClone(new FakeMapRow([['', 1]]))).toEqual({ '': 1 });
    });

    it('converts what rows and lists hold, at any depth', () => {
      const row = new FakeStructRow([
        ['id', 9_007_199_254_740_991n],
        [
          'people',
          [
            new FakeStructRow([
              ['name', 'Ann'],
              ['langs', ['en', null]],
            ]),
            null,
          ],
        ],
        ['attrs', new FakeMapRow([['size', [1n, 2n]]])],
      ]);
      expect(convertAndClone(row)).toEqual({
        id: 9_007_199_254_740_991,
        people: [{ name: 'Ann', langs: ['en', null] }, null],
        attrs: { size: [1, 2] },
      });
    });
  });

  describe('typed arrays', () => {
    it('keeps a Uint8Array, in a buffer of its own', () => {
      // Arrow returns a BLOB value as a view into its batch's whole buffer.
      const view = new Uint8Array(4096).fill(7).subarray(10, 12);
      const converted = convertAndClone(view) as Uint8Array;
      expect(converted).toBeInstanceOf(Uint8Array);
      expect(Array.from(converted)).toEqual([7, 7]);
      expect(converted.buffer.byteLength).toBe(2);
      expect(structuredClone(converted).buffer.byteLength).toBe(2);
    });

    it('keeps an Int32Array, what Arrow makes of an INTERVAL', () => {
      const converted = convertAndClone(new Int32Array([1, 2]));
      expect(converted).toBeInstanceOf(Int32Array);
      expect(Array.from(converted as Int32Array)).toEqual([1, 2]);
    });

    it('keeps typed arrays inside lists and rows', () => {
      const blob = new Uint8Array([0xaa, 0xbb]);
      const converted = convertAndClone([
        blob,
        new FakeStructRow([['b', blob]]),
        new FakeMapRow([['k', blob]]),
      ]) as [Uint8Array, { b: Uint8Array }, { k: Uint8Array }];
      expect(converted[0]).toBeInstanceOf(Uint8Array);
      expect(converted[1].b).toBeInstanceOf(Uint8Array);
      expect(converted[2].k).toBeInstanceOf(Uint8Array);
      expect(Array.from(converted[1].b)).toEqual([0xaa, 0xbb]);
    });
  });
});

/**
 * A stand-in for an Arrow `RecordBatch`, as `convertBatch` reads one: the
 * columns' names, and a vector for each holding its values, row by row.
 */
function fakeBatch(columns: [string, unknown[]][]): ResultBatch {
  return {
    numRows: columns[0]?.[1].length ?? 0,
    schema: { fields: columns.map(([name]) => ({ name })) },
    getChildAt: (index) => {
      const values = columns[index]?.[1];
      return values ? { get: (row) => values[row] } : null;
    },
  };
}

describe('convertBatch', () => {
  it('converts each column value of each row', () => {
    const duration = { months: 0, days: 0, nanoseconds: 7_200_000_000_000n };
    expect(
      convertBatch(
        fakeBatch([
          ['id', [1n, 2n]],
          ['name', ['test', null]],
          ['duration', [duration, null]],
        ]),
      ),
    ).toEqual([
      { id: 1, name: 'test', duration: '02:00:00' },
      { id: 2, name: null, duration: null },
    ]);
  });

  it('appends to the rows it is given', () => {
    const rows = [{ id: 0 }];
    expect(convertBatch(fakeBatch([['id', [1n]]]), rows)).toBe(rows);
    expect(rows).toEqual([{ id: 0 }, { id: 1 }]);
  });

  it('keeps a row with numeric months and days columns a row', () => {
    // convertBigInts would take the row itself for an interval value.
    const row = { id: 1n, months: 14, days: 3, nanoseconds: 0n };
    expect(convertBigInts(row)).toBe('1 year 2 months 3 days');
    expect(
      convertBatch(
        fakeBatch([
          ['id', [1n]],
          ['months', [14]],
          ['days', [3]],
          ['nanoseconds', [0n]],
        ]),
      ),
    ).toEqual([{ id: 1, months: 14, days: 3, nanoseconds: 0 }]);
    expect(
      convertBatch(
        fakeBatch([
          ['months', [2n]],
          ['days', [5n]],
        ]),
      ),
    ).toEqual([{ months: 2, days: 5 }]);
  });

  it('keeps a STRUCT column with months and days fields a record', () => {
    const span = new FakeStructRow([
      ['months', 14],
      ['days', 3],
    ]);
    const converted = convertBatch(
      fakeBatch([
        ['id', [1n]],
        ['span', [span]],
      ]),
    );
    expect(converted).toEqual([{ id: 1, span: { months: 14, days: 3 } }]);
    expect(structuredClone(converted)).toEqual(converted);
  });

  it('keeps a __proto__ column a column', () => {
    const [converted] = convertBatch(
      fakeBatch([
        ['__proto__', [5n]],
        ['b', [2]],
      ]),
    );
    expect(converted).toEqual(
      Object.fromEntries([
        ['__proto__', 5],
        ['b', 2],
      ]),
    );
    expect(Object.getPrototypeOf(converted)).toBe(Object.prototype);
  });

  it('keeps the later of two columns with one name, where the first stood', () => {
    // As Arrow's row.toJSON() did, which the rows were read with before.
    const [converted] = convertBatch(
      fakeBatch([
        ['a', [1]],
        ['b', ['x']],
        ['a', [3]],
      ]),
    );
    expect(Object.entries(converted!)).toEqual([
      ['a', 3],
      ['b', 'x'],
    ]);
  });

  it('reads no rows from an empty batch', () => {
    expect(convertBatch(fakeBatch([['id', []]]))).toEqual([]);
  });
});
