/**
 * Dates and timestamps leave the worker as numbers, on real DuckDB results:
 * epoch milliseconds, as Arrow reads them, and DuckDB's `infinity` and
 * `-infinity` as `Infinity` and `-Infinity`.
 *
 * Arrow's getter turns a timestamp's int64 into milliseconds through a check
 * that throws `… is not safe to convert to a number` past ±2^53: for
 * `infinity`, which DuckDB stores as the largest int64 in the column's unit,
 * and for years near 294247 and 290309 BC. `convertBatch` read every value
 * of a result through it, so one such value failed the whole result: a
 * block of the grid's rows, a `getCellValue`. Arrow read a DATE `infinity`
 * (the largest int32, in days) as 185542587100800000, and a TIMESTAMP_NS
 * `infinity` as a time in 2262.
 *
 * Each case runs through the worker's own query functions and through
 * `makeNodeBridge` (`conn.query`), all of which convert with `convertBatch`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  __setConnForTests,
  convertBatch,
  executeQuery,
  executeQueryCancellable,
  type ResultBatch,
} from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  __setConnForTests(harness.conn);
  // UTC, so that TIMESTAMPTZ literals and casts read as written.
  await harness.conn.query(`SET TimeZone = 'UTC'`);
}, 30_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

type Run = <T = Record<string, unknown>>(sql: string) => Promise<T[]>;

const RUNNERS: [string, () => Run][] = [
  ['executeQueryCancellable', () => executeQueryCancellable],
  ['executeQuery', () => executeQuery],
  ['makeNodeBridge', () => (sql) => makeNodeBridge(harness.conn).query(sql)],
];

interface TypeCase {
  type: string;
  /** Literals, each selected as `CAST(… AS type)`, and the number each reads as. */
  values: [literal: string, expected: number | null][];
}

/**
 * Per type: the infinities, NULL, the epoch, a time with every digit the
 * type keeps, one before 1970 with a fraction of a millisecond, and the
 * type's last and first values. Past ±2^53 ms the number is the nearest
 * one, as a BIGINT past 2^53 is: TIMESTAMP's last value, 9223372036854775.806
 * ms, reads 9223372036854776.
 */
const TYPES: TypeCase[] = [
  {
    type: 'TIMESTAMP',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01'", 0],
      ["'2024-01-02 03:04:05.123456'", 1_704_164_645_123.456],
      ["'1969-12-31 23:59:59.9985'", -1.5],
      ["'294247-01-10 04:00:54.775806'", 9_223_372_036_854_776],
      ["'290309-12-22 (BC) 00:00:00'", -9_223_372_022_400_000],
    ],
  },
  {
    type: 'TIMESTAMP_S',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01'", 0],
      ["'2024-01-02 03:04:05'", 1_704_164_645_000],
      ["'1969-12-31 23:59:59'", -1_000],
      ["'294247-01-10 04:00:54'", 9_223_372_036_854_000],
      ["'290309-12-22 (BC) 00:00:00'", -9_223_372_022_400_000],
    ],
  },
  {
    type: 'TIMESTAMP_MS',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01'", 0],
      ["'2024-01-02 03:04:05.123'", 1_704_164_645_123],
      ["'1969-12-31 23:59:59.998'", -2],
      ["'294247-01-10 04:00:54.775'", 9_223_372_036_854_776],
      ["'290309-12-22 (BC) 00:00:00'", -9_223_372_022_400_000],
    ],
  },
  {
    type: 'TIMESTAMP_NS',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01'", 0],
      ["'2024-01-02 03:04:05.123456789'", 1_704_164_645_123.4568],
      ["'1969-12-31 23:59:59.9985'", -1.5],
      ["'2262-04-11 23:47:16.854775806'", 9_223_372_036_854.775],
      ["'1677-09-22'", -9_223_286_400_000],
    ],
  },
  {
    type: 'TIMESTAMPTZ',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01 00:00:00+00'", 0],
      ["'2024-01-02 03:04:05.123456+00'", 1_704_164_645_123.456],
      ["'1969-12-31 23:59:59.9985+00'", -1.5],
      ["'294247-01-10 04:00:54.775806+00'", 9_223_372_036_854_776],
      ["'290309-12-22 (BC) 00:00:00+00'", -9_223_372_022_400_000],
    ],
  },
  {
    type: 'DATE',
    values: [
      ["'infinity'", Infinity],
      ["'-infinity'", -Infinity],
      ['NULL', null],
      ["'1970-01-01'", 0],
      ["'2024-01-02'", 1_704_153_600_000],
      ["'1969-12-31'", -86_400_000],
      ["'5881580-07-10'", 185_542_587_014_400_000],
      ["'5877642-06-25 (BC)'", -185_542_587_014_400_000],
    ],
  },
];

/** `values` selected as a column `c` of `type`, one row each, in order. */
function valuesSQL(type: string, values: TypeCase['values']): string {
  const rows = values.map(([literal], i) => `(${i}, CAST(${literal} AS ${type}))`);
  return `SELECT i, c FROM (VALUES ${rows.join(', ')}) AS v(i, c) ORDER BY i`;
}

describe.each(RUNNERS)('dates and timestamps through %s', (_name, runner) => {
  it.each(TYPES)('$type: the infinities, NULL and the extremes', async ({ type, values }) => {
    const rows = await runner()<{ c: unknown }>(valuesSQL(type, values));
    expect(rows.map((row) => row.c)).toEqual(values.map(([, expected]) => expected));
  });

  it('a block of rows holding infinite values loads whole, every column read', async () => {
    // The shape of a grid fetch: __rowid__, then the columns in view.
    const rows = await runner()<Record<string, unknown>>(
      `SELECT range AS "__rowid__", 'r' || range AS name,
              CASE range % 3 WHEN 0 THEN TIMESTAMP 'infinity' WHEN 1 THEN TIMESTAMP '-infinity'
                   ELSE make_timestamp(range * 1000) END AS ts,
              CASE WHEN range % 2 = 0 THEN TIMESTAMPTZ '-infinity' END AS tz,
              CASE WHEN range % 5 = 0 THEN DATE 'infinity' ELSE DATE '1970-01-01' + range::INTEGER END AS d,
              CASE WHEN range % 7 = 0 THEN 'infinity'::TIMESTAMP_NS END AS ns
       FROM range(3000)`,
    );
    expect(rows).toHaveLength(3000);
    expect(rows.slice(0, 3)).toEqual([
      { __rowid__: 0, name: 'r0', ts: Infinity, tz: -Infinity, d: Infinity, ns: Infinity },
      { __rowid__: 1, name: 'r1', ts: -Infinity, tz: null, d: 86_400_000, ns: null },
      { __rowid__: 2, name: 'r2', ts: 2, tz: -Infinity, d: 172_800_000, ns: null },
    ]);
    // Past the first batch (DuckDB sends 2,048 rows a batch).
    expect(rows[2999]).toEqual({
      __rowid__: 2999,
      name: 'r2999',
      ts: 2999,
      tz: null,
      d: 2999 * 86_400_000,
      ns: null,
    });
    expect(structuredClone(rows)).toEqual(rows);
  });

  it('a LIST or ARRAY of dates or timestamps holds the infinities too', async () => {
    const rows = await runner()<Record<string, unknown>>(
      `SELECT [TIMESTAMP 'infinity', NULL, TIMESTAMP '2024-01-02 03:04:05.123456'] AS ts,
              [DATE 'infinity', DATE '-infinity', DATE '1970-01-02'] AS d,
              ['infinity'::TIMESTAMP_NS, '1969-12-31 23:59:59.9985'::TIMESTAMP_NS] AS ns,
              array_value(TIMESTAMPTZ '-infinity', TIMESTAMPTZ 'epoch') AS a,
              []::TIMESTAMP[] AS empty, NULL::DATE[] AS none`,
    );
    expect(rows).toEqual([
      {
        ts: [Infinity, null, 1_704_164_645_123.456],
        d: [Infinity, -Infinity, 86_400_000],
        ns: [Infinity, -1.5],
        a: [-Infinity, 0],
        empty: [],
        none: null,
      },
    ]);
  });

  it('each row’s list reads its own items', async () => {
    // A list value is a slice of the column's items: the second row's
    // starts at item 1, the third's at item 4.
    const rows = await runner()<{ l: unknown }>(
      `SELECT CASE WHEN range = 0 THEN [TIMESTAMP 'epoch']
                   ELSE [NULL, TIMESTAMP 'infinity', make_timestamp(range * 1000)] END AS l
       FROM range(3)`,
    );
    expect(rows.map((row) => row.l)).toEqual([[0], [null, Infinity, 1], [null, Infinity, 2]]);
  });
});

/** A small xorshift generator: the same sample on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** A value between `lo` and `hi`, its magnitude spread over every bit length. */
function sampleBetween(random: () => number, lo: bigint, hi: bigint): bigint {
  const bits = (hi > -lo ? hi : -lo).toString(2).length;
  let value = 0n;
  for (let bit = Math.floor(random() * bits); bit >= 0; bit -= 1) {
    value = (value << 1n) | (random() < 0.5 ? 1n : 0n);
  }
  if (random() < 0.5) value = -value;
  return value < lo ? lo : value > hi ? hi : value;
}

interface VectorLike {
  get(index: number): unknown;
}

describe('the numbers Arrow read before are read the same', () => {
  const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  // Each type's stored integers, from DuckDB's first value to its last, and
  // how to make one of that type from them.
  const RANGES = [
    {
      type: 'TIMESTAMP',
      unit: 1000n,
      lo: -9_223_372_022_400_000_000n,
      hi: 9_223_372_036_854_775_806n,
      sql: 'make_timestamp(n)',
    },
    {
      type: 'TIMESTAMPTZ',
      unit: 1000n,
      lo: -9_223_372_022_400_000_000n,
      hi: 9_223_372_036_854_775_806n,
      // Through text: ICU's cast overflows on the last value.
      sql: "CAST(CAST(make_timestamp(n) AS VARCHAR) || '+00' AS TIMESTAMPTZ)",
    },
    {
      type: 'TIMESTAMP_S',
      unit: 1n,
      lo: -9_223_372_022_400n,
      hi: 9_223_372_036_854n,
      sql: 'make_timestamp(n * 1000000)::TIMESTAMP_S',
    },
    {
      type: 'TIMESTAMP_MS',
      unit: 1n,
      lo: -9_223_372_022_400_000n,
      hi: 9_223_372_036_854_775n,
      sql: 'make_timestamp(n * 1000)::TIMESTAMP_MS',
    },
    {
      type: 'TIMESTAMP_NS',
      unit: 1_000_000n,
      lo: -9_223_286_400_000_000_000n,
      hi: 9_223_372_036_854_775_806n,
      sql: 'make_timestamp_ns(n)',
    },
    {
      type: 'DATE',
      unit: 1n,
      lo: -2_147_483_646n,
      hi: 2_147_483_646n,
      sql: "DATE '1970-01-01' + n::INTEGER",
    },
  ];

  it.each(RANGES)(
    '$type: every value Arrow converts, as Arrow converts it',
    async ({ unit, lo, hi, sql }) => {
      const random = seeded(20_241_007);
      // Edges: the epoch, a millisecond either side and its fractions, and
      // the ±2^53 ms at which Arrow's check starts to throw.
      const values = [0n, 1n, -1n, 999n, -999n, 1000n, -1000n, 1500n, -1500n, lo, hi];
      for (const ms of [SAFE - 1n, SAFE, SAFE + 1n]) {
        for (const rest of [0n, 1n, unit - 1n]) {
          values.push(ms * unit + rest, -ms * unit - rest);
        }
      }
      for (let i = 0; i < 5000; i += 1) values.push(sampleBetween(random, lo, hi));
      const inRange = values.filter((v) => v >= lo && v <= hi);

      await harness.conn.query('CREATE OR REPLACE TABLE sample (i INTEGER, n BIGINT)');
      await harness.conn.query(
        `INSERT INTO sample VALUES ${inRange.map((v, i) => `(${i}, ${v})`).join(', ')}, (-1, NULL)`,
      );
      const result = await harness.conn.query(`SELECT i, ${sql} AS c FROM sample ORDER BY i`);

      let compared = 0;
      let unconverted = 0;
      for (const batch of result.batches) {
        const vector = batch.getChildAt(1) as unknown as VectorLike;
        const rows = convertBatch(batch as unknown as ResultBatch);
        rows.forEach((row, index) => {
          let arrows: unknown;
          try {
            arrows = vector.get(index);
          } catch (error) {
            // Past ±2^53 ms: the number nearest Arrow's arithmetic, where it threw.
            expect(String(error)).toMatch(/is not safe to convert to a number/);
            expect(Number.isFinite(row.c)).toBe(true);
            unconverted += 1;
            return;
          }
          // Object.is: the very number, -0 and the last bit included.
          if (!Object.is(row.c, arrows)) expect(row.c).toBe(arrows);
          compared += 1;
        });
      }
      expect(compared + unconverted).toBe(inRange.length + 1);
      expect(compared).toBeGreaterThan(inRange.length * 0.9);
    },
    30_000,
  );
});

describe('inside a STRUCT, MAP or UNION, Arrow still reads them', () => {
  // Documented on WorkerBridge.query: Arrow reads these values as the row
  // is iterated, before `convertBatch` sees them. Should an apache-arrow
  // upgrade read them, these fail; update the docs then.

  it('a TIMESTAMP infinity there fails the read', async () => {
    for (const sql of [
      `SELECT {'at': TIMESTAMP 'infinity'} AS v`,
      `SELECT MAP {'k': TIMESTAMP '-infinity'} AS v`,
      `SELECT union_value(t := TIMESTAMPTZ 'infinity') AS v`,
    ]) {
      await expect(executeQueryCancellable(sql), sql).rejects.toThrow(
        /is not safe to convert to a number/,
      );
    }
  });

  it('a DATE infinity there reads as Arrow’s number', async () => {
    expect(await executeQueryCancellable(`SELECT {'d': DATE 'infinity'} AS v`)).toEqual([
      { v: { d: 185_542_587_100_800_000 } },
    ]);
  });
});
