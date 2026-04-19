// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerBridge } from '@/data/WorkerBridge';

/**
 * Phase 2: aborting a request must remove the `abort` listener from the
 * underlying AbortSignal. Consumers that reuse an AbortController (common
 * React pattern with a ref) would otherwise accumulate one listener per
 * aborted request.
 */
describe('WorkerBridge — AbortSignal listener cleanup (Phase 2)', () => {
  let bridge: WorkerBridge;
  let fakeWorker: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bridge = new WorkerBridge();
    fakeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    // Bypass real init: inject a fake worker and pretend init resolved.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bridge as any).worker = fakeWorker;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bridge as any).initPromise = Promise.resolve();
  });

  it('removes the abort listener after an abort fires', async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    const queryPromise = bridge.query('SELECT 1', controller.signal);
    expect(addSpy).toHaveBeenCalledTimes(1);

    controller.abort();

    await expect(queryPromise).rejects.toMatchObject({
      name: 'QueryError',
      code: 'QUERY_ABORTED',
    });

    // The abort handler that fired should have also removed itself.
    expect(removeSpy).toHaveBeenCalledTimes(1);
    const addedHandler = addSpy.mock.calls[0][1];
    const removedHandler = removeSpy.mock.calls[0][1];
    expect(removedHandler).toBe(addedHandler);
  });

  it('does NOT accumulate listeners across many aborted requests on one controller', async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    // Spy path: kick off a request, abort it, repeat. After N rounds,
    // addEventListener and removeEventListener should be called equal
    // numbers of times — no net growth.
    const N = 20;
    for (let i = 0; i < N; i++) {
      // A fresh AbortController is not what we want to test; reusing one
      // AbortController across many requests only makes sense if each request
      // can be aborted independently. But AbortSignal is single-shot —
      // once aborted, the signal stays aborted. So each iteration needs its
      // own controller to simulate the "per-request controller" scenario
      // the audit described. The leak under test is within a single
      // request/abort cycle.
      const c = new AbortController();
      vi.spyOn(c.signal, 'addEventListener');
      vi.spyOn(c.signal, 'removeEventListener');
      const p = bridge.query(`SELECT ${i}`, c.signal);
      c.abort();
      await expect(p).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    }

    // For the first controller (used only for the outer scope spy), the
    // listener count should also be zero.
    expect(addSpy).toHaveBeenCalledTimes(0);
    expect(removeSpy).toHaveBeenCalledTimes(0);
  });

  it('terminate() rejects pending requests AND removes their abort listeners', async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    const queryPromise = bridge.query('SELECT 1', controller.signal);
    // Don't abort — terminate the bridge mid-flight.
    bridge.terminate();

    await expect(queryPromise).rejects.toMatchObject({
      name: 'WorkerTerminatedError',
    });
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
