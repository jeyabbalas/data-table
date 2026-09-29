import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import {
  ConfigurationError,
  QueryError,
  WorkerInitError,
  WorkerTerminatedError,
  reconstructError,
} from '../core/errors';
import type { ProgressInfo, ProgressCallback } from '../core/Progress';
import type { ColumnSchema } from '../core/types';
import type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  ErrorPayload,
  InitPayload,
  QueryPayload,
  LoadPayload,
  ExportPayload,
} from '../worker/types';
import { QueryCache, type QueryCacheOptions } from './QueryCache';
import { validateSourceOptions, type SourceOptions } from './sourceOptions';

// Re-export for convenience
export type { ProgressInfo, ProgressCallback } from '../core/Progress';

/**
 * Low-level options accepted by {@link WorkerBridge.loadData}: the format,
 * the table name, and how the source is read, per format (the fields of
 * {@link SourceOptions}). Most consumers use the higher-level
 * `table.loadData(source, opts?)` facade instead, which builds these from a
 * `File` / URL / Blob input and its `sourceOptions`.
 */
export interface LoadOptions extends SourceOptions {
  format: 'csv' | 'json' | 'parquet';
  tableName?: string | undefined;
}

/**
 * Outcome of a successful {@link WorkerBridge.loadData}: the DuckDB table
 * name, the row count, the column-name list, and the resolved schema.
 * Internally maps to the public `loadComplete` event payload.
 */
export interface LoadDataResult {
  tableName: string;
  rowCount: number;
  columns: string[];
  schema: ColumnSchema[];
}

/**
 * Options for {@link WorkerBridge.query}.
 */
export interface QueryOptions {
  /**
   * Set `false` to bypass the SQL result cache — both the read (a cached
   * result is ignored) and the write (the fresh result is not stored).
   * Default: SELECT queries are cached.
   */
  cache?: boolean;
  /**
   * Worker queue priority. `'high'` jumps queued `'normal'` work (e.g.
   * stats/histogram queries) in the worker's serial dispatch queue —
   * intended for viewport row fetches. Default `'normal'`.
   */
  priority?: 'high' | 'normal';
}

/**
 * Construction options for {@link WorkerBridge}.
 */
export interface WorkerBridgeOptions {
  /** Query cache configuration (LRU size, TTL). */
  cache?: Partial<QueryCacheOptions> | undefined;
  /**
   * Maximum time (ms) to wait for the worker to signal ready and for
   * DuckDB to initialize. Rejects `initialize()` with a descriptive
   * error if exceeded. Default: 30000.
   */
  initializeTimeoutMs?: number | undefined;
  /**
   * Custom worker factory. Takes precedence over {@link workerUrl} and the
   * built-in default. Useful for strict-CSP / bundler-specific deployments
   * where the default `new Worker(new URL(...), { type: 'module' })` cannot
   * be used. The caller is responsible for passing `{ type: 'module' }`.
   *
   * **Trust boundary.** The returned `Worker` runs JavaScript with full
   * access to the calling page's origin. Treat this option as
   * developer-controlled — never invoke the factory with values derived
   * from end-user input.
   */
  workerFactory?: (() => Worker) | undefined;
  /**
   * Custom URL/path for the worker script. Instantiated via
   * `new Worker(workerUrl, { type: 'module' })`. Ignored if
   * {@link workerFactory} is set.
   *
   * **Trust boundary.** The library does NOT validate the scheme, origin,
   * or content-type of `workerUrl`. Passing user-derived input here lets
   * an attacker run arbitrary JavaScript in your origin. Pin to a static
   * same-origin URL (or one served with appropriate CORS headers).
   */
  workerUrl?: string | URL | undefined;
  /**
   * DuckDB WASM bundles override for offline / self-hosted deployments.
   * Forwarded to the worker on init; when omitted the worker falls back
   * to `getJsDelivrBundles()`.
   *
   * **Trust boundary.** The bundle URLs are passed verbatim to
   * `@duckdb/duckdb-wasm`'s `selectBundle`, which `fetch`-es them and
   * instantiates WASM. Treat as developer-controlled — never derived from
   * end-user input. See `docs/integrations/csp-and-offline.md` for the
   * recommended self-hosting pattern.
   */
  duckdbBundles?: DuckDBBundles | undefined;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback | undefined;
  signal?: AbortSignal | undefined;
  abortHandler?: (() => void) | null | undefined;
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000;

/**
 * Promise-based RPC layer between the main thread and the DuckDB Web Worker.
 *
 * `createDataTable()` constructs one internally. Construct your own and pass
 * it via `createDataTable({ bridge })` to share a single worker (and therefore
 * a single DuckDB context) across multiple tables on a page, or to override
 * `workerFactory` / `workerUrl` / `duckdbBundles` for strict-CSP and
 * air-gapped deployments.
 *
 * @example
 * import { WorkerBridge, createDataTable } from '@jeyabbalas/data-table';
 *
 * const bridge = new WorkerBridge();
 * await bridge.initialize();
 *
 * const t1 = await createDataTable({ container: '#one', data: csv1, bridge });
 * const t2 = await createDataTable({ container: '#two', data: csv2, bridge });
 *
 * // Later, on full-page teardown:
 * await t1.destroy();
 * await t2.destroy();
 * bridge.terminate();
 *
 * @see WorkerBridgeOptions
 * @see createDataTable
 */
export class WorkerBridge {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageId = 0;
  private initPromise: Promise<void> | null = null;
  private queryCache: QueryCache;
  private initializeTimeoutMs: number;
  private workerFactory?: (() => Worker) | undefined;
  private workerUrl?: string | URL | undefined;
  private duckdbBundles?: DuckDBBundles | undefined;
  /** Why the worker failed, until `initialize()` starts another; see {@link failWorker}. */
  private workerFailure: WorkerInitError | null = null;
  /** Rejects the `initialize()` still waiting for its worker, if any. */
  private rejectInit: ((error: Error) => void) | null = null;
  /** Told when the worker fails; see {@link onWorkerFailure}. */
  private readonly failureListeners = new Set<(error: WorkerInitError) => void>();

  constructor(options?: WorkerBridgeOptions) {
    this.queryCache = new QueryCache(options?.cache);
    this.initializeTimeoutMs = options?.initializeTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    this.workerFactory = options?.workerFactory;
    this.workerUrl = options?.workerUrl;
    this.duckdbBundles = options?.duckdbBundles;
  }

  /**
   * Construct the Worker using (in priority) workerFactory, workerUrl, or
   * the built-in default. Failures are wrapped in `WorkerInitError` with a
   * `source` discriminator on `details` so consumers can tell factory/url
   * mistakes from runtime crashes.
   */
  private createWorker(): Worker {
    if (this.workerFactory) {
      try {
        const w = this.workerFactory();
        if (!w || typeof w.postMessage !== 'function') {
          throw new Error('workerFactory returned a non-Worker value');
        }
        return w;
      } catch (err) {
        throw new WorkerInitError(
          `Custom workerFactory failed: ${err instanceof Error ? err.message : String(err)}`,
          {
            code: 'WORKER_CRASHED',
            cause: err,
            details: { source: 'workerFactory' },
          },
        );
      }
    }
    if (this.workerUrl !== undefined) {
      try {
        return new Worker(this.workerUrl, { type: 'module' });
      } catch (err) {
        throw new WorkerInitError(
          `Failed to construct worker from workerUrl: ${err instanceof Error ? err.message : String(err)}`,
          {
            code: 'WORKER_CRASHED',
            cause: err,
            details: { source: 'workerUrl', workerUrl: String(this.workerUrl) },
          },
        );
      }
    }
    return new Worker(new URL('../worker/worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  /**
   * Create the worker and wait for it to be ready.
   *
   * Rejects with a descriptive error if the worker fails to signal ready
   * or DuckDB fails to initialize within `initializeTimeoutMs` (default 30s).
   *
   * If the worker fails later, with an error it does not catch, every
   * pending request rejects with a `WorkerInitError` whose code is
   * `WORKER_CRASHED`, and so does every later call, until `initialize()` is
   * called again: it starts a new worker, with an empty database.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (this.rejectInit === rejectThis) this.rejectInit = null;
        fn();
      };
      // For terminate(), so an init it cuts short settles now, not at its
      // timeout.
      const rejectThis = (error: Error) => settle(() => reject(error));
      this.rejectInit = rejectThis;
      // The worker this call creates. Its handlers act only while it is
      // still the bridge's: a worker terminated, or replaced by a later
      // initialize(), has nothing left to fail.
      let worker: Worker | null = null;
      const isCurrent = (): boolean => worker !== null && this.worker === worker;

      const timeoutHandle = setTimeout(() => {
        settle(() => {
          // Tear down the half-initialized worker so a later retry can rebuild.
          if (isCurrent()) {
            worker!.terminate();
            this.worker = null;
            this.initPromise = null;
          }
          reject(
            new WorkerInitError(
              `WorkerBridge.initialize() timed out after ${this.initializeTimeoutMs}ms ` +
                `(worker did not reach ready state or DuckDB failed to init). ` +
                `If your app bundles the worker separately, verify it can import @duckdb/duckdb-wasm.`,
              {
                code: 'WORKER_INIT_TIMEOUT',
                details: { timeoutMs: this.initializeTimeoutMs },
              },
            ),
          );
        });
      }, this.initializeTimeoutMs);

      try {
        this.workerFailure = null;
        worker = this.createWorker();
        this.worker = worker;

        worker.onmessage = this.handleMessage.bind(this);
        // An error event is an exception the worker did not catch, or a
        // script that failed to load, during init or at any time after.
        worker.onerror = (event) => {
          // A script that fails to load fires a plain Event, with no message.
          const message = event.message
            ? `Worker error: ${event.message}`
            : `The worker script failed to load${this.workerFactory || this.workerUrl === undefined ? '' : ` (${String(this.workerUrl)})`}`;
          const error = new WorkerInitError(message, {
            code: 'WORKER_CRASHED',
            cause: event,
          });
          settle(() => reject(error));
          if (isCurrent()) this.failWorker(error);
        };
        worker.onmessageerror = () => {
          if (!isCurrent()) return;
          this.rejectUnattributedReply('A message from the worker could not be deserialized', {
            reason: 'messageerror',
          });
        };

        // Wait for worker ready signal
        const readyHandler = (event: MessageEvent<WorkerResponse>) => {
          if ((event.data as { id?: unknown } | null)?.id === '__ready__') {
            worker!.removeEventListener('message', readyHandler);
            // Now initialize DuckDB — forward optional bundles override.
            const initPayload: InitPayload = this.duckdbBundles
              ? { bundles: this.duckdbBundles }
              : {};
            this.sendMessage('init', initPayload)
              .then(() => settle(() => resolve()))
              .catch((err) => settle(() => reject(err)));
          }
        };
        worker.addEventListener('message', readyHandler);
      } catch (error) {
        settle(() => reject(error));
      }
    });

    return this.initPromise;
  }

  /**
   * Execute a SQL query.
   *
   * SELECT results are served from and stored into the bridge's LRU+TTL
   * cache unless `options.cache === false`. `options.priority: 'high'`
   * makes the worker run this query ahead of queued normal-priority work
   * (viewport row fetches use this so they are not stuck behind
   * stats/histogram fan-outs).
   *
   * @param sql SQL text to execute.
   * @param signal Optional abort signal; aborting rejects with
   *   `QUERY_ABORTED` and posts a targeted cancel to the worker.
   * @param options Cache and priority behavior — see {@link QueryOptions}.
   *
   * @example
   * // Viewport row fetch: skip the cache, jump the queue, abortable.
   * const rows = await bridge.query(sql, controller.signal, {
   *   cache: false,
   *   priority: 'high',
   * });
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    signal?: AbortSignal,
    options?: QueryOptions,
  ): Promise<T[]> {
    this.ensureInitialized();

    // Only cache SELECT queries, and only when not explicitly bypassed.
    const cacheable = options?.cache !== false && this.isCacheable(sql);
    if (cacheable) {
      const cached = this.queryCache.get<T>(sql);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Conditional spread keeps the wire payload minimal (and satisfies
    // exactOptionalPropertyTypes — no explicit `priority: undefined`).
    const payload: QueryPayload = {
      sql,
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    };
    const result = await this.sendMessage('query', payload, undefined, signal);
    const rows = (result as { rows: T[] }).rows;

    // Store in cache if cacheable and not aborted
    if (cacheable && !signal?.aborted) {
      this.queryCache.set(sql, rows);
    }

    return rows;
  }

  /**
   * Load data into DuckDB
   *
   * Returns table name, row count, columns, and full schema info.
   * All metadata queries happen in the worker to avoid blocking the main thread.
   *
   * Pass a Parquet source as a `Blob` or `File` where you can: DuckDB then
   * reads it from disk as it loads, instead of holding the whole file in
   * memory next to the table. A load that would not fit in memory rejects
   * with a `LoadError` whose code is `LOAD_MEMORY_EXCEEDED`.
   *
   * How the source is read (`timezone`, `csv`, `json`, `parquet`) is checked
   * before anything is sent: a bad value rejects with a `LoadError` whose
   * code is `LOAD_INVALID_OPTIONS` or `LOAD_INVALID_TIMEZONE`. Each format's
   * options go in its own entry, `{ format: 'csv', csv: { delimiter: ';' } }`:
   * any other key here, such as a `delimiter` next to `format`, is ignored.
   */
  async loadData(
    source: ArrayBuffer | string | Blob,
    options: LoadOptions,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<LoadDataResult> {
    this.ensureInitialized();

    // Only these four: other keys were always ignored here.
    const { format, tableName, timezone, csv, json, parquet } = options;
    const sourceOptions: SourceOptions = { timezone, csv, json, parquet };
    validateSourceOptions(sourceOptions);
    const payload: LoadPayload = { data: source, format, tableName, ...sourceOptions };
    const result = (await this.sendMessage('load', payload, onProgress, signal)) as {
      tableName: string;
      rowCount: number;
      columns: string[];
      schema: ColumnSchema[];
    };

    return {
      tableName: result.tableName,
      rowCount: result.rowCount,
      columns: result.columns,
      schema: result.schema,
    };
  }

  /**
   * Export data to a binary file format via DuckDB COPY TO.
   *
   * The SQL query is wrapped in COPY (...) TO on the worker side.
   * Returns the file contents as a Uint8Array.
   */
  async exportToBuffer(sql: string, format: 'parquet', signal?: AbortSignal): Promise<Uint8Array> {
    this.ensureInitialized();

    const payload: ExportPayload = { sql, format };
    const result = await this.sendMessage('export', payload, undefined, signal);
    return new Uint8Array((result as { buffer: ArrayBuffer }).buffer);
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    this.workerFailure = null;
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.initPromise = null;

    this.rejectInit?.(new WorkerTerminatedError('Worker terminated during initialization'));
    this.rejectPending(() => new WorkerTerminatedError('Worker terminated'));
    this.queryCache.clear();
  }

  /**
   * Call `listener` when the worker fails, with the error every pending and
   * later request then rejects with, whose code is `WORKER_CRASHED`. A table
   * reports the failure once this way, rather than once for each query that
   * fails after it. Returns a function that removes the listener.
   *
   * @internal
   */
  onWorkerFailure(listener: (error: WorkerInitError) => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  /**
   * Clear all cached query results
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  /**
   * Drop a table from DuckDB if it exists. The identifier is double-quoted
   * (matching the worker-side loaders), so any tableName the bridge issued
   * to a `loadData` call is safe to pass back here.
   *
   * Idempotent — a missing table is not an error. Used by `DataTable` to
   * reclaim the previous base table on reload and on `destroy()` over a
   * shared bridge. Exposed publicly so consumers managing ad-hoc tables
   * via `bridge.query('CREATE TABLE …')` have a symmetric drop helper
   * without re-implementing identifier quoting.
   */
  async dropTable(tableName: string): Promise<void> {
    this.ensureInitialized();
    const quoted = `"${tableName.replace(/"/g, '""')}"`;
    await this.query(`DROP TABLE IF EXISTS ${quoted}`);
  }

  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null && this.initPromise !== null;
  }

  private ensureInitialized(): void {
    if (this.workerFailure) {
      throw new WorkerInitError(
        `The DuckDB worker failed (${this.workerFailure.message}): every table loaded ` +
          'through this bridge is gone. Call initialize() to start a new worker.',
        { code: 'WORKER_CRASHED', cause: this.workerFailure },
      );
    }
    if (!this.worker) {
      throw new ConfigurationError('WorkerBridge not initialized. Call initialize() first.', {
        code: 'BRIDGE_NOT_READY',
      });
    }
  }

  /**
   * The worker failed. It may have stopped, or it may run on without the
   * reply it owed some request, so it is terminated and every pending
   * request rejected with `error`. Later calls reject at once, until
   * `initialize()` starts a new worker.
   */
  private failWorker(error: WorkerInitError): void {
    this.workerFailure = error;
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
    this.rejectPending(() => error);
    this.queryCache.clear();
    for (const listener of [...this.failureListeners]) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[WorkerBridge] a worker-failure listener threw:', listenerError);
      }
    }
  }

  /**
   * A reply was lost, with no telling whose: a message that could not be
   * deserialized, or one without a string id. Every pending request is
   * rejected, and cancelled in the worker, rather than one of them left
   * waiting for good. The worker itself carries on.
   */
  private rejectUnattributedReply(message: string, details: Record<string, unknown>): void {
    const ids = this.rejectPending(
      () => new WorkerInitError(message, { code: 'WORKER_PROTOCOL_VIOLATION', details }),
    );
    for (const id of ids) this.postCancel(id);
  }

  /**
   * Reject every pending request, releasing their abort listeners so that
   * long-lived AbortSignals reused by the embedder don't accumulate
   * handlers across bridge lifetimes. Returns the ids rejected.
   */
  private rejectPending(makeError: () => Error): string[] {
    const ids = Array.from(this.pendingRequests.keys());
    for (const id of ids) {
      const request = this.pendingRequests.get(id);
      if (!request) continue;
      this.cleanupRequest(id);
      request.reject(makeError());
    }
    return ids;
  }

  /** Ask the worker to drop the request `targetId`, queued or running. */
  private postCancel(targetId: string): void {
    const cancelMessage: WorkerMessage = {
      id: this.generateId(),
      type: 'cancel',
      payload: { targetId },
    };
    this.worker?.postMessage(cancelMessage);
  }

  private isCacheable(sql: string): boolean {
    return sql.trimStart().toUpperCase().startsWith('SELECT');
  }

  private generateId(): string {
    return `msg-${++this.messageId}`;
  }

  private sendMessage(
    type: WorkerMessageType,
    payload: unknown,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();

      // Handle abort signal
      let abortHandler: (() => void) | null = null;
      if (signal) {
        if (signal.aborted) {
          reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
          return;
        }

        abortHandler = () => {
          // cleanupRequest also removes this very listener from the signal,
          // preventing handler leaks when the same AbortSignal is reused
          // across many aborted requests.
          this.cleanupRequest(id);
          this.postCancel(id);
          reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
        };
        signal.addEventListener('abort', abortHandler);
      }

      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress,
        signal,
        abortHandler,
      });

      const message: WorkerMessage = { id, type, payload };
      try {
        this.worker!.postMessage(message);
      } catch (error) {
        // A payload that cannot be cloned (a detached ArrayBuffer, say)
        // never reaches the worker, so no reply will come for it.
        this.cleanupRequest(id);
        reject(error);
      }
    });
  }

  /** Remove the abort listener for a completed request. */
  private cleanupRequest(id: string): void {
    const request = this.pendingRequests.get(id);
    if (request?.signal && request.abortHandler) {
      request.signal.removeEventListener('abort', request.abortHandler);
    }
    this.pendingRequests.delete(id);
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    // Defense in depth: the worker is library-controlled, but a hostile
    // workerFactory / cross-origin worker could deliver malformed messages.
    // Reject anything that doesn't match the expected `{ id, type, payload }`
    // shape rather than blindly trusting `event.data`.
    // A message without a string id may have been some request's reply,
    // so it fails every pending request rather than leave one hanging.
    const data = event.data as unknown;
    if (typeof data !== 'object' || data === null) {
      console.warn('[WorkerBridge] dropping non-object worker message');
      this.rejectUnattributedReply('Worker sent a non-object message', { reason: 'non-object' });
      return;
    }
    const id = (data as { id?: unknown }).id;
    const type = (data as { type?: unknown }).type;
    const payload = (data as { payload?: unknown }).payload;
    if (typeof id !== 'string') {
      console.warn('[WorkerBridge] dropping worker message with non-string id');
      this.rejectUnattributedReply('Worker sent a message without a string id', {
        reason: 'non-string-id',
      });
      return;
    }

    // Ignore ready message (handled in initialize)
    if (id === '__ready__') return;

    const request = this.pendingRequests.get(id);
    if (!request) return;

    switch (type) {
      case 'result':
        this.cleanupRequest(id);
        if (typeof payload !== 'object' || payload === null) {
          request.reject(
            new WorkerInitError('Worker result response missing payload', {
              code: 'WORKER_PROTOCOL_VIOLATION',
              details: { id, type },
            }),
          );
          break;
        }
        request.resolve(payload);
        break;

      case 'error': {
        this.cleanupRequest(id);
        if (typeof payload !== 'object' || payload === null) {
          request.reject(
            new WorkerInitError('Worker error response missing payload', {
              code: 'WORKER_PROTOCOL_VIOLATION',
              details: { id, type },
            }),
          );
          break;
        }
        request.reject(reconstructError(payload as ErrorPayload));
        break;
      }

      case 'progress':
        if (request.onProgress && typeof payload === 'object' && payload !== null) {
          request.onProgress(payload as ProgressInfo);
        }
        break;

      default:
        console.warn(`[WorkerBridge] dropping worker message with unknown type: ${String(type)}`);
        this.cleanupRequest(id);
        request.reject(
          new WorkerInitError(`Worker sent unknown message type: ${String(type)}`, {
            code: 'WORKER_PROTOCOL_VIOLATION',
            details: { id, type: String(type) },
          }),
        );
        break;
    }
  }
}
