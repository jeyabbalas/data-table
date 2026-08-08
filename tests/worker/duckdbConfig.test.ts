/**
 * Phase 1 — the engine settings the worker chooses, and the one it does not.
 *
 * `initializeDuckDB` itself needs a browser `Worker`, so what is testable in
 * Node is the part that matters: that the value shipped is one this DuckDB
 * build accepts, and that the row-identity contract the *unset* knob protects
 * actually holds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DUCKDB_MEMORY_LIMIT, getConfiguredMemoryLimit } from '@/worker/duckdb';
import { loadCSV } from '@/worker/loaders/csv';

import { resolveTier, tierCSV } from '../fixtures/tiers';
import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';

/**
 * Deep enough that a parallel scan would have something to re-order, narrow
 * enough to stay cheap. Class 0 (`col_0`) is `CAST(i AS INTEGER)` — the
 * source row index — which makes it an exact oracle for `__rowid__`.
 */
const TIER = resolveTier('custom', { rows: 50_000, cols: 6, seed: 1 });

describe('DuckDB engine configuration', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('reports no configured limit until initialization runs', () => {
    // The Node harness builds its own connection and never calls
    // `initializeDuckDB`, so this is the uninitialized state by construction.
    expect(getConfiguredMemoryLimit()).toBeNull();
  });

  it('ships a memory limit this DuckDB build accepts', async () => {
    await expect(
      harness.conn.query(`SET memory_limit = '${DUCKDB_MEMORY_LIMIT}'`),
    ).resolves.toBeDefined();

    const result = await harness.conn.query(`SELECT current_setting('memory_limit') AS v`);
    const value = String(result.toArray()[0]?.toJSON().v ?? '');
    // DuckDB normalizes and rounds what it reads back ('2.5GB' returns as
    // '2.3 GiB'), so the assertion is that the setting took, not that the
    // string round-trips.
    expect(value).not.toBe('');
    expect(value.toLowerCase()).not.toContain('unlimited');
  });

  it('assigns __rowid__ in source order', async () => {
    // This is why `preserve_insertion_order` is left at its default. The
    // loader derives row identity from `row_number() OVER ()` over the scan,
    // so turning that knob off would make `__rowid__` depend on scan order —
    // silently, and only on a build with more than one thread. Measured on
    // DuckDB-WASM 1.33.1-dev57.0 the knob changes nothing either way,
    // because the buffering it skips only exists to re-order parallel output.
    await loadCSV(
      tierCSV(TIER),
      { tableName: 'rowid_order' },
      { db: harness.db, conn: harness.conn },
    );

    const mismatches = await harness.conn.query(
      `SELECT COUNT(*) AS n FROM "rowid_order" WHERE "col_0" <> "__rowid__"`,
    );
    expect(Number(mismatches.toArray()[0]?.toJSON().n)).toBe(0);

    const bounds = await harness.conn.query(
      `SELECT MIN("__rowid__") AS lo, MAX("__rowid__") AS hi, COUNT(*) AS n FROM "rowid_order"`,
    );
    const { lo, hi, n } = bounds.toArray()[0]!.toJSON() as Record<string, unknown>;
    expect(Number(lo)).toBe(0);
    expect(Number(hi)).toBe(TIER.rows - 1);
    expect(Number(n)).toBe(TIER.rows);
  }, 120_000);
});
