/**
 * Numeric histograms of columns holding NaN, Infinity and -Infinity, against
 * real DuckDB-WASM (RT-18, bug B).
 *
 * DuckDB sorts NaN above every number, so a column holding one had a
 * maximum of NaN, and one holding Infinity an infinite range.
 * `buildHistogramSQL` printed those into its SQL, where `NaN` reads as a
 * column, and the chart failed with `Binder Error: Referenced column "NaN"
 * not found in FROM clause!`. With finite bounds the bin query still failed,
 * casting `FLOOR((inf - min) / width)` to INTEGER. A column with five
 * distinct values or fewer drew bars for the non-finite ones instead, and
 * clicking one filtered `"v" = NULL`, which matched nothing.
 *
 * The chart now leaves non-finite values out of its bars, its minimum,
 * median and maximum, and its distinct count, and counts them in
 * `nonFiniteCount`; `total` still counts every row. Each case asserts that
 * the chart draws and that its bins add up to the column's finite count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Filter } from '@/core/types';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import {
  fetchColumnStats,
  fetchDiscreteBins,
  fetchHistogramBins,
  fetchHistogramData,
  type HistogramBin,
} from '@/visualizations/histogram/HistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

/** `[label, SELECT producing one column v]`, each with more than five finite values. */
const CASES: ReadonlyArray<readonly [string, string]> = [
  [
    'NaN on every 100th row (the C-02 shape)',
    `SELECT CASE WHEN range % 100 = 0 THEN 'NaN'::DOUBLE ELSE range * 0.5 END AS v
     FROM range(10000)`,
  ],
  [
    'DOUBLE with Infinity, -Infinity, NaN and NULLs',
    `SELECT CASE range % 10
              WHEN 0 THEN NULL
              WHEN 1 THEN 'Infinity'::DOUBLE
              WHEN 2 THEN '-Infinity'::DOUBLE
              WHEN 3 THEN 'NaN'::DOUBLE
              ELSE range / 7 END AS v
     FROM range(1000)`,
  ],
  [
    'FLOAT with NaN and Infinity',
    `SELECT CASE range % 50
              WHEN 0 THEN 'NaN'::FLOAT
              WHEN 1 THEN 'Infinity'::FLOAT
              ELSE CAST(range AS FLOAT) / 4 END AS v
     FROM range(1000)`,
  ],
  [
    'only the maximum is Infinity',
    `SELECT CASE WHEN range = 999 THEN 'Infinity'::DOUBLE ELSE CAST(range AS DOUBLE) END AS v
     FROM range(1000)`,
  ],
  [
    'only the minimum is -Infinity',
    `SELECT CASE WHEN range = 0 THEN '-Infinity'::DOUBLE ELSE CAST(range AS DOUBLE) END AS v
     FROM range(1000)`,
  ],
];

const binned = (bins: HistogramBin[]): number => bins.reduce((sum, bin) => sum + bin.count, 0);

describe('numeric histogram — NaN and ±Infinity (RT-18)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (): string => `viz_non_finite_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  const create = async (select: string): Promise<string> => {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${select}`);
    return t;
  };

  /** What the chart can draw and what it leaves out, counted by DuckDB. */
  const counts = async (
    t: string,
    where = '',
  ): Promise<{ finite: number; nonFinite: number; total: number; min: number; max: number }> => {
    const [row] = await bridge.query<{
      finite: number;
      non_finite: number;
      total: number;
      min: number;
      max: number;
    }>(
      `SELECT COUNT(*) FILTER (WHERE isfinite(v)) AS finite,
              COUNT(v) FILTER (WHERE NOT isfinite(v)) AS non_finite,
              COUNT(*) AS total,
              CAST(MIN(v) FILTER (WHERE isfinite(v)) AS DOUBLE) AS min,
              CAST(MAX(v) FILTER (WHERE isfinite(v)) AS DOUBLE) AS max
       FROM "${t}" ${where ? `WHERE ${where}` : ''}`,
    );
    return {
      finite: Number(row!.finite),
      nonFinite: Number(row!.non_finite),
      total: Number(row!.total),
      min: row!.min,
      max: row!.max,
    };
  };

  it.each(CASES)('%s: bins every finite value, counts the rest', async (_label, select) => {
    const t = await create(select);
    const expected = await counts(t);

    const data = await fetchHistogramData(t, 'v', 15, [], bridge);

    expect(data.isDiscrete).toBe(false);
    expect(data.min).toBe(expected.min);
    expect(data.max).toBe(expected.max);
    expect(data.bins.length).toBeGreaterThan(0);
    expect(binned(data.bins)).toBe(expected.finite);
    expect(data.nonFiniteCount).toBe(expected.nonFinite);
    expect(data.total).toBe(expected.total);
  });

  it('a brush over every bar matches the bars, none of the non-finite rows', async () => {
    const t = await create(CASES[1]![1]);
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    // The filter `Histogram.emitBrushFilter` emits for a brush over every bin.
    const brush: Filter = {
      type: 'range',
      column: 'v',
      min: data.bins[0]!.x0,
      max: data.bins[data.bins.length - 1]!.x1,
      maxInclusive: true,
    };

    const [row] = await bridge.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "${t}" WHERE ${filtersToWhereClause([brush])}`,
    );

    expect(Number(row!.n)).toBe(binned(data.bins));
  });

  it('discrete: a bar for each finite value, none for NaN or ±Infinity', async () => {
    const t = await create(
      `SELECT v FROM (VALUES (1.0::DOUBLE), (1.0), (2.0), (3.0), ('NaN'::DOUBLE),
                             ('Infinity'::DOUBLE), ('-Infinity'::DOUBLE), (NULL)) AS s(v)`,
    );

    const data = await fetchHistogramData(t, 'v', 15, [], bridge);

    expect(data.isDiscrete).toBe(true);
    expect(data.bins).toEqual([
      { x0: 1, x1: 1, count: 2 },
      { x0: 2, x1: 2, count: 1 },
      { x0: 3, x1: 3, count: 1 },
    ]);
    expect(data.min).toBe(1);
    expect(data.max).toBe(3);
    expect(data.median).toBeGreaterThanOrEqual(1);
    expect(data.median).toBeLessThanOrEqual(3);
    expect(data.distinctCount).toBe(3);
    expect(data.nonFiniteCount).toBe(3);
    expect(data.nullCount).toBe(1);
    expect(data.total).toBe(8);

    // The crossfilter foreground keeps the same three bars.
    const filter: Filter = { type: 'range', column: 'v', min: 2, max: Infinity };
    const fg = await fetchDiscreteBins(t, 'v', [1, 2, 3], [filter], bridge);
    expect(fg.map((b) => b.count)).toEqual([0, 1, 1]);
  });

  it('no finite values: no bars, every non-finite value counted', async () => {
    const t = await create(
      `SELECT v FROM (VALUES ('NaN'::DOUBLE), ('Infinity'::DOUBLE), ('-Infinity'::DOUBLE),
                             ('NaN'::DOUBLE), (NULL)) AS s(v)`,
    );

    const data = await fetchHistogramData(t, 'v', 15, [], bridge);

    // The chart draws its null bar, as for a column with only nulls.
    expect(data.bins).toEqual([]);
    expect(Number.isNaN(data.min)).toBe(true);
    expect(Number.isNaN(data.max)).toBe(true);
    expect(data.median).toBeNull();
    expect(data.distinctCount).toBe(0);
    expect(data.nonFiniteCount).toBe(4);
    expect(data.nullCount).toBe(1);
    expect(data.total).toBe(5);
  });

  it('a single finite value beside NaN: one bar of the finite rows', async () => {
    const t = await create(
      `SELECT v FROM (VALUES (5.0::DOUBLE), (5.0), (5.0), ('NaN'::DOUBLE), (NULL)) AS s(v)`,
    );

    const data = await fetchHistogramData(t, 'v', 15, [], bridge);

    expect(data.isSingleValue).toBe(true);
    expect(data.bins).toEqual([{ x0: 5, x1: 5, count: 3 }]);
    expect(data.min).toBe(5);
    expect(data.max).toBe(5);
    expect(data.distinctCount).toBe(1);
    expect(data.nonFiniteCount).toBe(1);
    expect(data.total).toBe(5);
  });

  it('crossfilter-aligned bins and stats under another column’s filter', async () => {
    const t = await create(
      `SELECT range AS g,
              CASE WHEN range % 10 = 0 THEN 'NaN'::DOUBLE
                   WHEN range % 10 = 1 THEN 'Infinity'::DOUBLE
                   ELSE CAST(range AS DOUBLE) END AS v
       FROM range(1000)`,
    );
    const initial = await fetchHistogramData(t, 'v', 15, [], bridge);
    const filter: Filter = { type: 'range', column: 'g', min: 0, max: 500 };
    const expected = await counts(t, filtersToWhereClause([filter]));

    // `Histogram.fetchAlignedForeground` runs these two with the filter.
    const [bins, stats] = await Promise.all([
      fetchHistogramBins(t, 'v', initial.min, initial.max, initial.bins.length, [filter], bridge),
      fetchColumnStats(t, 'v', [filter], bridge),
    ]);

    expect(binned(bins)).toBe(expected.finite);
    expect(stats.nonFiniteCount).toBe(expected.nonFinite);
    expect(stats.count + stats.nullCount).toBe(expected.total);
    expect(stats.min).toBe(expected.min);
    expect(stats.max).toBe(expected.max);
  });

  it('an open-ended range filter matches NaN and Infinity, and the stats count them', async () => {
    // The filter panel's "at least" gives `max: Infinity`, an open bound, so
    // the filter is `"v" >= 500`. DuckDB sorts NaN above every number, so
    // that holds for every NaN row, wherever it sits, as for Infinity.
    const t = await create(
      `SELECT CASE WHEN range % 100 = 0 THEN 'NaN'::DOUBLE
                   WHEN range % 100 = 1 THEN 'Infinity'::DOUBLE
                   ELSE CAST(range AS DOUBLE) END AS v
       FROM range(1000)`,
    );
    const filter: Filter = { type: 'range', column: 'v', min: 500, max: Infinity };

    const stats = await fetchColumnStats(t, 'v', [filter], bridge);

    // 490 finite rows from 502 to 999, and all 10 NaN and 10 Infinity rows.
    expect(stats.count).toBe(510);
    expect(stats.nonFiniteCount).toBe(20);
    expect(stats.min).toBe(502);
    expect(stats.max).toBe(999);
  });
});
