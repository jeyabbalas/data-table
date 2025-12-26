/**
 * Web Worker entry point
 * Handles all DuckDB operations in a separate thread
 */

import type {
  WorkerMessage,
  WorkerResponse,
  WorkerResponseType,
} from './types';

// Send response back to main thread
function respond(id: string, type: WorkerResponseType, payload: unknown): void {
  const response: WorkerResponse = { id, type, payload };
  self.postMessage(response);
}

// Handle incoming messages
async function handleMessage(message: WorkerMessage): Promise<void> {
  const { id, type } = message;

  try {
    switch (type) {
      case 'init':
        // TODO: Initialize DuckDB (Task 1.2)
        respond(id, 'result', { initialized: true });
        break;

      case 'query':
        // TODO: Execute query (Task 1.2)
        respond(id, 'result', { rows: [] });
        break;

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
