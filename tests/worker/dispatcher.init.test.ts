// @vitest-environment jsdom
/**
 * An `init` that fails is a worker that did not start, whatever was thrown.
 *
 * The bridge maps a reply's code to an error class by its prefix. An init
 * failure used to reply with the fallback `QUERY_RUNTIME`, so `initialize()`
 * rejected with a `QueryError`: now it replies `WORKER_CRASHED`, which the
 * bridge rebuilds as a `WorkerInitError`, with the worker's message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryError, WorkerInitError } from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';
import { __resetDispatcherForTests, handleMessage, type Respond } from '@/worker/dispatcher';
import { initializeDuckDB } from '@/worker/duckdb';
import type { WorkerMessage } from '@/worker/types';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

vi.mock('@/worker/duckdb', () => ({
  initializeDuckDB: vi.fn(() => Promise.resolve()),
  executeQuery: vi.fn(() => Promise.resolve([])),
  executeQueryCancellable: vi.fn(() => Promise.resolve([])),
  getConnection: vi.fn(),
  getDatabase: vi.fn(),
  isInitialized: vi.fn(() => false),
}));

interface Reply {
  id: string;
  type: 'result' | 'error' | 'progress';
  payload: unknown;
}

async function init(payload: unknown = {}): Promise<Reply[]> {
  const replies: Reply[] = [];
  const respond: Respond = (id, type, reply) => {
    replies.push({ id, type, payload: structuredClone(reply) });
  };
  await handleMessage({ id: 'init-1', type: 'init', payload } as WorkerMessage, respond);
  return replies;
}

describe('worker dispatcher — init', () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetDispatcherForTests();
  });

  it('passes the bundles on, and replies initialized', async () => {
    const bundles = { mvp: { mainModule: 'https://a/m.wasm', mainWorker: 'https://a/m.js' } };

    expect(await init({ bundles })).toEqual([
      { id: 'init-1', type: 'result', payload: { initialized: true } },
    ]);
    expect(initializeDuckDB).toHaveBeenCalledWith(bundles);
  });

  it('replies WORKER_CRASHED with the error message, whatever code the error had', async () => {
    for (const thrown of [
      new Error("DuckDB's worker failed to start: Uncaught NetworkError"),
      Object.assign(new Error('query-like failure'), { code: 'QUERY_RUNTIME', details: { a: 1 } }),
      // A DOMException's code is a legacy number (18 for a SecurityError).
      Object.assign(new Error("Failed to construct 'Worker'"), { name: 'SecurityError', code: 18 }),
    ]) {
      vi.mocked(initializeDuckDB).mockRejectedValueOnce(thrown);

      const replies = await init();

      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ id: 'init-1', type: 'error' });
      expect(replies[0]!.payload).toMatchObject({
        message: thrown.message,
        code: 'WORKER_CRASHED',
      });
    }
  });

  it('an error that is not an Error still replies WORKER_CRASHED', async () => {
    vi.mocked(initializeDuckDB).mockRejectedValueOnce('a string');

    expect((await init())[0]!.payload).toEqual({
      message: 'DuckDB failed to initialize',
      code: 'WORKER_CRASHED',
    });
  });

  it("makes the bridge's initialize() reject with a WorkerInitError, not a QueryError", async () => {
    vi.mocked(initializeDuckDB).mockRejectedValueOnce(
      new Error("DuckDB's worker could not start from its blob: URL"),
    );
    let mock: MockWorkerHandle | null = null;
    mock = createMockWorker({
      autoInit: false,
      onMessage: (msg) => {
        // The real dispatcher answers, as in the worker.
        void handleMessage(msg, (id, type, payload) =>
          mock!.sendFromWorker({ id, type, payload: structuredClone(payload) }),
        );
        return null;
      },
    });
    const bridge = new WorkerBridge({ workerFactory: () => mock!.worker });

    const error = await bridge.initialize().then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(WorkerInitError);
    expect(error).not.toBeInstanceOf(QueryError);
    expect(error).toMatchObject({
      code: 'WORKER_CRASHED',
      message: "DuckDB's worker could not start from its blob: URL",
    });
    expect(bridge.isInitialized()).toBe(false);
  });

  it('rejects a request sent while init runs, rather than leave it waiting', async () => {
    let failInit: (error: Error) => void = () => undefined;
    vi.mocked(initializeDuckDB).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failInit = reject;
      }),
    );
    let mock: MockWorkerHandle | null = null;
    mock = createMockWorker({
      autoInit: false,
      onMessage: (msg) => {
        // Each reply a task later, as a worker's postMessage arrives.
        void handleMessage(msg, (id, type, payload) => {
          const reply = { id, type, payload: structuredClone(payload) };
          setTimeout(() => mock!.sendFromWorker(reply), 0);
        });
        return null;
      },
    });
    const bridge = new WorkerBridge({ workerFactory: () => mock!.worker });
    const init = bridge.initialize();
    await mock.waitForPosts(1);
    // Queued in the worker behind the init, whose failure ends the worker,
    // and with it this request's reply.
    const query = bridge.query('SELECT 1', undefined, { cache: false });
    await mock.waitForPosts(2);

    failInit(new Error("DuckDB's worker failed to start"));

    await expect(init).rejects.toMatchObject({ code: 'WORKER_CRASHED' });
    const settled = await Promise.race([
      query.then(
        () => 'resolved',
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    expect(settled).toBeInstanceOf(WorkerInitError);
    expect(settled).toMatchObject({
      code: 'WORKER_CRASHED',
      message: "DuckDB's worker failed to start",
    });
  });
});
