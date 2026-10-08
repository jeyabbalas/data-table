/**
 * Types for Web Worker communication
 */

import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import type { SourceOptions } from '../data/sourceOptions';

// Message types from main thread to worker
export type WorkerMessageType = 'init' | 'query' | 'load' | 'export' | 'cancel';

export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
}

// Response types from worker to main thread
export type WorkerResponseType = 'result' | 'error' | 'progress';

export interface WorkerResponse {
  id: string;
  type: WorkerResponseType;
  payload: unknown;
}

// Specific message payloads
export interface InitPayload {
  /**
   * Self-hosted DuckDB-WASM bundles, from `bridgeOptions.duckdbBundles`.
   * When omitted, the worker falls back to `getJsDelivrBundles()`.
   *
   * Every `mainModule`, `mainWorker` and `pthreadWorker` is an absolute URL
   * string: `WorkerBridge.initialize()` resolves them against the page
   * (`document.baseURI`) before posting, and turns `URL` objects into
   * strings, which `postMessage` can clone. DuckDB's own worker, not this
   * one, fetches them, and it runs from a `blob:` URL that is no base for a
   * relative URL: `initializeDuckDB` rejects one.
   */
  bundles?: DuckDBBundles;
}

export interface QueryPayload {
  sql: string;
  /**
   * Worker queue priority. 'high' = viewport row fetches jump all other
   * work; 'elevated' = a read a user waits on jumps stats/histogram work,
   * but not 'high'.
   */
  priority?: 'high' | 'elevated' | 'normal';
}

/**
 * A load, with how its source is read: the entry for `format`, and the time
 * zone. The main thread has checked the options (`validateSourceOptions`).
 */
export interface LoadPayload extends SourceOptions {
  /** A Blob (or File) is read lazily from disk when the format is Parquet. */
  data: ArrayBuffer | string | Blob;
  format: 'csv' | 'json' | 'parquet';
  tableName?: string | undefined;
}

export interface ExportPayload {
  sql: string;
  format: 'parquet';
}

export interface CancelPayload {
  targetId: string;
}

// Response payloads
export interface ResultPayload<T = unknown> {
  data: T;
}

export interface ErrorPayload {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ProgressPayload {
  stage: 'reading' | 'parsing' | 'indexing' | 'analyzing';
  percent: number;
  loaded?: number;
  total?: number;
  estimatedRemaining?: number;
  cancelable: boolean;
}

export interface LoadResultPayload {
  loaded: boolean;
  tableName: string;
  rowCount: number;
  columns: string[];
}
