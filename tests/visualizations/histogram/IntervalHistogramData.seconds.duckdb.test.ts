/**
 * INTERVAL histogram binning of fractions of a second, against real
 * DuckDB-WASM (RT-18, bug E).
 *
 * The chart puts each value on a seconds scale, a month at 30.4375 days and a
 * year at 365.25. The bins read each value's seconds with
 * `intervalToSecondsSQL`, whose last term was `EXTRACT(second …)`: a whole
 * number, so `1.5 seconds` binned as 1. The minimum and maximum came from
 * `MIN(col)::VARCHAR`, parsed in JavaScript, which kept the fraction, so a
 * value fell below its bin and `HAVING bin_idx >= 0` dropped it: 100 values
 * from 1 to 991 ms drew 15 empty bars. DuckDB's MIN and MAX order intervals
 * with 30-day months, so beside `30 days 06:00:00` the minimum was `1 month`,
 * above the maximum on the chart's scale. `APPROX_QUANTILE` takes no
 * INTERVAL, so there was never a median, and the parser read `100:00:00.5`
 * as half a second. The stats are now the MIN, MAX and APPROX_QUANTILE of the
 * expression the bins use, which keeps the fraction.
 *
 * Every case takes the continuous path and asserts that the minimum is at
 * most the maximum, that the median lies between them, and that the bin
 * counts add up to the column's non-null count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { filtersToWhereClause } from '@/filters/FilterSQL';
import type { RangeFilter } from '@/filters/FilterTypes';
import { fetchIntervalStats } from '@/statistics/StatsComputer';
import { formatStatsLine2 } from '@/statistics/StatsFormatters';
import {
  fetchIntervalHistogramData,
  fetchIntervalNumericBins,
  intervalToSecondsSQL,
  parseIntervalToSeconds,
  secondsToIntervalSQL,
} from '@/visualizations/histogram/IntervalHistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

/** `[label, SELECT producing one INTERVAL column d]`. */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['1 to 991 milliseconds', 'SELECT to_milliseconds(1 + range * 10) AS d FROM range(100)'],
  [
    'fractions past a minute, an hour and a day, both signs, with NULLs',
    `SELECT CASE WHEN range % 9 = 0 THEN NULL
                 ELSE to_days((range % 5) - 2) + to_microseconds((range - 50) * 1234567891) END AS d
     FROM range(101)`,
  ],
  [
    'months beside days',
    `SELECT d FROM (VALUES
       (INTERVAL '1 month'),
       (INTERVAL '1 month 2 hours'),
       (INTERVAL '1 month 00:00:00.5'),
       (INTERVAL '30 days 06:00:00'),
       (INTERVAL '30 days 03:00:00.25'),
       (NULL)
     ) AS s(d)`,
  ],
  ['1 to 1,000 microseconds', 'SELECT to_microseconds(1 + range) AS d FROM range(1000)'],
  [
    '100 hours and more',
    'SELECT to_microseconds(range * 36000000000 + 500000) AS d FROM range(30)',
  ],
];

describe('interval histogram — fractions of a second (RT-18 E)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (): string => `viz_iv_seconds_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  const nonNullCount = async (t: string): Promise<number> => {
    const [row] = await bridge.query<{ n: number }>(`SELECT COUNT(d) AS n FROM "${t}"`);
    return Number(row!.n);
  };

  const binned = (bins: ReadonlyArray<{ count: number }>): number =>
    bins.reduce((sum, bin) => sum + bin.count, 0);

  it.each(CASES)('%s: bins every non-null value', async (_label, select) => {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${select}`);

    const data = await fetchIntervalHistogramData(t, 'd', [], bridge);

    expect(data.isSingleValue).toBe(false);
    expect(data.bins).toHaveLength(15);
    const min = data.minSeconds!;
    const max = data.maxSeconds!;
    const median = data.medianSeconds;
    // One assertion, so a failure shows each broken invariant.
    expect({
      binned: binned(data.bins),
      minBelowMax: min < max,
      medianInRange: median !== null && min <= median && median <= max,
    }).toEqual({ binned: await nonNullCount(t), minBelowMax: true, medianInRange: true });
  });

  it('1 to 991 milliseconds: the stats line gains a median', async () => {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${CASES[0]![1]}`);

    const data = await fetchIntervalHistogramData(t, 'd', [], bridge);
    expect(data.minSeconds).toBe(0.001);
    expect(data.maxSeconds).toBe(0.991);
    expect(data.medianSeconds).toBeCloseTo(0.496, 6);

    // fetchIntervalStats computes the same stats as the chart's line 2.
    const stats = await fetchIntervalStats(t, 'd', [], bridge);
    expect(formatStatsLine2(stats, 'interval')).toBe('min 0.001s · med 0.496s · max 0.991s');
  });

  it('a brush over bars 3–5 keeps exactly their rows', async () => {
    const t = tableName();
    await harness.conn.query(`CREATE TABLE "${t}" AS ${CASES[0]![1]}`);
    const initial = await fetchIntervalHistogramData(t, 'd', [], bridge);

    // The filter IntervalHistogram.emitBrushFilter writes for bars 3–5.
    const filter: RangeFilter = {
      type: 'range',
      column: 'd',
      min: secondsToIntervalSQL(initial.bins[3]!.binStartSeconds),
      max: secondsToIntervalSQL(initial.bins[5]!.binEndSeconds),
      valueType: 'interval',
    };
    const bins = await fetchIntervalNumericBins(
      t,
      'd',
      initial.bins.length,
      initial.minSeconds!,
      initial.maxSeconds!,
      [filter],
      bridge,
    );

    // Bars 3–5 keep their counts and the others empty…
    expect(bins.map((bin) => bin.count)).toEqual(
      initial.bins.map((bin, i) => (i >= 3 && i <= 5 ? bin.count : 0)),
    );
    // …and they hold every row the filter matches.
    const [row] = await bridge.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "${t}" WHERE ${filtersToWhereClause([filter])}`,
    );
    expect(Number(row!.n)).toBe(20);
    expect(binned(bins)).toBe(20);
  });

  it('fetchIntervalStats reads 100 hours as 100 hours', async () => {
    const t = tableName();
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT d FROM (VALUES
         (INTERVAL '1 second'),
         (INTERVAL '50 hours'),
         (INTERVAL '100 hours 0.5 seconds')
       ) AS s(d)`,
    );

    const stats = await fetchIntervalStats(t, 'd', [], bridge);

    expect(stats.maxDisplay).toBe('4d 4h 0.5s');
    expect(stats.minDisplay).toBe('1s');
    expect(stats.medianDisplay).toBe('2d 2h');
  });

  it("DuckDB's text of each value parses to the seconds the bins use", async () => {
    const t = tableName();
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT d FROM (VALUES
         (INTERVAL '0.001 seconds'),
         (INTERVAL '-2.25 seconds'),
         (INTERVAL '1 minute 1.5 seconds'),
         (INTERVAL '100 hours 0.5 seconds'),
         (INTERVAL '-100 hours'),
         (INTERVAL '-1 day -0.5 seconds'),
         (INTERVAL '1 year 2 months 3 days 04:05:06.789'),
         (to_days(1) + to_microseconds(-1500000)),
         (to_microseconds(9000000000000123))
       ) AS s(d)`,
    );

    const rows = await bridge.query<{ text: string; sec: number }>(
      `SELECT CAST(d AS VARCHAR) AS text, ${intervalToSecondsSQL('"d"')} AS sec FROM "${t}"`,
    );

    expect(rows).toHaveLength(9);
    for (const { text, sec } of rows) {
      expect(parseIntervalToSeconds(text), text).toBeCloseTo(sec, 6);
    }
  });
});
