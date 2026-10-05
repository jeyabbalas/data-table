/**
 * Node-side adapter that exposes a `WorkerBridge`-shaped `query<T>(sql)`
 * surface backed by a real `AsyncDuckDBConnection`. Intended for Phase 6
 * visualization integration tests that need to drive the histogram /
 * value-counts SQL paths end-to-end without spinning up the worker IPC.
 *
 * Mirrors the conversion the production worker dispatcher performs in
 * `src/worker/duckdb.ts:executeQuery` (`convertRow`) so result shapes match
 * what `bridge.query<T>(sql)` consumers see at runtime: BigInt → Number,
 * MonthDayNano interval objects → string, list values → arrays, STRUCT and
 * MAP values → objects, everything else preserved.
 *
 * With `db`, `loadData` loads a source through the real loaders, as the
 * worker does for `WorkerBridge.loadData`.
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
 *
 * const loader = makeNodeBridge(harness.conn, harness.db);
 * const { tableName, schema } = await loader.loadData(parquetBytes, { format: 'parquet' });
 * ```
 */
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { reconstructError } from '@/core/errors';
import { validateSourceOptions } from '@/data/sourceOptions';
import { toErrorPayload } from '@/worker/dispatcher';
import { convertRow } from '@/worker/duckdb';
import { loadCSV } from '@/worker/loaders/csv';
import { loadJSON } from '@/worker/loaders/json';
import { loadParquet } from '@/worker/loaders/parquet';
import type { LoadResult } from '@/worker/loaders/types';
import type { LoadDataResult, LoadOptions, WorkerBridge } from '@/data/WorkerBridge';

/**
 * Construct a `WorkerBridge`-shaped wrapper around an
 * `AsyncDuckDBConnection` (plus optional `AsyncDuckDB` for export and load
 * tests). Only `query<T>` and (when `db` is supplied) `exportToBuffer` and
 * `loadData` are implemented; other `WorkerBridge` members are stubbed and
 * surface as `undefined is not a function` if a future test path reaches
 * them.
 *
 * Pass `db` when the test needs the Parquet/CSV `exportToBuffer` path; the
 * harness mirrors the worker dispatcher's COPY (...) TO 'tmp.parquet' →
 * `db.copyFileToBuffer` → `db.dropFile` sequence (`src/worker/dispatcher.ts:235-272`).
 *
 * Pass `db` for `loadData` too. It checks the options as `WorkerBridge.loadData`
 * does, runs the format's loader (`loadCSV` / `loadJSON` / `loadParquet`) as
 * the dispatcher's `load` case does, and rejects with the typed error the
 * bridge would rebuild from the worker's reply (a `LoadError` for `LOAD_*`
 * codes). It reports no progress and cannot be cancelled, and it reads a
 * `Blob` into memory first: the Node target cannot read browser file handles.
 */
export function makeNodeBridge(conn: AsyncDuckDBConnection, db?: AsyncDuckDB): WorkerBridge {
  const stub: Pick<WorkerBridge, 'query' | 'exportToBuffer' | 'loadData'> = {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const result = await conn.query(sql);
      return result.toArray().map((row) => convertRow(row.toJSON()) as T);
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
    async loadData(
      source: ArrayBuffer | string | Blob,
      options: LoadOptions,
    ): Promise<LoadDataResult> {
      if (!db) {
        throw new Error('makeNodeBridge: loadData requires `db`. Pass it as 2nd argument.');
      }
      // As WorkerBridge.loadData: only these options go on, checked first.
      const { format, tableName, timezone, csv, json, parquet } = options;
      validateSourceOptions({ timezone, csv, json, parquet });
      const data = source instanceof Blob ? await source.arrayBuffer() : source;
      const context = { db, conn };

      // As the dispatcher's `load` case.
      let result: LoadResult;
      try {
        if (format === 'csv') {
          result = await loadCSV(data, { ...csv, tableName, timezone }, context);
        } else if (format === 'json') {
          result = await loadJSON(data, { ...json, tableName, timezone }, context);
        } else if (format === 'parquet') {
          const bytes = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
          result = await loadParquet(bytes, { ...parquet, tableName, timezone }, context);
        } else {
          throw Object.assign(new Error(`Format '${String(format)}' not yet supported`), {
            code: 'LOAD_FORMAT_UNSUPPORTED',
          });
        }
      } catch (error) {
        // The worker replies with this payload, and the bridge rebuilds a
        // typed error from it.
        throw reconstructError(toErrorPayload(error, 'Failed to load data', 'LOAD_PARSE_FAILED'));
      }

      return {
        tableName: result.tableName,
        rowCount: result.rowCount,
        columns: result.columns,
        schema: result.schema,
      };
    },
  };
  return stub as WorkerBridge;
}
