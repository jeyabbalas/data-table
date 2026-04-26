// @vitest-environment jsdom
/**
 * Phase 1 — WorkerBridge inbound-message protocol regression tests.
 *
 * The worker is library-controlled, but a hostile `workerFactory` /
 * cross-origin worker / extension-injected wrapper could deliver malformed
 * messages. The bridge type-narrows every field on `event.data` and rejects
 * anything that doesn't match the `{ id, type, payload }` shape.
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkerBridge } from '@/data/WorkerBridge';
import { WorkerInitError } from '@/core/errors';

interface BridgeInternals {
  pendingRequests: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      onProgress?: (info: unknown) => void;
    }
  >;
  handleMessage: (event: MessageEvent<unknown>) => void;
}

function makeBridge(): WorkerBridge & BridgeInternals {
  return new WorkerBridge() as unknown as WorkerBridge & BridgeInternals;
}

function makeEvent(data: unknown): MessageEvent<unknown> {
  return { data } as unknown as MessageEvent<unknown>;
}

describe('WorkerBridge.handleMessage — protocol guards', () => {
  it('drops a non-object message with a console warning', () => {
    const bridge = makeBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bridge.handleMessage(makeEvent('not an object'));
    bridge.handleMessage(makeEvent(null));
    bridge.handleMessage(makeEvent(42));
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('drops a message with non-string id', () => {
    const bridge = makeBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bridge.handleMessage(makeEvent({ id: 42, type: 'result', payload: {} }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores messages without a matching pending request', () => {
    const bridge = makeBridge();
    // Should not throw — request map is empty.
    bridge.handleMessage(makeEvent({ id: 'unknown', type: 'result', payload: {} }));
  });

  it('ignores the special __ready__ message id', () => {
    const bridge = makeBridge();
    // No throw, no warning.
    bridge.handleMessage(makeEvent({ id: '__ready__', type: 'result', payload: null }));
  });

  it('rejects pending request when error message has no payload', () => {
    const bridge = makeBridge();
    const reject = vi.fn();
    bridge.pendingRequests.set('req1', {
      resolve: vi.fn(),
      reject,
    });
    bridge.handleMessage(makeEvent({ id: 'req1', type: 'error', payload: null }));
    expect(reject).toHaveBeenCalledTimes(1);
    const err = reject.mock.calls[0][0];
    expect(err).toBeInstanceOf(WorkerInitError);
    expect((err as WorkerInitError).code).toBe('WORKER_PROTOCOL_VIOLATION');
  });

  it('rejects pending request when type is unknown', () => {
    const bridge = makeBridge();
    const reject = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bridge.pendingRequests.set('req2', {
      resolve: vi.fn(),
      reject,
    });
    bridge.handleMessage(makeEvent({ id: 'req2', type: 'malicious', payload: {} }));
    expect(warn).toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(1);
    const err = reject.mock.calls[0][0];
    expect(err).toBeInstanceOf(WorkerInitError);
    expect((err as WorkerInitError).code).toBe('WORKER_PROTOCOL_VIOLATION');
    warn.mockRestore();
  });

  it('drops a progress message with non-object payload', () => {
    const bridge = makeBridge();
    const onProgress = vi.fn();
    bridge.pendingRequests.set('req3', {
      resolve: vi.fn(),
      reject: vi.fn(),
      onProgress,
    });
    bridge.handleMessage(makeEvent({ id: 'req3', type: 'progress', payload: null }));
    bridge.handleMessage(makeEvent({ id: 'req3', type: 'progress', payload: 'string-payload' }));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('forwards a well-formed result message to resolve()', () => {
    const bridge = makeBridge();
    const resolve = vi.fn();
    bridge.pendingRequests.set('req4', {
      resolve,
      reject: vi.fn(),
    });
    bridge.handleMessage(makeEvent({ id: 'req4', type: 'result', payload: { data: 'ok' } }));
    expect(resolve).toHaveBeenCalledWith({ data: 'ok' });
  });
});
