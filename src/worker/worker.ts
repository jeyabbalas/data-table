/**
 * Web Worker entry point.
 *
 * Wires `self.onmessage` to {@link handleMessage} and posts the
 * `__ready__` sentinel. The dispatcher logic lives in `./dispatcher` so
 * it can be unit-tested without `self` side effects.
 */

import { handleMessage } from './dispatcher';
import type { WorkerMessage, WorkerResponse, WorkerResponseType } from './types';

function respond(id: string, type: WorkerResponseType, payload: unknown): void {
  const response: WorkerResponse = { id, type, payload };
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  await handleMessage(event.data, respond);
};

// Signal that worker is ready
self.postMessage({ id: '__ready__', type: 'result', payload: { ready: true } });
