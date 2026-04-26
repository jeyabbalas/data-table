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

// Re-export for convenience
export type { ProgressInfo, ProgressCallback } from '../core/Progress';

/**
 * Low-level options accepted by {@link WorkerBridge.loadData}. Most consumers
 * use the higher-level `table.loadData(source, opts?)` facade instead, which
 * builds these from a `File` / URL / Blob input.
 */
export interface LoadOptions {
  format: 'csv' | 'json' | 'parquet';
  tableName?: string;
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
 * Construction options for {@link WorkerBridge}.
 */
export interface WorkerBridgeOptions {
  /** Query cache configuration (LRU size, TTL). */
  cache?: Partial<QueryCacheOptions>;
  /**
   * Maximum time (ms) to wait for the worker to signal ready and for
   * DuckDB to initialize. Rejects `initialize()` with a descriptive
   * error if exceeded. Default: 30000.
   */
  initializeTimeoutMs?: number;
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
  workerFactory?: () => Worker;
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
  workerUrl?: string | URL;
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
  duckdbBundles?: DuckDBBundles;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  abortHandler?: (() => void) | null;
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
  private workerFactory?: () => Worker;
  private workerUrl?: string | URL;
  private duckdbBundles?: DuckDBBundles;

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
        fn();
      };

      const timeoutHandle = setTimeout(() => {
        settle(() => {
          // Tear down the half-initialized worker so a later retry can rebuild.
          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }
          this.initPromise = null;
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
        this.worker = this.createWorker();

        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = (error) => {
          settle(() =>
            reject(
              new WorkerInitError(`Worker error: ${error.message}`, {
                code: 'WORKER_CRASHED',
                cause: error,
              }),
            ),
          );
        };

        // Wait for worker ready signal
        const readyHandler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.id === '__ready__') {
            this.worker!.removeEventListener('message', readyHandler);
            // Now initialize DuckDB — forward optional bundles override.
            const initPayload: InitPayload = this.duckdbBundles
              ? { bundles: this.duckdbBundles }
              : {};
            this.sendMessage('init', initPayload)
              .then(() => settle(() => resolve()))
              .catch((err) => settle(() => reject(err)));
          }
        };
        this.worker.addEventListener('message', readyHandler);
      } catch (error) {
        settle(() => reject(error));
      }
    });

    return this.initPromise;
  }

  /**
   * Execute a SQL query
   */
  async query<T = Record<string, unknown>>(sql: string, signal?: AbortSignal): Promise<T[]> {
    this.ensureInitialized();

    // Only cache SELECT queries
    if (this.isCacheable(sql)) {
      const cached = this.queryCache.get<T>(sql);
      if (cached !== undefined) {
        return cached;
      }
    }

    const payload: QueryPayload = { sql };
    const result = await this.sendMessage('query', payload, undefined, signal);
    const rows = (result as { rows: T[] }).rows;

    // Store in cache if cacheable and not aborted
    if (this.isCacheable(sql) && !signal?.aborted) {
      this.queryCache.set(sql, rows);
    }

    return rows;
  }

  /**
   * Load data into DuckDB
   *
   * Returns table name, row count, columns, and full schema info.
   * All metadata queries happen in the worker to avoid blocking the main thread.
   */
  async loadData(
    source: ArrayBuffer | string,
    options: LoadOptions,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<LoadDataResult> {
    this.ensureInitialized();

    const payload: LoadPayload = {
      data: source,
      format: options.format,
      tableName: options.tableName,
    };
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
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.initPromise = null;

    // Reject all pending requests, releasing their abort listeners so that
    // long-lived AbortSignals reused by the embedder don't accumulate
    // handlers across bridge lifetimes.
    const ids = Array.from(this.pendingRequests.keys());
    for (const id of ids) {
      const request = this.pendingRequests.get(id);
      if (!request) continue;
      request.reject(new WorkerTerminatedError('Worker terminated'));
      this.cleanupRequest(id);
    }
    this.queryCache.clear();
  }

  /**
   * Clear all cached query results
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null && this.initPromise !== null;
  }

  private ensureInitialized(): void {
    if (!this.worker) {
      throw new ConfigurationError('WorkerBridge not initialized. Call initialize() first.', {
        code: 'BRIDGE_NOT_READY',
      });
    }
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
          // Send cancel message to worker
          const cancelMessage: WorkerMessage = {
            id: this.generateId(),
            type: 'cancel',
            payload: { targetId: id },
          };
          this.worker?.postMessage(cancelMessage);
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
      this.worker!.postMessage(message);
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
    const data = event.data as unknown;
    if (typeof data !== 'object' || data === null) {
      console.warn('[WorkerBridge] dropping non-object worker message');
      return;
    }
    const id = (data as { id?: unknown }).id;
    const type = (data as { type?: unknown }).type;
    const payload = (data as { payload?: unknown }).payload;
    if (typeof id !== 'string') {
      console.warn('[WorkerBridge] dropping worker message with non-string id');
      return;
    }

    // Ignore ready message (handled in initialize)
    if (id === '__ready__') return;

    const request = this.pendingRequests.get(id);
    if (!request) return;

    switch (type) {
      case 'result':
        this.cleanupRequest(id);
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
