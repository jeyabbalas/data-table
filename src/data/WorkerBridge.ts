/**
 * WorkerBridge provides a Promise-based API for communicating with the DuckDB worker
 */

import type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  QueryPayload,
  LoadPayload,
  ProgressPayload,
} from '../worker/types';

export interface LoadOptions {
  format: 'csv' | 'json' | 'parquet';
  tableName?: string;
}

export type ProgressCallback = (progress: ProgressPayload) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
}

export class WorkerBridge {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageId = 0;
  private initPromise: Promise<void> | null = null;

  /**
   * Create the worker and wait for it to be ready
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL('../worker/worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = (error) => {
          reject(new Error(`Worker error: ${error.message}`));
        };

        // Wait for worker ready signal
        const readyHandler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.id === '__ready__') {
            this.worker!.removeEventListener('message', readyHandler);
            // Now initialize DuckDB
            this.sendMessage('init', {})
              .then(() => resolve())
              .catch(reject);
          }
        };
        this.worker.addEventListener('message', readyHandler);
      } catch (error) {
        reject(error);
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

    const payload: QueryPayload = { sql };
    const result = await this.sendMessage('query', payload, undefined, signal);
    return (result as { rows: T[] }).rows;
  }

  /**
   * Load data into DuckDB
   */
  async loadData(
    source: ArrayBuffer | string,
    options: LoadOptions,
    onProgress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<void> {
    this.ensureInitialized();

    const payload: LoadPayload = {
      data: source,
      format: options.format,
      tableName: options.tableName,
    };
    await this.sendMessage('load', payload, onProgress, signal);
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
        request.reject(new Error('Worker terminated'));
      }
      this.pendingRequests.clear();
    }
  }

  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null && this.initPromise !== null;
  }

  private ensureInitialized(): void {
    if (!this.worker) {
      throw new Error('WorkerBridge not initialized. Call initialize() first.');
    }
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
      if (signal) {
        if (signal.aborted) {
          reject(new Error('Operation aborted'));
          return;
        }

        signal.addEventListener('abort', () => {
          this.pendingRequests.delete(id);
          // Send cancel message to worker
          const cancelMessage: WorkerMessage = {
            id: this.generateId(),
            type: 'cancel',
            payload: { targetId: id },
          };
          this.worker?.postMessage(cancelMessage);
          reject(new Error('Operation aborted'));
        });
      }

      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const message: WorkerMessage = { id, type, payload };
      this.worker!.postMessage(message);
    });
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const { id, type, payload } = event.data;

    // Ignore ready message (handled in initialize)
    if (id === '__ready__') return;

    const request = this.pendingRequests.get(id);
    if (!request) return;

    switch (type) {
      case 'result':
        this.pendingRequests.delete(id);
        request.resolve(payload);
        break;

      case 'error':
        this.pendingRequests.delete(id);
        request.reject(new Error((payload as { message: string }).message));
        break;

      case 'progress':
        if (request.onProgress) {
          request.onProgress(payload as ProgressPayload);
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
