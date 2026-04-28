/**
 * Regression test: re-loading a dataset under the same `tableName` must not
 * throw a DuckDB "Table with name X already exists!" Catalog Error.
 *
 * Each loader (`loadCSV`, `loadJSON`, `loadParquet`) issues its `CREATE
 * TABLE` against DuckDB. Without `OR REPLACE`, the second load with the
 * same `tableName` collides with the first. The fix uses `CREATE OR
 * REPLACE TABLE` so the second load atomically replaces the first.
 *
 * The user-facing repro in the demo (`demo/main.ts`) is: upload file X,
 * make some actions, upload file X again — the demo derives the same
 * content-hash `tableName` and would hit the conflict here. CSV / JSON
 * also support replacing with different content under the same name;
 * Parquet has a separate known DuckDB-WASM limitation around
 * re-registering virtual files with different bytes under the same
 * fileName, so that case isn't exercised here. The demo's content-hash
 * identity guarantees that "different content under same tableName"
 * never happens in practice for any format.
 *
 * Note: each loader call transfers the supplied `ArrayBuffer` into the
 * DuckDB worker (it ends up detached in the test process), so each call
 * below reads a fresh copy from disk rather than reusing a captured
 * buffer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../../helpers/duckdbNode';
import { readBinaryFixture } from '../../helpers/fixtures';

describe('loaders — idempotent reload under the same tableName', () => {
  let harness: NodeDuckDBHarness;
  const ctx = (): { db: NodeDuckDBHarness['db']; conn: NodeDuckDBHarness['conn'] } => ({
    db: harness.db,
    conn: harness.conn,
  });

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('loadCSV — re-loading identical bytes under the same tableName succeeds', async () => {
    const tableName = 'idem_csv_same_bytes';
    const first = await loadCSV(
      await readBinaryFixture('csv', 'titanic'),
      { tableName },
      ctx(),
    );
    const second = await loadCSV(
      await readBinaryFixture('csv', 'titanic'),
      { tableName },
      ctx(),
    );
    expect(first.rowCount).toBe(891);
    expect(second.rowCount).toBe(891);
    expect(second.columns).toEqual(first.columns);
  }, 30_000);

  it('loadCSV — replacing the table with different content under the same name', async () => {
    const tableName = 'idem_csv_replace';
    const first = await loadCSV(
      await readBinaryFixture('csv', 'titanic'),
      { tableName },
      ctx(),
    );
    expect(first.rowCount).toBe(891);

    const second = await loadCSV(
      await readBinaryFixture('csv', 'vins_de_france'),
      { tableName },
      ctx(),
    );
    expect(second.rowCount).toBe(40);
    expect(second.columns).toContain('region');
    expect(second.columns).not.toContain('PassengerId');
  }, 30_000);

  it('loadJSON — re-loading identical bytes under the same tableName succeeds', async () => {
    const tableName = 'idem_json_same_bytes';
    const first = await loadJSON(
      await readBinaryFixture('json', 'titanic'),
      { tableName },
      ctx(),
    );
    const second = await loadJSON(
      await readBinaryFixture('json', 'titanic'),
      { tableName },
      ctx(),
    );
    expect(first.rowCount).toBe(891);
    expect(second.rowCount).toBe(891);
    expect(second.columns).toEqual(first.columns);
  }, 30_000);

  it('loadJSON — replacing the table with different content under the same name', async () => {
    const tableName = 'idem_json_replace';
    const first = await loadJSON(
      await readBinaryFixture('json', 'titanic'),
      { tableName },
      ctx(),
    );
    expect(first.rowCount).toBe(891);

    const second = await loadJSON(
      await readBinaryFixture('json', 'vins_de_france'),
      { tableName },
      ctx(),
    );
    expect(second.rowCount).toBe(40);
    expect(second.columns).toContain('region');
    expect(second.columns).not.toContain('PassengerId');
  }, 30_000);

  it('loadParquet — re-loading identical bytes under the same tableName succeeds', async () => {
    const tableName = 'idem_parquet_same_bytes';
    const first = await loadParquet(
      await readBinaryFixture('parquet', 'titanic'),
      { tableName },
      ctx(),
    );
    const second = await loadParquet(
      await readBinaryFixture('parquet', 'titanic'),
      { tableName },
      ctx(),
    );
    expect(first.rowCount).toBe(891);
    expect(second.rowCount).toBe(891);
    expect(second.columns).toEqual(first.columns);
  }, 30_000);
});
