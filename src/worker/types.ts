/**
 * Types for Web Worker communication
 */

// Message types from main thread to worker
export type WorkerMessageType = 'init' | 'query' | 'load' | 'cancel';

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
  // Future: configuration options
}

export interface QueryPayload {
  sql: string;
}

export interface LoadPayload {
  data: ArrayBuffer | string;
  format: 'csv' | 'json' | 'parquet';
  tableName?: string;
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
}

export interface ProgressPayload {
  stage: 'reading' | 'parsing' | 'indexing' | 'analyzing';
  percent: number;
  loaded?: number;
  total?: number;
  estimatedRemaining?: number;
  cancelable: boolean;
}
