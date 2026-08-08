/**
 * Types for Web Worker communication
 */

import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import type { ProgressStage } from '../core/Progress';

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
  /**
   * Worker queue priority. The dispatcher drains high → normal → low.
   * 'high' = viewport row fetches, which jump everything else; 'low' =
   * visualization / column-stats scans, which yield to everything else;
   * omitted = 'normal'. Only `query` messages carry this field —
   * `load` / `export` are always normal-tier.
   */
  priority?: 'high' | 'normal' | 'low';
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
  /**
   * Imported rather than re-declared: this payload is delivered verbatim to
   * `ProgressCallback`, so a locally-written union could drift from
   * `ProgressInfo`'s and the mismatch would only surface at a cast.
   */
  stage: ProgressStage;
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
