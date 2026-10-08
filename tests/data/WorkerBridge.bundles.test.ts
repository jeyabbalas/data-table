/**
 * Phase 4: bridgeOptions.duckdbBundles forwarding to the worker init
 * payload, and unreachable-bundle / unreachable-URL failure paths.
 *
 * These tests don't actually load WASM — they verify the contract that
 * `duckdbBundles` is forwarded to the init message and that
 * `workerFactory` / `workerUrl` failures surface as `WorkerInitError`
 * with the right `details.source` discriminator.
 *
 * DuckDB's own worker fetches the bundles, from a `blob:` URL that is no
 * base for a relative URL, so `initialize()` resolves every bundle URL
 * against the page before any worker exists, and posts absolute strings:
 * a `URL` object could not be posted at all (`DataCloneError`).
 * tests/browser/self-hosted-bundles.spec.ts runs the real thing.
 */
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';

import { ConfigurationError, WorkerInitError } from '@/core/errors';
import { WorkerBridge, type WorkerBridgeOptions } from '@/data/WorkerBridge';

import { createMockWorker } from '../helpers/mockWorker';

type Bundles = NonNullable<WorkerBridgeOptions['duckdbBundles']>;

/** The bundles a bridge given `bundles` posts with `init`. */
async function postedBundles(bundles: unknown): Promise<unknown> {
  const mock = createMockWorker();
  const bridge = new WorkerBridge({
    workerFactory: () => mock.worker,
    duckdbBundles: bundles as Bundles,
  });
  await bridge.initialize();
  const initMsg = mock.posted.find((m) => m.type === 'init');
  expect(initMsg).toBeDefined();
  return (initMsg!.payload as { bundles?: unknown }).bundles;
}

/** `path` resolved against the page, as the bridge resolves it. */
const onPage = (path: string): string => new URL(path, document.baseURI).href;

/** Freeze `value` and everything in it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !(value instanceof URL)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  document.head.querySelectorAll('base').forEach((base) => base.remove());
});

describe('WorkerBridge — duckdbBundles forwarding', () => {
  it('omitted bundles → init payload is empty (worker falls back to CDN)', async () => {
    const mock = createMockWorker();
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
    const initMsg = mock.posted.find((m) => m.type === 'init');
    expect(initMsg).toBeDefined();
    expect(initMsg!.payload).toEqual({});
  });

  it('explicit bundles flow through the init payload, resolved against the page', async () => {
    const bundles = {
      mvp: { mainModule: '/static/duckdb-mvp.wasm', mainWorker: '/static/duckdb-mvp.worker.js' },
      eh: { mainModule: 'static/duckdb-eh.wasm', mainWorker: './static/duckdb-eh.worker.js' },
    };
    expect(await postedBundles(bundles)).toEqual({
      mvp: {
        mainModule: onPage('/static/duckdb-mvp.wasm'),
        mainWorker: onPage('/static/duckdb-mvp.worker.js'),
      },
      eh: {
        mainModule: onPage('static/duckdb-eh.wasm'),
        mainWorker: onPage('./static/duckdb-eh.worker.js'),
      },
    });
    expect(onPage('/static/duckdb-mvp.wasm')).toMatch(/^https?:\/\//);
  });

  it('resolves against a <base href>, as the page resolves its own URLs', async () => {
    const base = document.createElement('base');
    base.href = 'https://cdn.example/app/v2/';
    document.head.append(base);
    expect(document.baseURI).toBe('https://cdn.example/app/v2/');

    expect(
      await postedBundles({
        mvp: { mainModule: 'duckdb/duckdb-mvp.wasm', mainWorker: '../duckdb/mvp.worker.js' },
        coi: {
          mainModule: '/duckdb/duckdb-coi.wasm',
          mainWorker: 'duckdb/coi.worker.js',
          pthreadWorker: 'duckdb/coi.pthread.worker.js',
        },
      }),
    ).toEqual({
      mvp: {
        mainModule: 'https://cdn.example/app/v2/duckdb/duckdb-mvp.wasm',
        mainWorker: 'https://cdn.example/app/duckdb/mvp.worker.js',
      },
      coi: {
        mainModule: 'https://cdn.example/duckdb/duckdb-coi.wasm',
        mainWorker: 'https://cdn.example/app/v2/duckdb/coi.worker.js',
        pthreadWorker: 'https://cdn.example/app/v2/duckdb/coi.pthread.worker.js',
      },
    });
  });

  it('keeps absolute URLs, and posts URL objects as their href, which can be cloned', async () => {
    const bundles = {
      mvp: {
        mainModule: new URL('https://static.example/duckdb/duckdb-mvp.wasm'),
        mainWorker: 'https://static.example/duckdb/mvp.worker.js',
      },
      eh: {
        mainModule: new URL('/duckdb/duckdb-eh.wasm', document.baseURI),
        mainWorker: new URL('https://static.example/duckdb/eh.worker.js?v=1'),
      },
    };
    const posted = await postedBundles(bundles);
    expect(posted).toEqual({
      mvp: {
        mainModule: 'https://static.example/duckdb/duckdb-mvp.wasm',
        mainWorker: 'https://static.example/duckdb/mvp.worker.js',
      },
      eh: {
        mainModule: onPage('/duckdb/duckdb-eh.wasm'),
        mainWorker: 'https://static.example/duckdb/eh.worker.js?v=1',
      },
    });
    // What postMessage does to the payload: a URL object would throw DataCloneError.
    expect(() => structuredClone(posted)).not.toThrow();
    expect(() => structuredClone(bundles)).toThrow();
  });

  it('skips null and undefined entries and fields, and keeps other keys', async () => {
    const bundles = {
      mvp: { mainModule: '/a.wasm', mainWorker: '/a.js', note: 'kept', size: 3 },
      eh: undefined,
      coi: null,
      future: { mainModule: 'b.wasm', mainWorker: null, pthreadWorker: undefined, flag: true },
      label: 'self-hosted',
    };
    expect(await postedBundles(bundles)).toEqual({
      mvp: { mainModule: onPage('/a.wasm'), mainWorker: onPage('/a.js'), note: 'kept', size: 3 },
      eh: undefined,
      coi: null,
      future: {
        mainModule: onPage('b.wasm'),
        mainWorker: null,
        pthreadWorker: undefined,
        flag: true,
      },
      label: 'self-hosted',
    });
  });

  it("leaves the caller's object as it was", async () => {
    const mainModule = new URL('https://static.example/duckdb-eh.wasm');
    const bundles = deepFreeze({
      mvp: { mainModule: '/duckdb/mvp.wasm', mainWorker: '/duckdb/mvp.worker.js' },
      eh: { mainModule, mainWorker: 'duckdb/eh.worker.js' },
    });
    const before = JSON.stringify(bundles);

    const posted = (await postedBundles(bundles)) as Bundles;

    expect(JSON.stringify(bundles)).toBe(before);
    expect(bundles.eh.mainModule).toBe(mainModule);
    expect(posted).not.toBe(bundles);
    expect(posted.mvp).not.toBe(bundles.mvp);
  });

  it('a URL that cannot be resolved rejects with a ConfigurationError naming it, before any worker', async () => {
    const cases: [unknown, string][] = [
      [
        { mvp: { mainModule: '/a.wasm', mainWorker: 'http://[::1' } },
        'duckdbBundles.mvp.mainWorker',
      ],
      [{ mvp: { mainModule: '', mainWorker: '/a.js' } }, 'duckdbBundles.mvp.mainModule'],
      [
        {
          mvp: { mainModule: '/a.wasm', mainWorker: '/a.js' },
          eh: { mainModule: 42, mainWorker: '/b.js' },
        },
        'duckdbBundles.eh.mainModule',
      ],
      [
        {
          mvp: { mainModule: '/a.wasm', mainWorker: '/a.js' },
          coi: { mainModule: '/c.wasm', mainWorker: '/c.js', pthreadWorker: { href: '/p.js' } },
        },
        'duckdbBundles.coi.pthreadWorker',
      ],
    ];
    for (const [bundles, option] of cases) {
      const factory = vi.fn(() => createMockWorker().worker);
      const bridge = new WorkerBridge({
        workerFactory: factory,
        duckdbBundles: bundles as Bundles,
      });

      const error = await bridge.initialize().then(
        () => null,
        (reason: unknown) => reason,
      );

      expect(error, option).toBeInstanceOf(ConfigurationError);
      expect(error).toMatchObject({ code: 'OPTIONS_INVALID', details: { option } });
      expect((error as Error).message).toContain(option);
      expect(factory).not.toHaveBeenCalled();
      expect(bridge.isInitialized()).toBe(false);
    }
  });

  it('an init that fails in the worker rejects with a WorkerInitError, and a retry starts a new worker', async () => {
    const failing = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'init'
          ? {
              id: msg.id,
              type: 'error',
              payload: { message: "DuckDB's worker failed to start", code: 'WORKER_CRASHED' },
            }
          : null,
    });
    const healthy = createMockWorker();
    const workers = [failing, healthy];
    const factory = vi.fn(() => workers.shift()!.worker);
    const terminate = vi.spyOn(failing.worker, 'terminate');
    const bridge = new WorkerBridge({ workerFactory: factory });

    await expect(bridge.initialize()).rejects.toMatchObject({
      code: 'WORKER_CRASHED',
      message: "DuckDB's worker failed to start",
    });
    await expect(bridge.initialize()).resolves.toBeUndefined();
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(bridge.isInitialized()).toBe(true);
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
