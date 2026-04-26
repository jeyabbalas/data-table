/**
 * Phase 6 — TIME-of-day histogram correctness against real DuckDB-WASM.
 *
 * `fetchTimeHistogramData` converts TIME values to seconds-from-midnight
 * (`EXTRACT(EPOCH FROM ...)` modulo 24 h) and bins on the numeric scale.
 * Locks: empty / all-NULL / single-value / midnight-boundary / sub-second
 * fixtures and the seconds-from-midnight return contract.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchTimeHistogramData } from '@/visualizations/histogram/TimeHistogramData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { makeNodeBridge } from '../../helpers/nodeBridge';

describe('time histogram — real DuckDB integration', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let counter = 0;
  const tableName = (suffix: string): string => `viz_time_${suffix}_${++counter}`;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('all-NULL TIME column: empty bins, nullCount = total, minSeconds null', async () => {
    const t = tableName('all_null');
    await harness.conn.query(`CREATE TABLE "${t}" AS SELECT CAST(NULL AS TIME) AS t FROM range(8)`);
    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    expect(data.bins).toEqual([]);
    expect(data.nullCount).toBe(8);
    expect(data.total).toBe(8);
    expect(data.minSeconds).toBeNull();
    expect(data.maxSeconds).toBeNull();
  });

  it('zero rows: empty bins', async () => {
    const t = tableName('empty');
    await harness.conn.query(`CREATE TABLE "${t}" (t TIME)`);
    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    expect(data.bins).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('single-value TIME: one bin, minSeconds === maxSeconds', async () => {
    const t = tableName('single');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST('12:30:00' AS TIME) AS t FROM range(5)`,
    );
    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    expect(data.isSingleValue).toBe(true);
    expect(data.minSeconds).toBe(12 * 3600 + 30 * 60);
    expect(data.maxSeconds).toBe(data.minSeconds);
    expect(data.bins).toHaveLength(1);
    expect(data.bins[0]!.count).toBe(5);
  });

  it('midnight-boundary fixture: 00:00:00 and 23:59:59 produce a 24-hour-spanning histogram', async () => {
    const t = tableName('midnight');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(t AS TIME) AS t FROM (VALUES
        ('00:00:00'),
        ('06:00:00'),
        ('12:00:00'),
        ('18:00:00'),
        ('23:59:59')
      ) AS s(t)`,
    );
    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    expect(data.minSeconds).toBe(0);
    expect(data.maxSeconds).toBe(23 * 3600 + 59 * 60 + 59);
    const total = data.bins.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(5);
  });

  it('sub-second precision in TIME values: minSeconds reflects fractional seconds (DuckDB epoch is double)', async () => {
    const t = tableName('sub_second');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(t AS TIME) AS t FROM (VALUES
        ('00:00:00.001'),
        ('00:00:00.500'),
        ('00:00:01.000')
      ) AS s(t)`,
    );
    const data = await fetchTimeHistogramData(t, 't', [], bridge);
    expect(data.minSeconds).toBeGreaterThanOrEqual(0);
    expect(data.minSeconds).toBeLessThan(1);
    expect(data.maxSeconds).toBeGreaterThanOrEqual(1);
    const total = data.bins.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(3);
  });

  it('mixed TIME values across hours: bins partition the day; counts sum to non-null total', async () => {
    const t = tableName('hourly');
    await harness.conn.query(
      `CREATE TABLE "${t}" AS SELECT CAST(t AS TIME) AS t FROM (VALUES
        ('09:15:00'),
        ('09:45:00'),
        ('10:30:00'),
        ('11:00:00'),
        ('14:20:00'),
        ('17:00:00'),
        ('19:30:00')
      ) AS s(t)`,
    );
    const data = await fetchTimeHistogramData(t, 't', [], bridge, 12);
    expect(data.bins.length).toBeGreaterThan(0);
    expect(data.bins.length).toBeLessThanOrEqual(12);
    const total = data.bins.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(7);
    // bins sorted by binStartSeconds
    for (let i = 1; i < data.bins.length; i++) {
      expect(data.bins[i]!.binStartSeconds).toBeGreaterThan(data.bins[i - 1]!.binStartSeconds);
    }
  });
});
