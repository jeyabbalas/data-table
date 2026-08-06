/**
 * Types for Web Worker communication
 */

import type { DuckDBBundles } from '@duckdb/duckdb-wasm';

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
   * Custom DuckDB WASM bundles. When omitted, the worker falls back to
   * `getJsDelivrBundles()`. Consumers on strict-CSP / offline deployments
   * supply self-hosted bundles here.
   */
  bundles?: DuckDBBundles;
}

export interface QueryPayload {
  sql: string;
  /** Worker queue priority. 'high' = viewport row fetches jump stats/histogram work. */
  priority?: 'high' | 'normal';
}

export interface LoadPayload {
  data: ArrayBuffer | string;
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
