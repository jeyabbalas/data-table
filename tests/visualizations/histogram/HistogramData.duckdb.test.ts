/**
 * Phase 6 — column-stats SQL correctness against real DuckDB-WASM.
 *
 * `HistogramData.fetchColumnStats` is the numeric-stats fetcher behind
 * `Histogram.fetchData` and `Histogram.emitDefaultStats`. It returns
 * MIN, MAX (cast to DOUBLE for consistent JS number types), COUNT(col)
 * (excludes NULLs by construction), COUNT(*) - COUNT(col) for
 * `nullCount`, APPROX_QUANTILE for q1/median/q3, and COUNT(DISTINCT col)
 * for `distinctCount`. AVG and STDDEV_POP are *not* part of this path —
 * they live in custom panels (`examples/13-custom-stats-panel/main.ts`).
 *
 * `DateHistogramData.fetchDateStats` returns `min` / `max` as `Date`
 * instances (not ISO strings), which is the contract consumers rely on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchColumnStats } from '@/visualizations/histogram/HistogramData';
import { fetchDateStats } from '@/visualizations/histogram/DateHistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

describe('column stats — NULL semantics, return types, distinct counts', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (suffix: string): string => `viz_stats_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  describe('numeric — fetchColumnStats', () => {
    it('all-NULL column: count=0, nullCount=N, min/max/median = null, distinctCount=0', async () => {
      const t = tableName('all_null');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(NULL AS DOUBLE) AS v FROM range(8)`,
      );
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(stats.count).toBe(0);
      expect(stats.nullCount).toBe(8);
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
      expect(stats.median).toBeNull();
      expect(stats.distinctCount).toBe(0);
    });

    it('partial NULLs: COUNT(col) excludes NULLs; nullCount = COUNT(*) − COUNT(col)', async () => {
      const t = tableName('partial_null');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT v FROM (VALUES (1.0), (2.0), (NULL), (3.0), (NULL), (NULL), (4.0)) AS s(v)`,
      );
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(stats.count).toBe(4);
      expect(stats.nullCount).toBe(3);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(4);
      expect(stats.distinctCount).toBe(4);
      // Median of {1, 2, 3, 4} via APPROX_QUANTILE is between 2 and 3.
      expect(stats.median).not.toBeNull();
      expect(stats.median!).toBeGreaterThanOrEqual(2);
      expect(stats.median!).toBeLessThanOrEqual(3);
    });

    it('integer columns are cast to DOUBLE: stats are JS numbers, not BigInt', async () => {
      const t = tableName('integer');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(range AS BIGINT) AS v FROM range(20)`,
      );
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(typeof stats.min).toBe('number');
      expect(typeof stats.max).toBe('number');
      expect(typeof stats.count).toBe('number');
      expect(typeof stats.distinctCount).toBe('number');
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(19);
      expect(stats.count).toBe(20);
      expect(stats.distinctCount).toBe(20);
    });

    it('single-value column: min === max, distinctCount === 1', async () => {
      const t = tableName('single');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(7 AS DOUBLE) AS v FROM range(5)`,
      );
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(stats.min).toBe(7);
      expect(stats.max).toBe(7);
      expect(stats.count).toBe(5);
      expect(stats.distinctCount).toBe(1);
      expect(stats.median).toBe(7);
    });

    it('quantiles: q1 < median < q3 on a known distribution', async () => {
      const t = tableName('quantiles');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(101)`,
      );
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(stats.q1).not.toBeNull();
      expect(stats.median).not.toBeNull();
      expect(stats.q3).not.toBeNull();
      expect(stats.q1!).toBeLessThan(stats.median!);
      expect(stats.median!).toBeLessThan(stats.q3!);
      expect(stats.q1!).toBeGreaterThanOrEqual(0);
      expect(stats.q3!).toBeLessThanOrEqual(100);
    });

    it('range filter: stats reflect the filtered subset, not the full table', async () => {
      const t = tableName('filter_stats');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(100)`,
      );
      const stats = await fetchColumnStats(
        t,
        'v',
        [
          {
            type: 'range',
            column: 'v',
            min: 25,
            max: 75,
            maxInclusive: true,
          } as never,
        ],
        bridge,
      );
      expect(stats.count).toBe(51);
      expect(stats.min).toBe(25);
      expect(stats.max).toBe(75);
      expect(stats.distinctCount).toBe(51);
    });

    it('zero rows: count=0, nullCount=0, all min/max/median null, distinctCount=0', async () => {
      const t = tableName('empty');
      await harness.conn.query(`CREATE TABLE "${t}" (v DOUBLE)`);
      const stats = await fetchColumnStats(t, 'v', [], bridge);
      expect(stats.count).toBe(0);
      expect(stats.nullCount).toBe(0);
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
      expect(stats.distinctCount).toBe(0);
    });
  });

  describe('numeric — approximate distinct counts (Phase 2 §4.6)', () => {
    it('approx_count_distinct is a real DuckDB-WASM aggregate; other stats unaffected', async () => {
      const t = tableName('approx');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(20000)`,
      );

      const exact = await fetchColumnStats(t, 'v', [], bridge);
      expect(exact.distinctCount).toBe(20_000);
      expect(exact.distinctCountApprox).toBe(false);

      const approx = await fetchColumnStats(t, 'v', [], bridge, { useApproxDistinct: true });
      expect(approx.distinctCountApprox).toBe(true);
      // Deliberately loose: this HyperLogLog is not a rounding error. At
      // 20,000 distinct values DuckDB-WASM returns ~17,000 — a 15%
      // undercount. That inaccuracy is the reason the stats line marks the
      // value with `~` and the "all unique" claim is suppressed; the bound
      // here only pins "same order of magnitude, not a broken query".
      expect(approx.distinctCount).toBeGreaterThan(14_000);
      expect(approx.distinctCount).toBeLessThan(26_000);
      // Everything else in the scan is untouched by the swap.
      expect(approx.count).toBe(exact.count);
      expect(approx.min).toBe(exact.min);
      expect(approx.max).toBe(exact.max);
      expect(approx.nullCount).toBe(exact.nullCount);
    });

    it('is exact at and below the discrete-bin threshold', async () => {
      // The load-bearing claim behind DISCRETE_BIN_THRESHOLD = 5: the
      // discrete/continuous decision reads an approximate distinctCount, so
      // it is only safe if the sketch is exact down here. Measured: exact
      // through cardinality 7, first deviation at 8.
      for (const cardinality of [1, 2, 3, 4, 5, 6, 7]) {
        const t = tableName(`approx_small_${cardinality}`);
        await harness.conn.query(
          `CREATE TABLE "${t}" AS SELECT CAST(range % ${cardinality} AS DOUBLE) AS v FROM range(5000)`,
        );
        const approx = await fetchColumnStats(t, 'v', [], bridge, { useApproxDistinct: true });
        expect(approx.distinctCount).toBe(cardinality);
      }
    });

    it('respects active filters', async () => {
      const t = tableName('approx_filtered');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(1000)`,
      );
      const approx = await fetchColumnStats(
        t,
        'v',
        [{ type: 'range', column: 'v', min: 0, max: 9, maxInclusive: true } as never],
        bridge,
        { useApproxDistinct: true },
      );
      // The WHERE clause is applied — the sketch sees 10 rows, not 1,000.
      // (It reports 11 for a true 10; above the exactness boundary already.)
      expect(approx.count).toBe(10);
      expect(approx.distinctCount).toBeGreaterThanOrEqual(9);
      expect(approx.distinctCount).toBeLessThanOrEqual(12);
    });
  });

  describe('temporal — fetchDateStats returns Date instances', () => {
    it('TIMESTAMP column min/max are Date, not string (locks the consumer-visible type)', async () => {
      const t = tableName('date_types');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(ts AS TIMESTAMP) AS ts FROM (VALUES
          ('2024-01-01 00:00:00'),
          ('2024-06-15 12:00:00'),
          ('2024-12-31 23:59:59')
        ) AS s(ts)`,
      );
      const stats = await fetchDateStats(t, 'ts', [], bridge);
      expect(stats.min).toBeInstanceOf(Date);
      expect(stats.max).toBeInstanceOf(Date);
      expect(stats.count).toBe(3);
      expect(stats.nullCount).toBe(0);
      expect(stats.min!.getTime()).toBeLessThan(stats.max!.getTime());
    });

    it('DATE column round-trips through fetchDateStats as Date', async () => {
      const t = tableName('date_only');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(d AS DATE) AS d FROM (VALUES
          ('2024-01-01'),
          ('2024-12-31')
        ) AS s(d)`,
      );
      const stats = await fetchDateStats(t, 'd', [], bridge);
      expect(stats.min).toBeInstanceOf(Date);
      expect(stats.max).toBeInstanceOf(Date);
    });

    it('all-NULL date column: count=0, nullCount=N, min/max null', async () => {
      const t = tableName('date_null');
      await harness.conn.query(
        `CREATE TABLE "${t}" AS SELECT CAST(NULL AS TIMESTAMP) AS ts FROM range(4)`,
      );
      const stats = await fetchDateStats(t, 'ts', [], bridge);
      expect(stats.count).toBe(0);
      expect(stats.nullCount).toBe(4);
      expect(stats.min).toBeNull();
      expect(stats.max).toBeNull();
    });
  });
});
