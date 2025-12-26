/**
 * Web Worker entry point
 * Handles all DuckDB operations in a separate thread
 */

import type {
  WorkerMessage,
  WorkerResponse,
  WorkerResponseType,
  QueryPayload,
} from './types';
import {
  initializeDuckDB,
  executeQuery,
  isInitialized,
} from './duckdb';

// Send response back to main thread
function respond(id: string, type: WorkerResponseType, payload: unknown): void {
  const response: WorkerResponse = { id, type, payload };
  self.postMessage(response);
}

// Handle incoming messages
async function handleMessage(message: WorkerMessage): Promise<void> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case 'init':
        await initializeDuckDB();
        respond(id, 'result', { initialized: true });
        break;

      case 'query': {
        if (!isInitialized()) {
          respond(id, 'error', { message: 'DuckDB not initialized' });
          break;
        }
        const { sql } = payload as QueryPayload;
        const rows = await executeQuery(sql);
        respond(id, 'result', { rows });
        break;
      }

      case 'load':
        // TODO: Load data (Tasks 1.5-1.7)
        respond(id, 'result', { loaded: true });
        break;

      case 'cancel':
        // TODO: Cancel operation
        respond(id, 'result', { cancelled: true });
        break;

      default:
        respond(id, 'error', { message: `Unknown message type: ${type}` });
    }
  } catch (error) {
    respond(id, 'error', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Set up message listener
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  await handleMessage(event.data);
};

// Signal that worker is ready
self.postMessage({ id: '__ready__', type: 'result', payload: { ready: true } });
