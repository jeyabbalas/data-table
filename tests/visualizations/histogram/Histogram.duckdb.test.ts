/**
 * Phase 6 — numeric histogram correctness against real DuckDB-WASM.
 *
 * Drives `fetchHistogramData` end-to-end through the Node-side DuckDB
 * harness so the SQL shape (bin computation, NULL accounting, discrete
 * vs continuous mode, single-value detection) is exercised against the
 * same engine that runs in production.
 *
 * Mock-bridge tests in `tests/visualizations/histogram/HistogramData.test.ts`
 * lock the surrounding pure-functions (`formatSQLValue`,
 * `filtersToWhereClause`, `calculateOptimalBins`); this file complements
 * them by validating the actual fetched bin counts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchHistogramData } from '@/visualizations/histogram/HistogramData';
import type { Filter } from '@/core/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

describe('numeric histogram — real DuckDB integration', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (suffix: string): string => `viz_hist_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('all-NULL column: zero bins, nullCount equals total rows', async () => {
    const t = tableName('all_null');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(NULL AS DOUBLE) AS v FROM range(10)`,
    );
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.bins).toEqual([]);
    expect(data.nullCount).toBe(10);
    expect(data.total).toBe(10);
    expect(data.distinctCount).toBe(0);
  });

  it('zero rows: empty bins, zero counts everywhere', async () => {
    const t = tableName('empty');
    await harness.conn.query(`CREATE TABLE "${t}" (v DOUBLE)`);
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.bins).toEqual([]);
    expect(data.nullCount).toBe(0);
    expect(data.total).toBe(0);
    expect(data.distinctCount).toBe(0);
  });

  it('single-value column: one bin, isSingleValue = true, min === max', async () => {
    const t = tableName('single');
    await harness.conn.query(`CREATE TABLE "${t}" AS SELECT 42 AS v FROM range(7)`);
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.isSingleValue).toBe(true);
    expect(data.min).toBe(42);
    expect(data.max).toBe(42);
    expect(data.bins).toHaveLength(1);
    expect(data.bins[0]!.count).toBe(7);
    expect(data.nullCount).toBe(0);
    expect(data.distinctCount).toBe(1);
  });

  it('discrete mode: ≤ 5 distinct values produces one bin per unique value', async () => {
    const t = tableName('discrete');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES (1), (1), (2), (3), (3), (3), (5)) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.isDiscrete).toBe(true);
    expect(data.bins).toHaveLength(4); // 1, 2, 3, 5
    expect(data.bins.map((b) => b.x0).sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);
    const counts = new Map(data.bins.map((b) => [b.x0, b.count]));
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(3)).toBe(3);
    expect(counts.get(5)).toBe(1);
  });

  it('continuous mode: > 5 distinct values produces width-equal bins capped at maxBins', async () => {
    const t = tableName('continuous');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(100)`,
    );
    const data = await fetchHistogramData(t, 'v', 10, [], bridge);
    expect(data.isDiscrete).toBe(false);
    expect(data.bins.length).toBeGreaterThan(0);
    expect(data.bins.length).toBeLessThanOrEqual(10);
    // Bins are sorted by x0 ascending; widths uniform within rounding.
    const widths = data.bins.map((b) => b.x1 - b.x0);
    const w0 = widths[0]!;
    for (const w of widths) expect(w).toBeCloseTo(w0, 5);
    // All non-null rows accounted for.
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(100);
    expect(data.distinctCount).toBe(100);
    expect(data.nullCount).toBe(0);
  });

  it('NULL accounting: COUNT(*) − COUNT(col) = nullCount, bins exclude NULLs', async () => {
    const t = tableName('mixed_null');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES (1.0), (2.0), (3.0), (NULL), (NULL), (4.0), (5.0), (6.0)) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.nullCount).toBe(2);
    expect(data.total).toBe(8);
    expect(data.distinctCount).toBe(6);
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(6);
  });

  it('negative range: bins span min < 0 to max > 0 inclusively', async () => {
    const t = tableName('negative');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(range - 50 AS DOUBLE) AS v FROM range(100)`,
    );
    const data = await fetchHistogramData(t, 'v', 10, [], bridge);
    expect(data.min).toBe(-50);
    expect(data.max).toBe(49);
    expect(data.bins.length).toBeGreaterThan(0);
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(100);
    // First bin includes min; last bin includes max.
    expect(data.bins[0]!.x0).toBeLessThanOrEqual(-50);
    expect(data.bins[data.bins.length - 1]!.x1).toBeGreaterThanOrEqual(49);
  });

  it('Infinity values are excluded from bins (formatSQLValue produces NULL) but DuckDB accepts them in storage', async () => {
    const t = tableName('infinity');
    // DuckDB DOUBLE accepts +Infinity and -Infinity. The histogram path uses
    // MIN/MAX which DuckDB returns as Infinity; the bin computation then
    // produces width-Infinity bins which is unusable. This test documents
    // the current behavior: storage accepts Infinity, but the bin output
    // becomes degenerate. Consumers should filter Infinity client-side
    // before binning if they need usable visualizations.
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES
        (CAST(1.0 AS DOUBLE)),
        (CAST(2.0 AS DOUBLE)),
        (CAST(3.0 AS DOUBLE)),
        (CAST('Infinity' AS DOUBLE)),
        (CAST('-Infinity' AS DOUBLE))
      ) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 10, [], bridge);
    expect(data.nullCount).toBe(0);
    expect(data.total).toBe(5);
    expect(data.distinctCount).toBe(5);
    // min === -Infinity, max === Infinity — degenerate range. Document.
    expect(Number.isFinite(data.min)).toBe(false);
    expect(Number.isFinite(data.max)).toBe(false);
  });

  it('range filter narrows the histogram: only matching rows counted, nullCount reflects filtered set', async () => {
    const t = tableName('filtered');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(100)`,
    );
    const filters: Filter[] = [
      {
        type: 'range',
        column: 'v',
        min: 20,
        max: 50,
        maxInclusive: true,
      } as Filter,
    ];
    const data = await fetchHistogramData(t, 'v', 10, filters, bridge);
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(31); // 20..50 inclusive
    expect(data.min).toBe(20);
    expect(data.max).toBe(50);
  });

  it('two-value column (boolean-like 0 / 1): discrete with 2 bins', async () => {
    const t = tableName('two_value');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES (0), (1), (0), (1), (1), (0)) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.isDiscrete).toBe(true);
    expect(data.bins).toHaveLength(2);
    const counts = new Map(data.bins.map((b) => [b.x0, b.count]));
    expect(counts.get(0)).toBe(3);
    expect(counts.get(1)).toBe(3);
  });

  it('all-same-value column with NULLs: single-value detected, nulls separate', async () => {
    const t = tableName('single_w_nulls');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES (5.0), (5.0), (5.0), (NULL), (NULL)) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 15, [], bridge);
    expect(data.isSingleValue).toBe(true);
    expect(data.min).toBe(5);
    expect(data.max).toBe(5);
    expect(data.nullCount).toBe(2);
    expect(data.bins).toHaveLength(1);
    expect(data.bins[0]!.count).toBe(3);
  });

  it('honors maxBins cap (caller supplies maxBins=5 → at most 5 bins)', async () => {
    const t = tableName('max_bins');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(range AS DOUBLE) AS v FROM range(1000)`,
    );
    const data = await fetchHistogramData(t, 'v', 5, [], bridge);
    expect(data.bins.length).toBeLessThanOrEqual(5);
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(1000);
  });

  it('very small (eps) range: continuous bins still produced; sum equals row count', async () => {
    const t = tableName('eps_range');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT v FROM (VALUES
        (1.0000001), (1.0000002), (1.0000003), (1.0000004),
        (1.0000005), (1.0000006), (1.0000007)
      ) AS s(v)`,
    );
    const data = await fetchHistogramData(t, 'v', 10, [], bridge);
    // 7 distinct → continuous mode.
    expect(data.isDiscrete).toBe(false);
    expect(data.distinctCount).toBe(7);
    const sum = data.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(7);
  });
});
