/**
 * Starting DuckDB's own worker: `initializeDuckDB` in src/worker/duckdb.ts.
 *
 * DuckDB runs in a worker of its own, started from a `blob:` URL that
 * imports the bundle's `mainWorker`. duckdb-wasm only logs an `error` event
 * from that worker, so a script that fails to load used to leave
 * `instantiate()`, and the bridge's init, waiting for its timeout. These
 * tests run the real module against a stand-in for duckdb-wasm and a fake
 * `Worker`; tests/browser/self-hosted-bundles.spec.ts runs the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDuckDB, initializeDuckDB, isInitialized } from '@/worker/duckdb';

const duck = vi.hoisted(() => ({
  instantiate: vi.fn<(mainModule: string, pthreadWorker: string | null) => Promise<null>>(),
  open: vi.fn(() => Promise.resolve()),
  connect: vi.fn(() => Promise.resolve({ close: () => Promise.resolve() })),
}));

vi.mock('@duckdb/duckdb-wasm', () => ({
  VoidLogger: class {},
  AsyncDuckDB: class {
    constructor(_logger: unknown, worker: EventTarget) {
      // As duckdb-wasm's AsyncDuckDB does: it logs the event, and the
      // request instantiate() waits on is dropped.
      worker.addEventListener('error', () => undefined);
    }
    instantiate = duck.instantiate;
    open = duck.open;
    connect = duck.connect;
    terminate = () => Promise.resolve();
  },
  selectBundle: (bundles: { eh: { mainModule: string; mainWorker: string } }) =>
    Promise.resolve({
      mainModule: bundles.eh.mainModule,
      mainWorker: bundles.eh.mainWorker,
      pthreadWorker: null,
    }),
  getJsDelivrBundles: () => {
    throw new Error('these tests pass their own bundles');
  },
}));

/** A worker that only takes events: the tests fire them. */
class FakeWorker extends EventTarget {
  terminated = false;
  constructor(readonly url: string) {
    super();
    workers.push(this);
  }
  postMessage(): void {}
  terminate(): void {
    this.terminated = true;
  }
}

let workers: FakeWorker[] = [];
const originalWorker = globalThis.Worker;

const MAIN_WORKER = 'https://app.example/duckdb/duckdb-browser-eh.worker.js';
const BUNDLES = {
  mvp: { mainModule: 'https://app.example/duckdb/duckdb-mvp.wasm', mainWorker: MAIN_WORKER },
  eh: { mainModule: 'https://app.example/duckdb/duckdb-eh.wasm', mainWorker: MAIN_WORKER },
};

/** An `error` event as a worker fires one: with a message for an exception, without one for a script that did not load. */
function errorEvent(message?: string): Event {
  const event = new Event('error', { cancelable: true });
  return message === undefined ? event : Object.assign(event, { message });
}

/** The settled outcome of `promise`, or 'pending' if it has not settled in a few ticks. */
async function outcome(promise: Promise<unknown>): Promise<unknown> {
  const pending = new Promise((resolve) => setTimeout(() => resolve('pending'), 20));
  return Promise.race([
    promise.then(
      () => 'resolved',
      (error: unknown) => error,
    ),
    pending,
  ]);
}

beforeEach(() => {
  workers = [];
  duck.instantiate.mockReset();
  (globalThis as { Worker: unknown }).Worker = FakeWorker;
});

afterEach(async () => {
  await closeDuckDB();
  globalThis.Worker = originalWorker;
});

describe('initializeDuckDB', () => {
  it("rejects a relative bundle URL before starting DuckDB's worker", async () => {
    const error = await outcome(
      initializeDuckDB({
        mvp: BUNDLES.mvp,
        eh: {
          mainModule: BUNDLES.eh.mainModule,
          mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
        },
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('"/duckdb/duckdb-browser-eh.worker.js"');
    expect((error as Error).message).toMatch(/not an absolute URL.*blob: URL/);
    expect(workers).toHaveLength(0);
    expect(isInitialized()).toBe(false);
  });

  it("rejects at once when DuckDB's worker fails as it starts, and cancels the event", async () => {
    duck.instantiate.mockReturnValue(new Promise(() => undefined));
    const init = initializeDuckDB(BUNDLES);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const event = errorEvent(
      "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': " +
        `The script at '${MAIN_WORKER}' failed to load.`,
    );

    workers[0]!.dispatchEvent(event);

    const error = await outcome(init);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /^DuckDB's worker failed to start: Uncaught NetworkError/,
    );
    expect((error as Error).message).toContain(`Check that ${MAIN_WORKER} loads`);
    expect((error as Error).message).not.toMatch(/\.\./);
    // Cancelled, so the library's worker does not report it as its own error too.
    expect(event.defaultPrevented).toBe(true);
    expect(workers[0]!.terminated).toBe(true);
    expect(isInitialized()).toBe(false);
  });

  it('says what to allow when its blob: script does not load', async () => {
    duck.instantiate.mockReturnValue(new Promise(() => undefined));
    const init = initializeDuckDB(BUNDLES);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    expect(workers[0]!.url).toMatch(/^blob:/);

    workers[0]!.dispatchEvent(errorEvent());

    const error = await outcome(init);
    expect((error as Error).message).toMatch(
      /blob: URL.*Content Security Policy.*blob: in worker-src/,
    );
  });

  it('leaves nothing behind when it fails, so the next call starts again', async () => {
    duck.instantiate.mockReturnValueOnce(new Promise(() => undefined));
    const first = initializeDuckDB(BUNDLES);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    workers[0]!.dispatchEvent(errorEvent('Uncaught SyntaxError: bad script'));
    expect(await outcome(first)).toBeInstanceOf(Error);

    duck.instantiate.mockResolvedValueOnce(null);
    await initializeDuckDB(BUNDLES);

    expect(workers).toHaveLength(2);
    expect(duck.instantiate).toHaveBeenCalledTimes(2);
    expect(isInitialized()).toBe(true);
  });

  it('resets after instantiate() itself rejects', async () => {
    duck.instantiate.mockRejectedValueOnce(new Error('duckdb already initialized'));
    expect(await outcome(initializeDuckDB(BUNDLES))).toMatchObject({
      message: 'duckdb already initialized',
    });
    expect(workers[0]!.terminated).toBe(true);
    expect(isInitialized()).toBe(false);

    duck.instantiate.mockResolvedValueOnce(null);
    await initializeDuckDB(BUNDLES);
    expect(isInitialized()).toBe(true);
  });

  it('once DuckDB has started, leaves its errors to reach the bridge', async () => {
    duck.instantiate.mockResolvedValueOnce(null);
    await initializeDuckDB(BUNDLES);
    const event = errorEvent('Uncaught RuntimeError: unreachable');

    workers[0]!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(isInitialized()).toBe(true);
    expect(duck.instantiate).toHaveBeenCalledWith(BUNDLES.eh.mainModule, null);
  });
});
