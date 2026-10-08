// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { WorkerBridge } from '@/data/WorkerBridge';
import { WorkerInitError } from '@/core/errors';

import { createMockWorker } from '../helpers/mockWorker';

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
 * The default worker, `new Worker(new URL('../worker/worker.ts',
 * import.meta.url))`, fails when the library is served from another origin
 * than the page (a synchronous `SecurityError`) or when the page's CSP
 * blocks its script (an `error` event). Both reject `initialize()` with a
 * `WorkerInitError` that says `workerFactory` is the way out.
 */
describe('WorkerBridge — the default worker', () => {
  it('a constructor that throws becomes a WorkerInitError naming workerFactory and CSP', async () => {
    const originalWorker = globalThis.Worker;
    const securityError = new DOMException(
      "Failed to construct 'Worker': Script at 'https://cdn.example/assets/worker.js' " +
        "cannot be accessed from origin 'https://app.example'.",
      'SecurityError',
    );
    (globalThis as any).Worker = function () {
      throw securityError;
    };
    try {
      const bridge = new WorkerBridge();
      const error = await bridge.initialize().then(
        () => null,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(WorkerInitError);
      expect(error).toMatchObject({ code: 'WORKER_CRASHED', details: { source: 'default' } });
      expect((error as WorkerInitError).cause).toBe(securityError);
      const message = (error as Error).message;
      expect(message).toContain('cannot be accessed from origin');
      expect(message).toContain('workerFactory');
      expect(message).toContain('Content Security Policy');
      expect(message).not.toMatch(/\.\./);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });

  it('a script that fails to load says why and names workerFactory', async () => {
    const originalWorker = globalThis.Worker;
    let created: { onerror: ((event: unknown) => void) | null } | undefined;
    (globalThis as any).Worker = function (this: Record<string, unknown>) {
      Object.assign(this, {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null,
      });
      created = this as unknown as { onerror: ((event: unknown) => void) | null };
    };
    try {
      const bridge = new WorkerBridge();
      const init = bridge.initialize();

      // What a CSP-blocked or missing worker script fires: a plain Event.
      created!.onerror!({ type: 'error' });

      const error = await init.then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(WorkerInitError);
      expect(error).toMatchObject({ code: 'WORKER_CRASHED' });
      expect((error as Error).message).toMatch(
        /^The worker script failed to load: assets\/worker-\*\.js is missing \(a 404/,
      );
      expect((error as Error).message).toContain('Content Security Policy');
      expect((error as Error).message).toContain('workerFactory');
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});

/**
 * A worker that cannot be constructed leaves nothing behind: the next
 * `initialize()` constructs it again, rather than return the rejection.
 */
describe('WorkerBridge — retrying a worker that failed to construct', () => {
  it('runs a throwing workerFactory again', async () => {
    const mock = createMockWorker();
    const factory = vi
      .fn<() => Worker>()
      .mockImplementationOnce(() => {
        throw new Error('not yet');
      })
      .mockImplementation(() => mock.worker);
    const bridge = new WorkerBridge({ workerFactory: factory });

    await expect(bridge.initialize()).rejects.toMatchObject({
      code: 'WORKER_CRASHED',
      details: { source: 'workerFactory' },
    });
    expect(bridge.isInitialized()).toBe(false);
    await expect(bridge.initialize()).resolves.toBeUndefined();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(bridge.isInitialized()).toBe(true);
  });

  it('constructs the default worker again after it threw', async () => {
    const originalWorker = globalThis.Worker;
    const mock = createMockWorker();
    let calls = 0;
    (globalThis as any).Worker = function () {
      calls += 1;
      if (calls === 1) throw new DOMException('Script cannot be accessed', 'SecurityError');
      return mock.worker;
    };
    try {
      const bridge = new WorkerBridge();
      await expect(bridge.initialize()).rejects.toMatchObject({
        code: 'WORKER_CRASHED',
        details: { source: 'default' },
      });
      await expect(bridge.initialize()).resolves.toBeUndefined();
      expect(calls).toBe(2);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });

  it('names no CSP or origin when there is no Worker to construct', async () => {
    const originalWorker = globalThis.Worker;
    delete (globalThis as any).Worker;
    try {
      const error = await new WorkerBridge().initialize().then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(WorkerInitError);
      expect((error as Error).message).toMatch(/^Failed to construct the library's worker \(/);
      expect((error as Error).message).not.toMatch(/Content Security Policy|workerFactory/);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});

/**
 * Phase 3: `duckdbBundles` is forwarded in the init postMessage payload so
 * the worker can call `selectBundle(bundles)` instead of the jsdelivr CDN.
 * Through `initialize()`, which resolves the URLs against the page first.
 */
describe('WorkerBridge — duckdbBundles forwarding (Phase 3)', () => {
  async function initPayload(options?: Parameters<typeof WorkerBridge>[0]): Promise<unknown> {
    const mock = createMockWorker();
    const bridge = new WorkerBridge({ ...options, workerFactory: () => mock.worker });
    await bridge.initialize();
    const init = mock.posted.find((msg) => msg.type === 'init');
    expect(init).toBeDefined();
    return init!.payload;
  }

  it('sends empty init payload when duckdbBundles is not configured', async () => {
    expect(await initPayload()).toEqual({});
  });

  it('forwards duckdbBundles in the init payload when configured', async () => {
    const bundles = {
      mvp: { mainModule: 'a.wasm', mainWorker: 'a.js' },
      eh: { mainModule: 'b.wasm', mainWorker: 'b.js' },
    };
    const page = (path: string) => new URL(path, document.baseURI).href;

    expect(await initPayload({ duckdbBundles: bundles })).toEqual({
      bundles: {
        mvp: { mainModule: page('a.wasm'), mainWorker: page('a.js') },
        eh: { mainModule: page('b.wasm'), mainWorker: page('b.js') },
      },
    });
  });
});
