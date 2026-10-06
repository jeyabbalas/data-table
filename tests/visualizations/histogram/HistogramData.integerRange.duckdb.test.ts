/**
 * Numeric histogram binning across each integer and DECIMAL type's range,
 * against real DuckDB-WASM (issue #172).
 *
 * `buildHistogramSQL` subtracts the column's minimum from each value. DuckDB
 * binds an integer literal to the other operand's type when it fits, so
 * before the value was cast to DOUBLE a SMALLINT column spanning more than
 * 32,767 failed with `Overflow in subtraction of INT16`, as every integer
 * width did past its maximum. A DECIMAL(18,3) spanning its precision
 * overflowed too, and a DECIMAL(38,18) near 1e20 failed to cast its minimum.
 * Past 2^53 the DOUBLE minimum can round above the true one: that threw on
 * UBIGINT and dropped the row on BIGINT.
 *
 * Every case has more than `DISCRETE_BIN_THRESHOLD` distinct values, so it
 * takes the continuous path, and asserts that the bin counts add up to the
 * column's non-null count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RangeFilter } from '@/filters/FilterTypes';
import { fetchHistogramBins, fetchHistogramData } from '@/visualizations/histogram/HistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

/** `[label, SELECT producing one column v]`. */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['TINYINT −100..100', 'SELECT range::TINYINT AS v FROM range(-100, 101)'],
  [
    'SMALLINT −28775..29539, with NULLs',
    `SELECT CASE WHEN range % 1000 = 0 THEN NULL ELSE range::SMALLINT END AS v
     FROM range(-28775, 29540)`,
  ],
  ['INTEGER −2e9..2e9', 'SELECT (-2000000000 + range * 40000000)::INTEGER AS v FROM range(0, 101)'],
  [
    'INTEGER, its whole range',
    `SELECT CAST(v AS INTEGER) AS v
     FROM (VALUES ('-2147483648'), ('0'), ('1'), ('2'), ('3'), ('2147483647')) AS s(v)`,
  ],
  [
    'BIGINT −9e18..9e18',
    `SELECT CAST(-9000000000000000000::HUGEINT + range::HUGEINT * 180000000000000000::HUGEINT AS BIGINT) AS v
     FROM range(0, 101)`,
  ],
  [
    'BIGINT, its whole range',
    `SELECT CAST(v AS BIGINT) AS v
     FROM (VALUES ('-9223372036854775808'), ('0'), ('1'), ('2'), ('3'), ('9223372036854775807')) AS s(v)`,
  ],
  [
    'BIGINT past 2^53, minimum rounding up',
    'SELECT (9007199254740995 + range)::BIGINT AS v FROM range(0, 1000)',
  ],
  ['UTINYINT, its whole range', 'SELECT range::UTINYINT AS v FROM range(0, 256)'],
  ['USMALLINT, its whole range', 'SELECT range::USMALLINT AS v FROM range(0, 65536, 7)'],
  ['UINTEGER, its whole range', 'SELECT (range * 42949672)::UINTEGER AS v FROM range(0, 101)'],
  [
    'UBIGINT, its whole range',
    `SELECT CAST(v AS UBIGINT) AS v
     FROM (VALUES ('0'), ('1'), ('2'), ('3'), ('4'), ('18446744073709551615')) AS s(v)`,
  ],
  [
    'UBIGINT past 2^53, minimum rounding up',
    'SELECT (9007199254740995 + range)::UBIGINT AS v FROM range(0, 1000)',
  ],
  [
    'HUGEINT, its whole range',
    `SELECT CAST(v AS HUGEINT) AS v
     FROM (VALUES ('-170141183460469231731687303715884105728'), ('0'), ('1'), ('2'), ('3'),
                  ('170141183460469231731687303715884105727')) AS s(v)`,
  ],
  [
    'UHUGEINT, its whole range',
    `SELECT CAST(v AS UHUGEINT) AS v
     FROM (VALUES ('0'), ('1'), ('2'), ('3'), ('4'), ('340282366920938463463374607431768211455')) AS s(v)`,
  ],
  [
    'DECIMAL(4,1), its whole range',
    'SELECT CAST(range / 10 AS DECIMAL(4,1)) AS v FROM range(-9999, 10000, 37)',
  ],
  [
    'DECIMAL(18,3), its whole range',
    'SELECT CAST((range - 50) * 19999999999999.998 AS DECIMAL(18,3)) AS v FROM range(0, 101)',
  ],
  [
    'DECIMAL(38,18) ±1e20',
    'SELECT CAST((range - 50) * 1999999999999999999.98 AS DECIMAL(38,18)) AS v FROM range(0, 101)',
  ],
  [
    'DECIMAL(38,0) ±9.9e37',
    `SELECT CAST((range - 50)::HUGEINT * CAST('1980000000000000000000000000000000000' AS HUGEINT) AS DECIMAL(38,0)) AS v
     FROM range(0, 101)`,
  ],
];

describe('numeric histogram — integer and DECIMAL ranges (issue #172)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (): string => `viz_int_range_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  const nonNullCount = async (t: string): Promise<number> => {
    const [row] = await bridge.query<{ n: number }>(`SELECT COUNT(v) AS n FROM "${t}"`);
    return Number(row!.n);
  };

  it.each(CASES)('%s: bins every non-null value', async (_label, select) => {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${select}`);

    const data = await fetchHistogramData(t, 'v', 'auto', [], bridge);

    expect(data.isDiscrete).toBe(false);
    expect(Number.isFinite(data.min)).toBe(true);
    expect(Number.isFinite(data.max)).toBe(true);
    const binned = data.bins.reduce((sum, bin) => sum + bin.count, 0);
    expect(binned).toBe(await nonNullCount(t));
  });

  it('crossfilter-aligned bins on a SMALLINT past 32,767, under a range filter', async () => {
    const t = tableName();
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT range::SMALLINT AS v FROM range(-28775, 29540)`,
    );
    const filter: RangeFilter = { type: 'range', column: 'v', min: -20000, max: 20000 };

    const bins = await fetchHistogramBins(t, 'v', -28775, 29539, 15, [filter], bridge);

    expect(bins).toHaveLength(15);
    // -20000 ≤ v < 20000
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(40000);
    // The bins outside the filter stay empty; the edges are the unfiltered ones.
    expect(bins[0]!.x0).toBe(-28775);
    expect(bins[0]!.count).toBe(0);
    expect(bins[14]!.x1).toBe(29539);
    expect(bins[14]!.count).toBe(0);
  });
});
