/**
 * WorkerBridge provides a Promise-based API for communicating with the DuckDB worker
 */

import type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  ErrorPayload,
  QueryPayload,
  LoadPayload,
  ExportPayload,
} from '../worker/types';
import type { ProgressInfo, ProgressCallback } from '../core/Progress';
import type { ColumnSchema } from '../core/types';
import {
  ConfigurationError,
  QueryError,
  WorkerInitError,
  WorkerTerminatedError,
  reconstructError,
} from '../core/errors';
import { QueryCache, type QueryCacheOptions } from './QueryCache';

// Re-export for convenience
export type { ProgressInfo, ProgressCallback } from '../core/Progress';

export interface LoadOptions {
  format: 'csv' | 'json' | 'parquet';
  tableName?: string;
}

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
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
  abortHandler?: (() => void) | null;
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000;

export class WorkerBridge {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageId = 0;
  private initPromise: Promise<void> | null = null;
  private queryCache: QueryCache;
  private initializeTimeoutMs: number;

  constructor(options?: WorkerBridgeOptions) {
    this.queryCache = new QueryCache(options?.cache);
    this.initializeTimeoutMs = options?.initializeTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
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
        this.worker = new Worker(
          new URL('../worker/worker.ts', import.meta.url),
          { type: 'module' }
        );

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
            // Now initialize DuckDB
            this.sendMessage('init', {})
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
  async query<T = Record<string, unknown>>(
    sql: string,
    signal?: AbortSignal
  ): Promise<T[]> {
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
    signal?: AbortSignal
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
  async exportToBuffer(
    sql: string,
    format: 'parquet',
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    this.ensureInitialized();

    const payload: ExportPayload = { sql, format };
    const result = await this.sendMessage('export', payload, undefined, signal);
    return new Uint8Array((result as { buffer: ArrayBuffer }).buffer);
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initPromise = null;

      // Reject all pending requests
      for (const [, request] of this.pendingRequests) {
        request.reject(new WorkerTerminatedError('Worker terminated'));
      }
      this.pendingRequests.clear();
      this.queryCache.clear();
    }
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
      throw new ConfigurationError(
        'WorkerBridge not initialized. Call initialize() first.',
        { code: 'BRIDGE_NOT_READY' },
      );
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
    signal?: AbortSignal
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
          this.pendingRequests.delete(id);
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
        resolve, reject, onProgress,
        signal, abortHandler,
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
    const { id, type, payload } = event.data;

    // Ignore ready message (handled in initialize)
    if (id === '__ready__') return;

    const request = this.pendingRequests.get(id);
    if (!request) return;

    switch (type) {
      case 'result':
        this.cleanupRequest(id);
        request.resolve(payload);
        break;

      case 'error':
        this.cleanupRequest(id);
        request.reject(reconstructError(payload as ErrorPayload));
        break;

      case 'progress':
        if (request.onProgress) {
          request.onProgress(payload as ProgressInfo);
        }
        break;
    }
  }
}

// Singleton instance for convenience
let defaultBridge: WorkerBridge | null = null;

export function getDefaultBridge(): WorkerBridge {
  if (!defaultBridge) {
    defaultBridge = new WorkerBridge();
  }
  return defaultBridge;
}
