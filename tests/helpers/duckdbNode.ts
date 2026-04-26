/**
 * Node-side DuckDB harness for integration tests.
 *
 * Builds a real `AsyncDuckDB` + `AsyncDuckDBConnection` pair against the
 * `@duckdb/duckdb-wasm` Node target, suitable for driving the loaders
 * (`loadCSV` / `loadJSON` / `loadParquet`) directly without going through
 * the worker IPC.
 *
 * The package's published `createWorker` resolves the worker source via
 * `fetch`, which Node does not implement for `file://` URLs. We bypass
 * that by spawning a `worker_threads.Worker` whose entry is a tiny
 * bootstrap script (`duckdbNodeWorkerBoot.cjs`) that installs the
 * DOM-Worker shape on `global` and then `require`s the actual duckdb
 * worker module.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';

import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

const requireCjs = createRequire(import.meta.url);
const duckdb = requireCjs(
  '@duckdb/duckdb-wasm/dist/duckdb-node.cjs',
) as typeof import('@duckdb/duckdb-wasm');
const distDir = dirname(requireCjs.resolve('@duckdb/duckdb-wasm/dist/duckdb-node.cjs'));
const bootScriptPath = join(dirname(fileURLToPath(import.meta.url)), 'duckdbNodeWorkerBoot.cjs');

const NODE_BUNDLES = {
  mvp: {
    mainModule: join(distDir, 'duckdb-mvp.wasm'),
    mainWorker: join(distDir, 'duckdb-node-mvp.worker.cjs'),
  },
  eh: {
    mainModule: join(distDir, 'duckdb-eh.wasm'),
    mainWorker: join(distDir, 'duckdb-node-eh.worker.cjs'),
  },
};

/**
 * DOM-Worker shim wrapping `worker_threads.Worker`. duckdb-wasm's
 * `AsyncDuckDB` expects `addEventListener` / `removeEventListener` /
 * `postMessage` / `terminate`.
 */
class DomWorkerShim {
  private inner: NodeWorker;
  private listeners = new Map<string, Array<(event: { type: string; data: unknown }) => void>>();

  constructor(scriptPath: string, workerData: { mod: string }) {
    this.inner = new NodeWorker(scriptPath, { workerData });
    this.inner.on('message', (data: unknown) => this.dispatch('message', data));
    this.inner.on('error', (err: unknown) => this.dispatch('error', err));
    this.inner.on('exit', () => this.dispatch('close', null));
  }

  private dispatch(type: string, data: unknown): void {
    const event = { type, data, target: this, currentTarget: this };
    const onProp = (this as unknown as Record<string, unknown>)['on' + type];
    if (typeof onProp === 'function') {
      try {
        (onProp as (e: typeof event) => void).call(this, event);
      } catch (e) {
        console.error(e);
      }
    }
    const arr = this.listeners.get(type);
    if (arr) {
      for (const fn of [...arr]) {
        try {
          fn.call(this, event);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  addEventListener(type: string, fn: (event: { type: string; data: unknown }) => void): void {
    let arr = this.listeners.get(type);
    if (!arr) this.listeners.set(type, (arr = []));
    arr.push(fn);
  }

  removeEventListener(type: string, fn: (event: { type: string; data: unknown }) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  postMessage(msg: unknown, transfer?: ReadonlyArray<unknown>): void {
    this.inner.postMessage(msg, transfer as readonly Transferable[] | undefined);
  }

  terminate(): Promise<number> {
    return this.inner.terminate();
  }
}

export interface NodeDuckDBHarness {
  db: AsyncDuckDB;
  conn: AsyncDuckDBConnection;
  cleanup: () => Promise<void>;
}

/**
 * Construct a real DuckDB-WASM instance using the Node target and a
 * `worker_threads.Worker`. Tests that don't share an instance pay a
 * ~300-800ms startup; cache via a module-level memoization in the
 * test file when possible (cf. tests/worker/loaders/csv.integration.test.ts).
 */
export async function createNodeDuckDB(): Promise<NodeDuckDBHarness> {
  const bundle = await duckdb.selectBundle(NODE_BUNDLES);
  if (!bundle.mainWorker) {
    throw new Error('selectBundle returned a bundle without mainWorker');
  }
  const worker = new DomWorkerShim(bootScriptPath, { mod: bundle.mainWorker });
  const logger = new duckdb.VoidLogger();
  // The shim is structurally a DOM Worker; the AsyncDuckDB constructor
  // accepts that contract.
  const db = new duckdb.AsyncDuckDB(logger, worker as unknown as Worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({ query: { castDecimalToDouble: true } });
  const conn = await db.connect();

  const cleanup = async (): Promise<void> => {
    try {
      await conn.close();
    } catch {
      // ignore — already closed
    }
    try {
      await db.terminate();
    } catch {
      // ignore — terminate will eventually exit the worker
    }
  };

  return { db, conn, cleanup };
}
