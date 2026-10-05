/**
 * Nested values leave the worker as plain data, on real DuckDB results.
 *
 * Arrow returns a LIST or fixed-size ARRAY value as a `Vector`, whose own
 * properties include closures (`isValid`, `get`, `set`, `indexOf`), and a
 * STRUCT or MAP value as a proxy. The worker posts query results with
 * `postMessage`, which structured-clones them: a row still holding a Vector,
 * or a Vector copied field by field, throws `DataCloneError`. In the browser
 * that left every row fetch selecting a list column pending for good.
 *
 * A STRUCT or MAP value is a proxy whose `get` looks a name up on the row
 * object first: read as properties, a field or key named `size` gave a
 * MAP's entry count, `toJSON` and `constructor` functions (DataCloneError),
 * `__proto__` nothing, and `months` with `days` turned the whole value into
 * interval text. A BLOB came through as `{0: …, 1: …}`.
 *
 * Each case runs the worker's own query functions against a real
 * connection and clones the rows as `postMessage` would. Then: a row is
 * converted column by column, never taken for an interval; a BLOB is copied
 * out of the result's buffer; and the values Arrow cannot read inside
 * nested ones (DECIMAL, HUGEINT, INTERVAL) are pinned, beside the
 * `to_json` text that reads them exactly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { __setConnForTests, executeQuery, executeQueryCancellable } from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';

/**
 * Field names that are JavaScript members, SQL keywords, numbers, or need
 * quoting: the nested fixture's `odd_names` STRUCT.
 */
const ODD_NAMES = [
  'label',
  'name',
  'type',
  'data',
  'size',
  'length',
  'toJSON',
  'constructor',
  '__proto__',
  'hasOwnProperty',
  'months',
  'days',
  'nanoseconds',
  'my field',
  'x,y',
  'quote"d',
  "it's",
  '2',
  '1',
  '10',
  'ünï',
  'emoji😀',
  'order',
  'null',
  'SELECT',
  'ID',
];

/** MAP keys that name a member of the row object. */
const ODD_KEYS = ['size', 'toJSON', 'constructor', '__proto__', '2', '1', 'k=v'];

const quoteName = (name: string): string => `"${name.replaceAll('"', '""')}"`;

interface NestedCase {
  label: string;
  /** A SQL expression, selected as column `v`. */
  sql: string;
  /** DuckDB's name for its type, as `DESCRIBE` prints it. */
  type: string;
  expected: unknown;
}

const CASES: NestedCase[] = [
  {
    label: 'INTEGER[] with a NULL',
    sql: '[56, 3, NULL]::INTEGER[]',
    type: 'INTEGER[]',
    expected: [56, 3, null],
  },
  { label: 'empty list', sql: '[]::INTEGER[]', type: 'INTEGER[]', expected: [] },
  { label: 'NULL list', sql: 'NULL::INTEGER[]', type: 'INTEGER[]', expected: null },
  {
    label: 'BIGINT[] becomes numbers',
    sql: '[10000000000, -2]::BIGINT[]',
    type: 'BIGINT[]',
    expected: [10_000_000_000, -2],
  },
  { label: 'VARCHAR[]', sql: "['a', NULL, 'c']", type: 'VARCHAR[]', expected: ['a', null, 'c'] },
  {
    label: 'fixed-size ARRAY',
    sql: '[1, 2, 3]::INTEGER[3]',
    type: 'INTEGER[3]',
    expected: [1, 2, 3],
  },
  { label: 'list of lists', sql: '[[1, 2], [3]]', type: 'INTEGER[][]', expected: [[1, 2], [3]] },
  {
    label: 'STRUCT',
    sql: "{'x': 1.5::DOUBLE, 'y': 0.25::DOUBLE, 'tier': 'bronze'}",
    type: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    expected: { x: 1.5, y: 0.25, tier: 'bronze' },
  },
  {
    label: 'STRUCT[]',
    sql: "[{'k': 1}, {'k': 2}]",
    type: 'STRUCT(k INTEGER)[]',
    expected: [{ k: 1 }, { k: 2 }],
  },
  {
    label: 'list in a STRUCT',
    sql: "{'inner': [1, 2]::BIGINT[]}",
    type: 'STRUCT("inner" BIGINT[])',
    expected: { inner: [1, 2] },
  },
  {
    // A struct is a proxy reading its fields as properties: fields named
    // `type` and `data` must not pass it off as a Vector.
    label: 'STRUCT with fields named type and data',
    sql: "{'type': 'a', 'data': [1, 2]}",
    type: 'STRUCT("type" VARCHAR, "data" INTEGER[])',
    expected: { type: 'a', data: [1, 2] },
  },
  {
    label: 'MAP',
    sql: "MAP {'a': 1, 'b': 2}",
    type: 'MAP(VARCHAR, INTEGER)',
    expected: { a: 1, b: 2 },
  },
  {
    label: 'MAP of lists',
    sql: "MAP {'a': [1, 2], 'b': []::INTEGER[]}",
    type: 'MAP(VARCHAR, INTEGER[])',
    expected: { a: [1, 2], b: [] },
  },
  {
    // Object.fromEntries makes `__proto__` an own property, as the worker must.
    label: 'STRUCT with 26 odd field names',
    sql: `struct_pack(${ODD_NAMES.map((name, i) => `${quoteName(name)} := ${i}`).join(', ')})`,
    type:
      'STRUCT("label" INTEGER, "name" INTEGER, "type" INTEGER, "data" INTEGER, size INTEGER, ' +
      'length INTEGER, toJSON INTEGER, constructor INTEGER, __proto__ INTEGER, ' +
      'hasOwnProperty INTEGER, "months" INTEGER, "days" INTEGER, nanoseconds INTEGER, ' +
      '"my field" INTEGER, "x,y" INTEGER, "quote""d" INTEGER, "it\'s" INTEGER, "2" INTEGER, ' +
      '"1" INTEGER, "10" INTEGER, "ünï" INTEGER, "emoji😀" INTEGER, "order" INTEGER, ' +
      '"null" INTEGER, "SELECT" INTEGER, ID INTEGER)',
    expected: Object.fromEntries(ODD_NAMES.map((name, i) => [name, i])),
  },
  {
    label: 'MAP with keys that name members of the row',
    sql: `MAP {${ODD_KEYS.map((key, i) => `'${key}': ${i}`).join(', ')}}`,
    type: 'MAP(VARCHAR, INTEGER)',
    expected: Object.fromEntries(ODD_KEYS.map((key, i) => [key, i])),
  },
  {
    label: 'STRUCT with months and days fields',
    sql: "{'months': 14, 'days': 3, 'nanoseconds': 5::BIGINT}",
    type: 'STRUCT("months" INTEGER, "days" INTEGER, nanoseconds BIGINT)',
    expected: { months: 14, days: 3, nanoseconds: 5 },
  },
  {
    label: 'STRUCT with a __proto__ field holding a STRUCT',
    sql: "{'__proto__': {'a': 1}, 'b': 2}",
    type: 'STRUCT(__proto__ STRUCT(a INTEGER), b INTEGER)',
    expected: Object.fromEntries([
      ['__proto__', { a: 1 }],
      ['b', 2],
    ]),
  },
  {
    label: 'MAP with a __proto__ key holding a list',
    sql: "MAP {'__proto__': [1, 2], 'a': [3]}",
    type: 'MAP(VARCHAR, INTEGER[])',
    expected: Object.fromEntries([
      ['__proto__', [1, 2]],
      ['a', [3]],
    ]),
  },
  {
    // row() names both fields '': read as properties, the proxy's own keys
    // repeat, which throws.
    label: 'unnamed STRUCT',
    sql: "row(1, 'a')",
    type: 'STRUCT(INTEGER, VARCHAR)',
    expected: [1, 'a'],
  },
  {
    label: 'MAP with INTEGER keys',
    sql: "MAP {2: 'b', 1: 'a'}",
    type: 'MAP(INTEGER, VARCHAR)',
    expected: { '1': 'a', '2': 'b' },
  },
  {
    // A key is written as Arrow returns it: a DATE as epoch milliseconds.
    label: 'MAP with DATE keys',
    sql: "MAP {DATE '2024-01-02': [1, 2]}",
    type: 'MAP(DATE, INTEGER[])',
    expected: { '1704153600000': [1, 2] },
  },
  {
    label: 'BLOB',
    sql: "'\\xAA\\xBB'::BLOB",
    type: 'BLOB',
    expected: new Uint8Array([0xaa, 0xbb]),
  },
  {
    label: 'BLOB[]',
    sql: "['\\xAA\\xBB'::BLOB, ''::BLOB, NULL]",
    type: 'BLOB[]',
    expected: [new Uint8Array([0xaa, 0xbb]), new Uint8Array(0), null],
  },
  {
    // As Arrow returns them: DATE and TIMESTAMP as epoch milliseconds, TIME
    // as microseconds, a BIGINT past 2^53 as the nearest number.
    label: 'STRUCT of typed leaves',
    sql: `{'dt': DATE '2024-01-02', 'ts': TIMESTAMP '2024-01-02 03:04:05.123456',
           'tstz': TIMESTAMPTZ '2024-01-02 03:04:05+00', 't': TIME '03:04:05.5',
           'u': '11fde503-bf17-47ee-b458-3ce648530d3d'::UUID, 'f': 0.5::FLOAT, 'bo': true,
           'bi': 9007199254740993::BIGINT, 'b': '\\x01\\x02'::BLOB}`,
    type:
      'STRUCT(dt DATE, ts TIMESTAMP, tstz TIMESTAMP WITH TIME ZONE, t TIME, u UUID, f FLOAT, ' +
      'bo BOOLEAN, bi BIGINT, b BLOB)',
    expected: {
      dt: 1_704_153_600_000,
      ts: 1_704_164_645_123.456,
      tstz: 1_704_164_645_000,
      t: 11_045_500_000,
      u: '11fde503-bf17-47ee-b458-3ce648530d3d',
      f: 0.5,
      bo: true,
      bi: 9_007_199_254_740_992,
      b: new Uint8Array([1, 2]),
    },
  },
];

const RUNNERS = [
  ['executeQueryCancellable', executeQueryCancellable],
  ['executeQuery', executeQuery],
] as const;

describe('nested values on real DuckDB', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    __setConnForTests(harness.conn);
  }, 30_000);

  afterAll(async () => {
    __setConnForTests(null);
    await harness?.cleanup();
  });

  it('the cases have the types they claim', async () => {
    for (const c of CASES) {
      const [row] = await executeQuery<{ column_type: string }>(`DESCRIBE SELECT ${c.sql} AS v`);
      expect(row?.column_type, c.label).toBe(c.type);
    }
  });

  describe.each(RUNNERS)('%s', (_name, run) => {
    it.each(CASES)('$label comes back as plain data that clones', async ({ sql, expected }) => {
      const rows = await run(`SELECT 7 AS id, ${sql} AS v`);
      expect(rows).toEqual([{ id: 7, v: expected }]);
      expect(structuredClone(rows)).toEqual(rows);
    });

    it('a block of rows with list and struct columns clones whole', async () => {
      // The shape of a grid fetch on a wide table: __rowid__ first, then the
      // columns in view, some of them lists.
      const rows = await run(
        `SELECT range AS "__rowid__",
                list_transform(range(range % 4), x -> CAST(x * 7 AS INTEGER)) AS tags,
                {'x': range / 2, 'tier': 'gold'} AS point
         FROM range(5)`,
      );
      const cloned = structuredClone(rows);
      expect(cloned).toHaveLength(5);
      expect(cloned[3]).toEqual({
        __rowid__: 3,
        tags: [0, 7, 14],
        point: { x: 1.5, tier: 'gold' },
      });
      expect(cloned[0]).toMatchObject({ tags: [] });
    });

    it('a row with numeric months and days columns stays a row', async () => {
      // A row has the shape of an Arrow interval value when it has these
      // columns, and used to be turned into "1 year 2 months 3 days".
      const rows = await run(
        `SELECT 1 AS id, 14 AS months, 3 AS days, CAST(5 AS BIGINT) AS nanoseconds, 'x' AS note`,
      );
      expect(rows).toEqual([{ id: 1, months: 14, days: 3, nanoseconds: 5, note: 'x' }]);
    });

    it('a BLOB comes out of the result in a buffer of its own', async () => {
      // Arrow's BLOB value is a view into the buffer of the whole batch,
      // here 200 kB of padding, which posting the view would copy.
      const rows = await run<{ b: Uint8Array; bl: Uint8Array[] }>(
        `SELECT range AS id, repeat('x', 1000) AS pad, '\\xAA\\xBB'::BLOB AS b,
                ['\\x01'::BLOB] AS bl
         FROM range(200)`,
      );
      expect(rows).toHaveLength(200);
      for (const { b, bl } of structuredClone(rows)) {
        expect(Array.from(b)).toEqual([0xaa, 0xbb]);
        expect(b.buffer.byteLength).toBe(2);
        expect(bl[0]!.buffer.byteLength).toBe(1);
      }
    });

    describe('values Arrow cannot read inside nested ones', () => {
      // Documented on WorkerBridge.query and convertBigInts. The shapes are
      // pinned loosely: the numbers read are not stable from run to run.
      // Should a duckdb-wasm or apache-arrow upgrade make them right, these
      // fail; update the docs then.

      it('a nested DECIMAL or HUGEINT reads as a meaningless number', async () => {
        const [row] = await run<Record<string, unknown>>(
          `SELECT [1.25, 2.50, 3.75]::DECIMAL(10,2)[] AS dl, {'d': 1.25::DECIMAL(10,2)} AS ds,
                  [12::HUGEINT, 170141183460469231731687303715884105727::HUGEINT] AS hl,
                  {'h': 12::HUGEINT} AS hs`,
        );
        expect(structuredClone(row)).toEqual(row);
        const { dl, ds, hl, hs } = row as {
          dl: unknown[];
          ds: { d: unknown };
          hl: unknown[];
          hs: { h: unknown };
        };
        expect(dl).toHaveLength(3);
        expect(dl.every((v) => typeof v === 'number')).toBe(true);
        expect(dl).not.toEqual([1.25, 2.5, 3.75]);
        expect(typeof ds.d).toBe('number');
        expect(ds.d).not.toBe(1.25);
        expect(hl).toHaveLength(2);
        expect(hl.every((v) => typeof v === 'number')).toBe(true);
        expect(hl[0]).not.toBe(12);
        expect(typeof hs.h).toBe('number');
        expect(hs.h).not.toBe(12);
      });

      it('an INTERVAL, nested or not, reads as an Int32Array that does not hold it', async () => {
        const [row] = await run<Record<string, unknown>>(
          `SELECT INTERVAL '14 months 3 days' AS i,
                  [INTERVAL 1 DAY, INTERVAL '14 months 3 days'] AS il,
                  {'i': INTERVAL '14 months 3 days'} AS si`,
        );
        expect(structuredClone(row)).toEqual(row);
        const { i, il, si } = row as { i: unknown; il: unknown[]; si: { i: unknown } };
        for (const value of [i, ...il, si.i]) {
          expect(value).toBeInstanceOf(Int32Array);
          expect(value).toHaveLength(2);
        }
      });

      it('CAST(to_json(c) AS VARCHAR) reads them exactly', async () => {
        const rows = await run(
          `SELECT CAST(to_json([1.25, 2.50, 3.75]::DECIMAL(10,2)[]) AS VARCHAR) AS dl,
                  CAST(to_json({'d': 1.25::DECIMAL(10,2)}) AS VARCHAR) AS ds,
                  CAST(to_json([12::HUGEINT, 170141183460469231731687303715884105727::HUGEINT])
                       AS VARCHAR) AS hl,
                  CAST(to_json([INTERVAL 1 DAY, INTERVAL '14 months 3 days']) AS VARCHAR) AS il`,
        );
        expect(rows).toEqual([
          {
            dl: '[1.25,2.5,3.75]',
            ds: '{"d":1.25}',
            hl: '[12,170141183460469231731687303715884105727]',
            il: '["1 day","1 year 2 months 3 days"]',
          },
        ]);
      });
    });
  });
});
