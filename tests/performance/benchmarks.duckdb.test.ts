/**
 * Phase 4: real-DuckDB timing budgets.
 *
 * These benchmarks exercise the loaders against the `nyc_taxi` fixtures
 * (100k rows × 19 cols) and time cached vs uncached SELECT round-trips.
 * They are gated by `RUN_DUCKDB_PERF=1` because real-load timings vary
 * too much to gate CI on (cold disk, M-series vs Intel, container CI
 * runners) — locally they're a useful regression signal.
 *
 * Local M1 medians (3-run, after warmup):
 *   - nyc_taxi.parquet load:  ~600ms
 *   - nyc_taxi.csv     load:  ~3500ms
 *   - 100 cached SELECTs:     ~25ms
 *   - 100 uncached COUNT(*):  ~700ms
 *
 * Budgets are 4-5x of the local median to absorb CI / shared-runner
 * variance. Tighten in Phase 9 if we land a dedicated perf runner.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';
import { loadParquet } from '@/worker/loaders/parquet';
import { QueryCache } from '@/data/QueryCache';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { readBinaryFixture } from '../helpers/fixtures';

const RUN = process.env['RUN_DUCKDB_PERF'] === '1';
const describeIfPerf = RUN ? describe : describe.skip;

describeIfPerf('DuckDB performance budgets (opt-in via RUN_DUCKDB_PERF=1)', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('nyc_taxi.parquet load completes within 8000ms', async () => {
    const data = await readBinaryFixture('parquet', 'nyc_taxi');
    const start = performance.now();
    const result = await loadParquet(
      data,
      { tableName: 'perf_nyc_pq' },
      { db: harness.db, conn: harness.conn },
    );
    const elapsed = performance.now() - start;
    expect(result.rowCount).toBe(100_000);
    expect(elapsed).toBeLessThan(8000);
  }, 30_000);

  it('nyc_taxi.csv load completes within 15000ms', async () => {
    const data = await readBinaryFixture('csv', 'nyc_taxi');
    const start = performance.now();
    const result = await loadCSV(
      data,
      { tableName: 'perf_nyc_csv' },
      { db: harness.db, conn: harness.conn },
    );
    const elapsed = performance.now() - start;
    expect(result.rowCount).toBe(100_000);
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);

  it('100 cached SELECTs return in under 150ms total', async () => {
    // Use a separate QueryCache instance — the loaders use the bridge's,
    // which we haven't wired up here.
    const cache = new QueryCache({ maxEntries: 200, ttlMs: 60_000 });
    const sql = 'SELECT COUNT(*) AS n FROM perf_nyc_pq';
    // Warm: hit DuckDB once to populate.
    const warm = await harness.conn.query(sql);
    const rows = warm.toArray().map((r) => r.toJSON());
    cache.set(sql, rows);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const cached = cache.get(sql);
      expect(cached).toBeDefined();
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });

  it('100 uncached random-WHERE COUNT(*) queries complete in under 3000ms', async () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      // Each query has a unique WHERE clause so the cache (if any) misses.
      const result = await harness.conn.query(
        `SELECT COUNT(*) AS n FROM perf_nyc_pq WHERE PULocationID = ${i}`,
      );
      // Force materialization.
      result.toArray();
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
