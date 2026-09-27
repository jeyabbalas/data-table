/**
 * LOAD_MEMORY_EXCEEDED across the worker boundary, end to end: WorkerBridge
 * → the real dispatcher and Parquet loader on a real DuckDB (Node target) →
 * the error payload → the LoadError the bridge rejects with.
 *
 * Only `code`, `message` and `details` survive postMessage, so an `Error`'s
 * `cause` never reaches the main thread. These tests check that what callers
 * of `bridge.loadData` / `table.loadData` actually get carries DuckDB's
 * message and the numbers behind a rejection. Messages are structured-cloned
 * in both directions, as a real Worker would.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { LoadError } from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';
import { handleMessage } from '@/worker/dispatcher';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

// The dispatcher and loaders reach DuckDB through these module singletons;
// point them at the Node harness.
const duckdb = vi.hoisted(() => ({ harness: null as NodeDuckDBHarness | null }));
vi.mock('@/worker/duckdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/worker/duckdb')>()),
  isInitialized: () => duckdb.harness !== null,
  getConnection: () => duckdb.harness!.conn,
  getDatabase: () => duckdb.harness!.db,
}));

describe('WorkerBridge.loadData — LOAD_MEMORY_EXCEEDED end to end', () => {
  let harness: NodeDuckDBHarness;
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;
  const files: string[] = [];

  async function parquet(select: string, rowGroupSize = 122_880): Promise<ArrayBuffer> {
    const path = join(tmpdir(), `dt_bridge_budget_${process.pid}_${files.length}.parquet`);
    files.push(path);
    await harness.conn.query(
      `COPY (${select}) TO '${path}' (FORMAT parquet, ROW_GROUP_SIZE ${rowGroupSize})`,
    );
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  /** Run `fn` under a lower memory limit; see memoryBudget.duckdb.test.ts. */
  async function withMemoryLimit(limit: string, fn: () => Promise<void>): Promise<void> {
    const result = await harness.conn.query("SELECT current_setting('memory_limit') AS m");
    const original = String(result.toArray()[0]?.toJSON().m);
    await harness.conn.query(`SET memory_limit = '${limit}'`);
    try {
      await fn();
    } finally {
      await harness.conn.query(`SET memory_limit = '${original}'`);
    }
  }

  async function loadError(data: ArrayBuffer): Promise<LoadError> {
    const error = await bridge.loadData(data, { format: 'parquet' }).then(
      () => {
        throw new Error('expected the load to reject');
      },
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(LoadError);
    return error as LoadError;
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    duckdb.harness = harness;
    mock = createMockWorker({
      onMessage: (message) => {
        if (message.type !== 'load') return null; // `init` is answered by the mock
        void handleMessage(structuredClone(message), (id, type, payload) =>
          mock.sendFromWorker({ id, type, payload: structuredClone(payload) }),
        );
        return null;
      },
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  }, 30_000);

  afterAll(async () => {
    bridge?.terminate();
    duckdb.harness = null;
    await harness?.cleanup();
    await Promise.all(files.map((f) => unlink(f).catch(() => {})));
  });

  it("carries DuckDB's out-of-memory message when the load runs out partway", async () => {
    // Short text in the sampled rows, 1 KB strings after: the estimate
    // passes and DuckDB runs out building the table.
    const data = await parquet(
      `SELECT CASE WHEN range < 4096 THEN 'x' ELSE repeat('y', 1000) || range END AS body
       FROM range(200000)`,
      4096,
    );
    let error!: LoadError;
    await withMemoryLimit('64MB', async () => {
      error = await loadError(data);
    });

    expect(error.code).toBe('LOAD_MEMORY_EXCEEDED');
    expect(error.details).toMatchObject({
      stage: 'load',
      rows: 200_000,
      columns: 1,
      duckdbMessage: expect.stringMatching(/^Out of Memory Error: /),
    });
    expect(error.message).toMatch(
      /^Ran out of memory loading this Parquet file \(200,000 rows × 1 columns, about .+ once loaded\)\. DuckDB: Out of Memory Error: /,
    );
  }, 60_000);

  it('names the check and its numbers when the estimate rejects the load', async () => {
    const data = await parquet('SELECT range AS a, random() AS b FROM range(1000000)');
    let error!: LoadError;
    await withMemoryLimit('16MB', async () => {
      error = await loadError(data);
    });

    expect(error.code).toBe('LOAD_MEMORY_EXCEEDED');
    const details = error.details as Record<string, number | string>;
    expect(details).toMatchObject({ stage: 'estimate', check: 'table', rows: 1_000_000 });
    expect(details['neededBytes']).toBeGreaterThan(Number(details['availableBytes']));
    expect(error.message).toMatch(/need about \d+ MiB once loaded, more than the \d+ MiB/);
  }, 60_000);
});
