/**
 * Phase 4 + Phase 9: real-DuckDB timing budgets.
 *
 * Phase 4 covered loader timings against the `nyc_taxi` fixtures
 * (100k rows × 19 cols) and cached vs uncached SELECT round-trips.
 * Phase 9 adds WASM-init baseline + 1M-row filter latency (range / set /
 * pattern) using a synthetic in-memory table generated via DuckDB
 * `range(1_000_000)` so we don't ship a 100MB fixture.
 *
 * Gated by `RUN_DUCKDB_PERF=1` because real-load timings vary too much
 * to gate CI on (cold disk, M-series vs Intel, container CI runners).
 *
 * Local M1 medians (3-run, after warmup):
 *   - createNodeDuckDB() boot:       ~600-800ms (Node worker_threads)
 *   - nyc_taxi.parquet load:         ~600ms
 *   - nyc_taxi.csv     load:         ~3500ms
 *   - perf_1m seed (range CTE):      ~300-600ms
 *   - perf_1m range filter SELECT:   ~300ms (COUNT(*) WHERE amount BETWEEN ...)
 *   - perf_1m set filter SELECT:     ~400ms (COUNT(*) WHERE category IN (...))
 *   - perf_1m pattern filter SELECT: ~800ms (COUNT(*) WHERE category LIKE 'cat_1%')
 *   - 100 cached SELECTs:            ~25ms
 *   - 100 uncached COUNT(*):         ~700ms
 *
 * Budgets are 4-5x of the local median to absorb CI / shared-runner
 * variance. The WASM-init budget (4000ms) measures Node `worker_threads`
 * boot — browser cold-start is faster (no `worker_threads` shim overhead)
 * but unmeasurable from Node; defer that to a Playwright follow-up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';
import { loadParquet } from '@/worker/loaders/parquet';
import { QueryCache } from '@/data/QueryCache';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import type { Filter } from '@/filters/FilterTypes';

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

  // ---------------------------------------------------------------------------
  // Phase 9 — 1M-row filter latency. Synthetic seed via DuckDB `range()` so
  // we don't ship a 100MB fixture. Range / set / pattern filters cover the
  // three SQL WHERE shapes most consumers exercise.
  // ---------------------------------------------------------------------------
  describe('1M-row synthetic filter latency', () => {
    beforeAll(async () => {
      await harness.conn.query(`
        CREATE TABLE perf_1m AS
        SELECT
          i AS id,
          (i % 100) AS bucket,
          ('cat_' || (i % 50)) AS category,
          (i * 1.5) AS amount
        FROM range(1000000) t(i)
      `);
    }, 30_000);

    it('range filter (COUNT(*) WHERE amount BETWEEN ...) under 1500ms on 1M rows', async () => {
      const filter: Filter = { type: 'range', column: 'amount', min: 100, max: 1000 };
      const where = filtersToWhereClause([filter]);
      const start = performance.now();
      const result = await harness.conn.query(`SELECT COUNT(*) AS n FROM perf_1m WHERE ${where}`);
      result.toArray();
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1500);
    });

    it('set filter (COUNT(*) WHERE category IN (...)) under 2000ms on 1M rows', async () => {
      const values: string[] = [];
      for (let i = 0; i < 10; i++) values.push(`cat_${i}`);
      const filter: Filter = { type: 'set', column: 'category', values };
      const where = filtersToWhereClause([filter]);
      const start = performance.now();
      const result = await harness.conn.query(`SELECT COUNT(*) AS n FROM perf_1m WHERE ${where}`);
      result.toArray();
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('pattern filter (COUNT(*) WHERE category LIKE ...) under 4000ms on 1M rows', async () => {
      const filter: Filter = {
        type: 'pattern',
        column: 'category',
        pattern: 'cat_1',
        mode: 'starts',
      };
      const where = filtersToWhereClause([filter]);
      const start = performance.now();
      const result = await harness.conn.query(`SELECT COUNT(*) AS n FROM perf_1m WHERE ${where}`);
      result.toArray();
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(4000);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 9 — WASM init baseline. Isolated from the suite-level harness so the
// measurement reflects a true cold start. Uses Node `worker_threads` under
// the hood (faster than browser `new Worker()`); the budget is intentionally
// a regression signal, not a proxy for browser cold-start. Browser cold-start
// is a Playwright follow-up.
// ---------------------------------------------------------------------------
describeIfPerf('Phase 9: WASM init baseline (opt-in via RUN_DUCKDB_PERF=1)', () => {
  it('createNodeDuckDB() instantiates within 4000ms', async () => {
    const start = performance.now();
    const fresh = await createNodeDuckDB();
    const elapsed = performance.now() - start;
    try {
      expect(elapsed).toBeLessThan(4000);
    } finally {
      await fresh.cleanup();
    }
  }, 30_000);
});
