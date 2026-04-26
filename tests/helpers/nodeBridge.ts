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
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { convertBigInts } from '@/worker/duckdb';
import type { WorkerBridge } from '@/data/WorkerBridge';

/**
 * Construct a `WorkerBridge`-shaped wrapper around an
 * `AsyncDuckDBConnection`. Only the `query<T>` method is implemented; other
 * `WorkerBridge` members are stubbed with no-ops or throw on use, since
 * Phase 6 viz tests never call them.
 */
export function makeNodeBridge(conn: AsyncDuckDBConnection): WorkerBridge {
  const stub: Pick<WorkerBridge, 'query'> = {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const result = await conn.query(sql);
      return result.toArray().map((row) => convertBigInts(row.toJSON()) as T);
    },
  };
  // Cast is safe: the histogram / value-counts data fetchers consume only
  // `bridge.query`. If a future test path reaches another method, the cast
  // surfaces it as `undefined is not a function` rather than silent breakage.
  return stub as WorkerBridge;
}
