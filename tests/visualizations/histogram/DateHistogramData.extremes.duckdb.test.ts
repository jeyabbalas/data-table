/**
 * Date and timestamp histograms of columns reaching before year 1, past year
 * 9999 or to `infinity`, against real DuckDB-WASM (RT-18, bug C).
 *
 * The chart read its minimum and maximum as DuckDB's text and parsed it with
 * `new Date()`, which reads none of `0044-03-15 (BC)`, `12000-01-01` and
 * `infinity`, so such a column drew nothing. V8 read years 1 to 99 as 1950
 * to 2049 (`0050-06-15` as 1950) and a TIMESTAMPTZ before year 1 as one
 * after 2000, so the bins started in the wrong place and left rows out.
 * `infinity` would have joined the last bar of the equal-width fallback, as
 * `LEAST` ignores its NULL epoch.
 *
 * The chart now takes each value's position from DuckDB as epoch
 * milliseconds. It leaves `infinity`, `-infinity` and the dates a JavaScript
 * `Date` cannot hold (more than about 270,000 years from 1970) out of its
 * bars and its range, and counts them in `nonFiniteCount`; `total` still
 * counts every row. Each case asserts that the chart draws and that its bins
 * add up to the values it can chart.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Filter } from '@/core/types';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import {
  fetchDateHistogramBins,
  fetchDateHistogramData,
  fetchDateNumericBins,
  fetchDateStats,
  type DateHistogramBin,
} from '@/visualizations/histogram/DateHistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

interface Case {
  label: string;
  /** A SELECT producing one column `v`. */
  select: string;
  /** The minimum and maximum the chart should report, as `toISOString` writes them. */
  min: string;
  max: string;
  /** True when the range takes more than 15 bars of a calendar unit. */
  numeric: boolean;
}

/** DATE from 2000 to the year 12000: equal-width bars. */
const DATE_TO_12000 = `SELECT DATE '2000-01-01' + CAST(range * 2500 AS INTEGER) AS v FROM range(1000)
  UNION ALL SELECT * FROM (VALUES (DATE '10000-01-01'), (DATE '12000-01-01')) AS s(v)`;

/** TIMESTAMP from 44 BC to the year 12000: equal-width bars. */
const TIMESTAMP_44_BC_TO_12000 = `SELECT TIMESTAMP '0001-01-01 00:00:00'
    + to_days(CAST(range * 3000 AS INTEGER)) AS v FROM range(1000)
  UNION ALL SELECT * FROM (VALUES (TIMESTAMP '0044-03-15 (BC) 12:30:00'),
                                  (TIMESTAMP '12000-01-01 00:00:00')) AS s(v)`;

/** Every day of 45 BC to 43 BC: thirteen quarters or fewer, so DATE_TRUNC bins it. */
const DATE_45_TO_43_BC = `SELECT DATE '0045-01-01 (BC)' + CAST(range AS INTEGER) AS v
  FROM range(1096)`;

const CASES: readonly Case[] = [
  {
    label: 'DATE from 44 BC to 2024, with 1 BC and year 50',
    select: `SELECT v FROM (VALUES (DATE '0044-03-15 (BC)'), (DATE '0001-01-01 (BC)'),
                                   (DATE '0050-06-15'), (DATE '2024-12-31'), (NULL)) AS s(v)
             UNION ALL SELECT DATE '0001-01-01' + CAST(range * 7 AS INTEGER) FROM range(100000)`,
    min: '-000043-03-15T00:00:00.000Z',
    max: '2024-12-31T00:00:00.000Z',
    numeric: true,
  },
  {
    label: 'DATE up to year 12000',
    select: DATE_TO_12000,
    min: '2000-01-01T00:00:00.000Z',
    max: '+012000-01-01T00:00:00.000Z',
    numeric: true,
  },
  {
    label: 'DATE with infinity, -infinity and NULL',
    select: `SELECT CASE range % 25 WHEN 0 THEN 'infinity'::DATE WHEN 1 THEN '-infinity'::DATE
                                   WHEN 2 THEN NULL
                                   ELSE DATE '1990-06-01' + CAST(range * 10 AS INTEGER) END AS v
             FROM range(1000)
             UNION ALL SELECT * FROM (VALUES (DATE '1990-01-01'), (DATE '2020-12-31')) AS s(v)`,
    min: '1990-01-01T00:00:00.000Z',
    max: '2020-12-31T00:00:00.000Z',
    numeric: true,
  },
  {
    label: 'TIMESTAMP with infinity, in the equal-width fallback',
    select: `SELECT CASE WHEN range % 50 = 0 THEN 'infinity'::TIMESTAMP
                         ELSE TIMESTAMP '1980-01-01 00:00:00' + to_hours(range * 200) END AS v
             FROM range(1000)
             UNION ALL SELECT * FROM (VALUES (TIMESTAMP '1970-01-01 00:00:00'),
                                             (TIMESTAMP '2030-06-30 12:34:56')) AS s(v)`,
    min: '1970-01-01T00:00:00.000Z',
    max: '2030-06-30T12:34:56.000Z',
    numeric: true,
  },
  {
    label: 'TIMESTAMP from 44 BC to year 12000',
    select: TIMESTAMP_44_BC_TO_12000,
    min: '-000043-03-15T12:30:00.000Z',
    max: '+012000-01-01T00:00:00.000Z',
    numeric: true,
  },
  {
    label: 'TIMESTAMPTZ before year 1, in a UTC session',
    select: `SELECT CAST(v AS TIMESTAMPTZ) AS v
             FROM (VALUES ('0044-03-15 (BC) 12:30:00+00'), ('0001-06-01 00:00:00+00'),
                          ('0099-01-01 00:00:00+00'), ('1999-12-31 23:59:59+00'), (NULL)) AS s(v)
             UNION ALL SELECT CAST(TIMESTAMP '0100-01-01' + to_days(CAST(range * 600 AS INTEGER))
                                   AS TIMESTAMPTZ)
             FROM range(1000)`,
    min: '-000043-03-15T12:30:00.000Z',
    max: '1999-12-31T23:59:59.000Z',
    numeric: true,
  },
  {
    // A control: TIMESTAMP_NS holds only 1677 to 2262, which charted before.
    label: 'TIMESTAMP_NS from 1677 to 2262',
    select: `SELECT CAST(v AS TIMESTAMP_NS) AS v
             FROM (VALUES ('1677-09-22 00:00:00'), ('2262-04-10 00:00:00')) AS s(v)
             UNION ALL SELECT CAST(TIMESTAMP '1700-01-01' + to_days(CAST(range * 200 AS INTEGER))
                                   AS TIMESTAMP_NS)
             FROM range(1000)`,
    min: '1677-09-22T00:00:00.000Z',
    max: '2262-04-10T00:00:00.000Z',
    numeric: true,
  },
  {
    // DuckDB's DATE runs from 5877642 BC to 5881580 AD. DATE_TRUNC fails on
    // a date past TIMESTAMP's range, and DuckDB plans its range from the
    // column's minimum and maximum, before any row is filtered.
    label: 'DATE past what a JavaScript Date holds, binned by DATE_TRUNC',
    select: `SELECT DATE '2000-01-01' + CAST(range * 3 AS INTEGER) AS v FROM range(1000)
             UNION ALL SELECT * FROM (VALUES (DATE '300000-01-01'), (DATE '5881580-07-10'),
                                             (DATE '5877642-06-25 (BC)'), (DATE '1999-01-01'),
                                             (DATE '2010-01-01')) AS s(v)`,
    min: '1999-01-01T00:00:00.000Z',
    max: '2010-01-01T00:00:00.000Z',
    numeric: false,
  },
  {
    label: 'DATE past what a JavaScript Date holds, in the equal-width fallback',
    select: `SELECT DATE '1900-01-01' + CAST(range * 40 AS INTEGER) AS v FROM range(1000)
             UNION ALL SELECT * FROM (VALUES (DATE '300000-01-01'), (DATE '5881580-07-10'),
                                             (DATE '5877642-06-25 (BC)'), (DATE '1899-12-31'),
                                             (DATE '2024-12-31')) AS s(v)`,
    min: '1899-12-31T00:00:00.000Z',
    max: '2024-12-31T00:00:00.000Z',
    numeric: true,
  },
  {
    // TIMESTAMP runs from 290309 BC to 294247 AD, past a JavaScript Date too.
    label: 'TIMESTAMP at the ends of its range, beside three years binned by DATE_TRUNC',
    select: `SELECT TIMESTAMP '2021-01-01' + to_days(CAST(range AS INTEGER)) AS v FROM range(1095)
             UNION ALL SELECT * FROM (VALUES (TIMESTAMP '290309-12-22 (BC) 00:00:00'),
                                             (TIMESTAMP '294247-01-10 04:00:54.775806')) AS s(v)`,
    min: '2021-01-01T00:00:00.000Z',
    max: '2023-12-31T00:00:00.000Z',
    numeric: false,
  },
  {
    label: 'DATE over three years before year 1, binned by DATE_TRUNC',
    select: DATE_45_TO_43_BC,
    min: '-000044-01-01T00:00:00.000Z',
    max: '-000042-12-31T00:00:00.000Z',
    numeric: false,
  },
];

/** The most seconds from 1970, either way, that a JavaScript `Date` holds. */
const DATE_LIMIT_SECONDS = 8.64e12;

const binned = (bins: DateHistogramBin[]): number => bins.reduce((sum, bin) => sum + bin.count, 0);

describe('date histogram — before year 1, past 9999 and infinity (RT-18)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (): string => `viz_date_extremes_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    // As the loaders do (src/worker/loaders/common.ts).
    await harness.conn.query(`SET TimeZone = 'UTC'`);
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
  ): Promise<{ chartable: number; nonFinite: number; nulls: number; total: number }> => {
    const [row] = await bridge.query<{ chartable: number; non_null: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE isfinite(v)
                                 AND abs(EXTRACT(EPOCH FROM v)) < ${DATE_LIMIT_SECONDS}) AS chartable,
              COUNT(v) AS non_null,
              COUNT(*) AS total
       FROM "${t}" ${where ? `WHERE ${where}` : ''}`,
    );
    const chartable = Number(row!.chartable);
    const nonNull = Number(row!.non_null);
    const total = Number(row!.total);
    return { chartable, nonFinite: nonNull - chartable, nulls: total - nonNull, total };
  };

  it.each(CASES)('$label: bins every value it can chart, counts the rest', async (c) => {
    const t = await create(c.select);
    const expected = await counts(t);

    const data = await fetchDateHistogramData(t, 'v', [], bridge);

    expect(data.min?.toISOString()).toBe(c.min);
    expect(data.max?.toISOString()).toBe(c.max);
    expect(data.isNumericBinning).toBe(c.numeric);
    expect(data.bins.length).toBeGreaterThan(0);
    expect(binned(data.bins)).toBe(expected.chartable);
    expect(data.nonFiniteCount ?? 0).toBe(expected.nonFinite);
    expect(data.nullCount).toBe(expected.nulls);
    expect(data.total).toBe(expected.total);
  });

  it('a DATE_TRUNC bar before year 1 starts on its quarter', async () => {
    const t = await create(DATE_45_TO_43_BC);

    const data = await fetchDateHistogramData(t, 'v', [], bridge);

    expect(data.interval).toBe('quarter');
    expect(data.bins.map((bin) => bin.binStart.toISOString().slice(0, 13))).toEqual([
      '-000044-01-01',
      '-000044-04-01',
      '-000044-07-01',
      '-000044-10-01',
      '-000043-01-01',
      '-000043-04-01',
      '-000043-07-01',
      '-000043-10-01',
      '-000042-01-01',
      '-000042-04-01',
      '-000042-07-01',
      '-000042-10-01',
    ]);
    // 45 BC, astronomical year -44, is a leap year.
    expect(data.bins[0]!.count).toBe(91);
  });

  it('no value it can chart: no bars, infinity and -infinity counted', async () => {
    const t = await create(
      `SELECT v FROM (VALUES ('infinity'::DATE), ('-infinity'::DATE), ('infinity'::DATE),
                             (NULL)) AS s(v)`,
    );

    const data = await fetchDateHistogramData(t, 'v', [], bridge);

    // The chart draws its null bar, as for a column with only nulls.
    expect(data.bins).toEqual([]);
    expect(data.min).toBeNull();
    expect(data.max).toBeNull();
    expect(data.nonFiniteCount).toBe(3);
    expect(data.nullCount).toBe(1);
    expect(data.total).toBe(4);
  });

  it('one value beside infinity: one bar of the finite rows', async () => {
    const t = await create(
      `SELECT v FROM (VALUES (TIMESTAMP '2024-06-15 12:00:00'), (TIMESTAMP '2024-06-15 12:00:00'),
                             ('infinity'::TIMESTAMP), (NULL)) AS s(v)`,
    );

    const data = await fetchDateHistogramData(t, 'v', [], bridge);

    expect(data.isSingleValue).toBe(true);
    expect(data.bins).toHaveLength(1);
    expect(data.bins[0]!.count).toBe(2);
    expect(data.min?.toISOString()).toBe('2024-06-15T12:00:00.000Z');
    expect(data.nonFiniteCount).toBe(1);
    expect(data.total).toBe(4);
  });

  it('a minimum of 1969-12-31 23:59:59.9985 keeps its row in the first bar', async () => {
    // Its epoch is -1.5 ms. A Date made from it holds -1 ms, as a Date rounds
    // toward zero: above the row, which would then fall at bar -1.
    const t = await create(
      `SELECT v FROM (VALUES (TIMESTAMP '1969-12-31 23:59:59.9985')) AS s(v)
       UNION ALL SELECT TIMESTAMP '1970-01-01' + to_days(CAST(range * 30 AS INTEGER))
       FROM range(1000)`,
    );

    const data = await fetchDateHistogramData(t, 'v', [], bridge);

    expect(data.isNumericBinning).toBe(true);
    expect(data.min?.toISOString()).toBe('1969-12-31T23:59:59.998Z');
    expect(binned(data.bins)).toBe(1001);
  });

  describe('a brush over a bar matches the rows of that bar', () => {
    /** The rows of `t` passing `filter`, counted by DuckDB. */
    const matching = async (t: string, filter: Filter): Promise<number> => {
      const [row] = await bridge.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "${t}" WHERE ${filtersToWhereClause([filter])}`,
      );
      return Number(row!.n);
    };

    it('a quarter before year 1, on the DATE_TRUNC path', async () => {
      const t = await create(DATE_45_TO_43_BC);
      const data = await fetchDateHistogramData(t, 'v', [], bridge);
      const bar = data.bins[5]!;
      // As the brush filters a DATE_TRUNC bar: its start up to the next one's.
      const filter: Filter = { type: 'range', column: 'v', min: bar.binStart, max: bar.binEnd };

      const fg = await fetchDateHistogramBins(t, 'v', data.interval, [filter], bridge);

      expect(fg).toEqual([bar]);
      expect(await matching(t, filter)).toBe(bar.count);
    });

    it('the first bar, from 44 BC, on the equal-width path', async () => {
      const t = await create(TIMESTAMP_44_BC_TO_12000);
      const data = await fetchDateHistogramData(t, 'v', [], bridge);
      const bar = data.bins[0]!;
      const filter: Filter = { type: 'range', column: 'v', min: bar.binStart, max: bar.binEnd };
      expect(filtersToWhereClause([filter])).toContain(`>= '-000043-03-15T12:30:00.000Z'`);

      const fg = await fetchDateNumericBins(
        t,
        'v',
        data.bins.length,
        data.min!.getTime(),
        data.max!.getTime(),
        [filter],
        bridge,
      );

      expect(fg[0]!.count).toBe(bar.count);
      expect(binned(fg)).toBe(bar.count);
      expect(await matching(t, filter)).toBe(bar.count);
    });

    it('the last bar, ending in the year 12000, on the equal-width path', async () => {
      const t = await create(DATE_TO_12000);
      const data = await fetchDateHistogramData(t, 'v', [], bridge);
      const last = data.bins.length - 1;
      const bar = data.bins[last]!;
      // The brush includes the last bar's end, the column's maximum.
      const filter: Filter = {
        type: 'range',
        column: 'v',
        min: bar.binStart,
        max: bar.binEnd,
        maxInclusive: true,
      };

      const fg = await fetchDateNumericBins(
        t,
        'v',
        data.bins.length,
        data.min!.getTime(),
        data.max!.getTime(),
        [filter],
        bridge,
      );

      expect(fg[last]!.count).toBe(bar.count);
      expect(binned(fg)).toBe(bar.count);
      expect(await matching(t, filter)).toBe(bar.count);
      // Not the `+012000-…` that `toISOString` writes, which DuckDB rejects.
      expect(filtersToWhereClause([filter])).toContain(`<= '12000-01-01T00:00:00.000Z'`);
    });

    it('the last bar keeps a maximum with digits past the millisecond', async () => {
      // `.123456` is above the millisecond it falls in, so a last bar ending
      // at that millisecond left the maximum out.
      const t = await create(
        `SELECT TIMESTAMP '1990-01-01' + to_days(CAST(range * 10 AS INTEGER)) AS v FROM range(1000)
         UNION ALL SELECT TIMESTAMP '2030-01-01 00:00:00.123456'`,
      );
      const data = await fetchDateHistogramData(t, 'v', [], bridge);
      expect(data.isNumericBinning).toBe(true);
      const bar = data.bins[data.bins.length - 1]!;
      const filter: Filter = {
        type: 'range',
        column: 'v',
        min: bar.binStart,
        max: bar.binEnd,
        maxInclusive: true,
      };

      expect(await matching(t, filter)).toBe(bar.count);
    });
  });

  it('crossfilter-aligned bins and stats under another column’s filter', async () => {
    const t = await create(
      `SELECT range AS g,
              CASE WHEN range % 10 = 0 THEN 'infinity'::DATE
                   ELSE DATE '0044-03-15 (BC)' + CAST((range - 1) * 700 AS INTEGER) END AS v
       FROM range(1000)`,
    );
    const initial = await fetchDateHistogramData(t, 'v', [], bridge);
    expect(initial.isNumericBinning).toBe(true);
    const filter: Filter = { type: 'range', column: 'g', min: 0, max: 500 };
    const expected = await counts(t, filtersToWhereClause([filter]));

    // `DateHistogram.fetchAlignedForeground` runs these two with the filter.
    const [bins, stats] = await Promise.all([
      fetchDateNumericBins(
        t,
        'v',
        initial.bins.length,
        initial.min!.getTime(),
        initial.max!.getTime(),
        [filter],
        bridge,
      ),
      fetchDateStats(t, 'v', [filter], bridge),
    ]);

    expect(binned(bins)).toBe(expected.chartable);
    expect(stats.nonFiniteCount).toBe(expected.nonFinite);
    expect(stats.count + stats.nullCount).toBe(expected.total);
    expect(stats.min?.toISOString()).toBe('-000043-03-15T00:00:00.000Z');
  });
});
