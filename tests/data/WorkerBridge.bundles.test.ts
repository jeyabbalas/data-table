/**
 * Phase 4: bridgeOptions.duckdbBundles forwarding to the worker init
 * payload, and unreachable-bundle / unreachable-URL failure paths.
 *
 * These tests don't actually load WASM — they verify the contract that
 * `duckdbBundles` is forwarded to the init message and that
 * `workerFactory` / `workerUrl` failures surface as `WorkerInitError`
 * with the right `details.source` discriminator.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

import { WorkerInitError } from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker } from '../helpers/mockWorker';

describe('WorkerBridge — duckdbBundles forwarding', () => {
  it('omitted bundles → init payload is empty (worker falls back to CDN)', async () => {
    const mock = createMockWorker();
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
    const initMsg = mock.posted.find((m) => m.type === 'init');
    expect(initMsg).toBeDefined();
    expect(initMsg!.payload).toEqual({});
  });

  it('explicit bundles flow through the init payload to the worker', async () => {
    const bundles = {
      mvp: { mainModule: '/static/duckdb-mvp.wasm', mainWorker: '/static/duckdb-mvp.worker.js' },
      eh: { mainModule: '/static/duckdb-eh.wasm', mainWorker: '/static/duckdb-eh.worker.js' },
    };
    const mock = createMockWorker();
    // The mock auto-replies to `init` regardless of payload — test asserts
    // the bridge POSTED the bundles, not how the worker reacts.
    const bridge = new WorkerBridge({
      workerFactory: () => mock.worker,
      // Cast: WorkerBridgeOptions['duckdbBundles'] is typed via duckdb-wasm,
      // but the bridge forwards verbatim.
      duckdbBundles: bundles as unknown as never,
    });
    await bridge.initialize();
    const initMsg = mock.posted.find((m) => m.type === 'init');
    expect(initMsg).toBeDefined();
    expect((initMsg!.payload as { bundles?: unknown }).bundles).toEqual(bundles);
  });

  it('workerFactory throw → WorkerInitError with details.source === "workerFactory"', async () => {
    const bridge = new WorkerBridge({
      workerFactory: () => {
        throw new Error('factory exploded');
      },
    });
    await expect(bridge.initialize()).rejects.toBeInstanceOf(WorkerInitError);
    try {
      await bridge.initialize();
    } catch (err) {
      expect((err as WorkerInitError).code).toBe('WORKER_CRASHED');
      expect((err as WorkerInitError).details).toMatchObject({ source: 'workerFactory' });
    }
  });

  it('workerFactory returning non-Worker → WorkerInitError', async () => {
    const bridge = new WorkerBridge({
      workerFactory: () => ({}) as unknown as Worker,
    });
    await expect(bridge.initialize()).rejects.toBeInstanceOf(WorkerInitError);
  });

  it('workerUrl that fails to construct → WorkerInitError with details.source === "workerUrl"', async () => {
    const original = globalThis.Worker;
    (globalThis as unknown as { Worker: unknown }).Worker = function FakeWorker() {
      throw new Error('boom from constructor');
    };
    try {
      const bridge = new WorkerBridge({ workerUrl: '/bad.js' });
      await expect(bridge.initialize()).rejects.toBeInstanceOf(WorkerInitError);
      try {
        await bridge.initialize();
      } catch (err) {
        expect((err as WorkerInitError).code).toBe('WORKER_CRASHED');
        expect((err as WorkerInitError).details).toMatchObject({
          source: 'workerUrl',
          workerUrl: '/bad.js',
        });
      }
    } finally {
      (globalThis as unknown as { Worker: typeof Worker }).Worker = original;
    }
  });
});
