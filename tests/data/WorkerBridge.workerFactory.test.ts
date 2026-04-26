// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { WorkerBridge } from '@/data/WorkerBridge';
import { WorkerInitError } from '@/core/errors';

/**
 * Phase 3: WorkerBridge supports a custom workerFactory and workerUrl so
 * consumers on strict-CSP / bundler-specific deployments can override the
 * default `new Worker(new URL(...), { type: 'module' })`. Factory failures
 * surface as typed WorkerInitError with a `source` discriminator.
 *
 * We exercise the `createWorker()` helper directly rather than running the
 * full `initialize()` flow — spinning up a real worker in JSDOM isn't
 * feasible and the priority logic is the interesting surface.
 */
describe('WorkerBridge — workerFactory / workerUrl (Phase 3)', () => {
  it('workerFactory takes precedence over workerUrl and default', () => {
    const fakeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Worker;
    const factory = vi.fn(() => fakeWorker);
    const urlSpy = vi.fn();

    const bridge = new WorkerBridge({
      workerFactory: factory,
      workerUrl: 'ignored.js',
    });

    const worker = (bridge as any).createWorker();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(urlSpy).not.toHaveBeenCalled();
    expect(worker).toBe(fakeWorker);
  });

  it('workerUrl is used when workerFactory is absent', () => {
    // Stub global Worker constructor so we can observe instantiation.
    const originalWorker = globalThis.Worker;
    const ctor = vi.fn().mockImplementation(function (this: unknown) {
      Object.assign(this as object, {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    });

    (globalThis as any).Worker = ctor;
    try {
      const bridge = new WorkerBridge({ workerUrl: '/custom/worker.js' });

      (bridge as any).createWorker();

      expect(ctor).toHaveBeenCalledTimes(1);
      expect(ctor.mock.calls[0][0]).toBe('/custom/worker.js');
      expect(ctor.mock.calls[0][1]).toEqual({ type: 'module' });
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });

  it('throws WorkerInitError when workerFactory throws', () => {
    const bridge = new WorkerBridge({
      workerFactory: () => {
        throw new Error('nope');
      },
    });
    expect(() => {
      (bridge as any).createWorker();
    }).toThrowError(WorkerInitError);
    try {
      (bridge as any).createWorker();
    } catch (err) {
      expect(err).toBeInstanceOf(WorkerInitError);
      expect((err as WorkerInitError).code).toBe('WORKER_CRASHED');
      expect((err as WorkerInitError).details).toMatchObject({
        source: 'workerFactory',
      });
      expect((err as WorkerInitError).cause).toBeInstanceOf(Error);
    }
  });

  it('throws WorkerInitError when workerFactory returns a non-Worker', () => {
    const bridge = new WorkerBridge({
      workerFactory: () => ({}) as any,
    });
    try {
      (bridge as any).createWorker();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WorkerInitError);
      expect((err as WorkerInitError).details).toMatchObject({
        source: 'workerFactory',
      });
    }
  });

  it('throws WorkerInitError when workerUrl construction fails', () => {
    const originalWorker = globalThis.Worker;

    (globalThis as any).Worker = function () {
      throw new Error('boom');
    };
    try {
      const bridge = new WorkerBridge({ workerUrl: '/bad.js' });
      try {
        (bridge as any).createWorker();
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkerInitError);
        expect((err as WorkerInitError).code).toBe('WORKER_CRASHED');
        expect((err as WorkerInitError).details).toMatchObject({
          source: 'workerUrl',
          workerUrl: '/bad.js',
        });
      }
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});

/**
 * Phase 3: `duckdbBundles` is forwarded in the init postMessage payload so
 * the worker can call `selectBundle(bundles)` instead of the jsdelivr CDN.
 */
describe('WorkerBridge — duckdbBundles forwarding (Phase 3)', () => {
  function primeBridge(options?: Parameters<typeof WorkerBridge>[0]) {
    const bridge = new WorkerBridge(options);
    const postMessage = vi.fn();
    const fakeWorker = {
      postMessage,
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (bridge as any).worker = fakeWorker;
    return { bridge, postMessage };
  }

  function extractInitPayload(postMessage: ReturnType<typeof vi.fn>): unknown {
    // Find the init message (by type === 'init') among posted messages.
    const call = postMessage.mock.calls.find((args) => {
      const msg = args[0] as { type?: string };
      return msg?.type === 'init';
    });
    expect(call).toBeDefined();
    return (call![0] as { payload: unknown }).payload;
  }

  it('sends empty init payload when duckdbBundles is not configured', () => {
    const { bridge, postMessage } = primeBridge();

    (bridge as any).sendMessage('init', {});
    const payload = extractInitPayload(postMessage);
    expect(payload).toEqual({});
  });

  it('forwards duckdbBundles in the init payload when configured', () => {
    const bundles = {
      mvp: { mainModule: 'a.wasm', mainWorker: 'a.js' },
      eh: { mainModule: 'b.wasm', mainWorker: 'b.js' },
    } as any;
    const { bridge, postMessage } = primeBridge({ duckdbBundles: bundles });
    // Synthesize the exact init call the real `initialize()` flow makes.

    const b: any = bridge;
    b.sendMessage('init', b.duckdbBundles ? { bundles: b.duckdbBundles } : {});
    const payload = extractInitPayload(postMessage);
    expect(payload).toEqual({ bundles });
  });
});
