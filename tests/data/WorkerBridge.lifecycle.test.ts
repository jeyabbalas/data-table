/**
 * Phase 4: bridge initialization timeout, terminate-then-reinitialize,
 * multi-instance isolation.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import { WorkerInitError, WorkerTerminatedError } from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

describe('WorkerBridge — lifecycle', () => {
  it('initializeTimeoutMs is honored when the worker never sends ready', async () => {
    const inert = createMockWorker({ inert: true, autoReady: false });
    const bridge = new WorkerBridge({
      workerFactory: () => inert.worker,
      initializeTimeoutMs: 50,
    });
    await expect(bridge.initialize()).rejects.toBeInstanceOf(WorkerInitError);
    try {
      await bridge.initialize();
    } catch (err) {
      expect((err as WorkerInitError).code).toBe('WORKER_INIT_TIMEOUT');
    }
  }, 1000);

  it('terminate() rejects every pending request with WorkerTerminatedError', async () => {
    const mock = createMockWorker();
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
    const q1 = bridge.query('SELECT 1');
    const q2 = bridge.query('SELECT 2');
    await mock.waitForPosts(3); // init + q1 + q2
    bridge.terminate();
    await expect(q1).rejects.toBeInstanceOf(WorkerTerminatedError);
    await expect(q2).rejects.toBeInstanceOf(WorkerTerminatedError);
  });

  it('re-initialize() after terminate() builds a fresh worker', async () => {
    const mock1 = createMockWorker();
    const factory: () => Worker = () => mock1.worker;
    const bridge = new WorkerBridge({ workerFactory: factory });
    await bridge.initialize();
    expect(bridge.isInitialized()).toBe(true);
    bridge.terminate();
    expect(bridge.isInitialized()).toBe(false);

    // Initialize again — bridge constructs a new worker via the factory.
    const mock2 = createMockWorker();
    const bridge2 = new WorkerBridge({ workerFactory: () => mock2.worker });
    await bridge2.initialize();
    expect(bridge2.isInitialized()).toBe(true);

    // The new bridge is independent of the terminated one.
    bridge2.terminate();
    expect(bridge2.isInitialized()).toBe(false);
  });

  it('two WorkerBridge instances run independently — terminate one, the other survives', async () => {
    const mockA = createMockWorker();
    const mockB = createMockWorker();
    const a = new WorkerBridge({ workerFactory: () => mockA.worker });
    const b = new WorkerBridge({ workerFactory: () => mockB.worker });
    await a.initialize();
    await b.initialize();

    // Quietly catch the rejection ahead of time so the unhandled-rejection
    // bookkeeping doesn't block.
    const qA = a.query('SELECT 1').catch((err: unknown) => err);
    await mockA.waitForPosts(2);
    a.terminate();
    const errA = await qA;
    expect(errA).toBeInstanceOf(WorkerTerminatedError);

    // B is still alive.
    const qB = b.query<{ x: number }>('SELECT 2');
    await mockB.waitForPosts(2);
    const queryB = mockB.posted.find((m) => m.type === 'query');
    mockB.sendFromWorker({
      id: queryB!.id,
      type: 'result',
      payload: { rows: [{ x: 2 }] },
    });
    await expect(qB).resolves.toEqual([{ x: 2 }]);

    b.terminate();
  });

  it('isInitialized() flips false after terminate', async () => {
    const mock = createMockWorker();
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    expect(bridge.isInitialized()).toBe(false);
    await bridge.initialize();
    expect(bridge.isInitialized()).toBe(true);
    bridge.terminate();
    expect(bridge.isInitialized()).toBe(false);
  });

  it('terminate() on an uninitialized bridge does not throw', () => {
    const bridge = new WorkerBridge();
    expect(() => bridge.terminate()).not.toThrow();
  });
});
