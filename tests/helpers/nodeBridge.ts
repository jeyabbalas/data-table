/**
 * Node-side adapter that exposes a `WorkerBridge`-shaped `query<T>(sql)`
 * surface backed by a real `AsyncDuckDBConnection`. Intended for Phase 6
 * visualization integration tests that need to drive the histogram /
 * value-counts SQL paths end-to-end without spinning up the worker IPC.
 *
 * Mirrors the conversion the production worker dispatcher performs in
 * `src/worker/duckdb.ts:executeQuery` so result shapes match what
 * `bridge.query<T>(sql)` consumers see at runtime: BigInt → Number,
 * MonthDayNano interval objects → string, everything else preserved.
 *
 * @example
 * ```ts
 * import { createNodeDuckDB } from './duckdbNode';
 * import { makeNodeBridge } from './nodeBridge';
 *
 * const harness = await createNodeDuckDB();
 * await harness.conn.query('CREATE TABLE t AS SELECT * FROM range(10)');
 * const bridge = makeNodeBridge(harness.conn);
 * const rows = await bridge.query<{ range: number }>('SELECT * FROM t');
 * ```
 */
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { convertBigInts } from '@/worker/duckdb';
import type { WorkerBridge } from '@/data/WorkerBridge';

/**
 * Construct a `WorkerBridge`-shaped wrapper around an
 * `AsyncDuckDBConnection` (plus optional `AsyncDuckDB` for export tests).
 * Only `query<T>` and (when `db` is supplied) `exportToBuffer` are
 * implemented; other `WorkerBridge` members are stubbed and surface as
 * `undefined is not a function` if a future test path reaches them.
 *
 * Pass `db` when the test needs the Parquet/CSV `exportToBuffer` path; the
 * harness mirrors the worker dispatcher's COPY (...) TO 'tmp.parquet' →
 * `db.copyFileToBuffer` → `db.dropFile` sequence (`src/worker/dispatcher.ts:235-272`).
 */
export function makeNodeBridge(conn: AsyncDuckDBConnection, db?: AsyncDuckDB): WorkerBridge {
  const stub: Pick<WorkerBridge, 'query' | 'exportToBuffer'> = {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const result = await conn.query(sql);
      return result.toArray().map((row) => convertBigInts(row.toJSON()) as T);
    },
    async exportToBuffer(
      sql: string,
      format: 'parquet',
      _signal?: AbortSignal,
    ): Promise<Uint8Array> {
      if (!db) {
        throw new Error('makeNodeBridge: exportToBuffer requires `db`. Pass it as 2nd argument.');
      }
      // Route through os.tmpdir() because the Node-target DuckDB writes COPY
      // outputs to the real filesystem (no WASM virtual FS). `db.dropFile`
      // only releases the duckdb-wasm reference; it does not unlink from disk.
      // We explicitly fs.unlink in finally to keep the working tree clean.
      const fileName = join(
        tmpdir(),
        `__export_${Date.now()}_${Math.random().toString(36).slice(2)}.${format}`,
      );
      try {
        // SQL string-escaping isn't a concern here — `fileName` comes from
        // os.tmpdir() + Date.now() + Math.random(), no user input.
        await conn.query(`COPY (${sql}) TO '${fileName}' (FORMAT ${format.toUpperCase()})`);
        const buffer = await db.copyFileToBuffer(fileName);
        return new Uint8Array(buffer);
      } finally {
        try {
          await db.dropFile(fileName);
        } catch {
          // duckdb-wasm release; non-fatal.
        }
        try {
          await unlink(fileName);
        } catch {
          // File may not exist if COPY failed before producing it.
        }
      }
    },
  };
  return stub as WorkerBridge;
}
