/**
 * Phase 2: cancel routing against the serial queue.
 *
 * `cancel` messages are handled out-of-band (never queued): a queued targetId
 * is dequeued without ever executing, a running query is interrupted via
 * `connection.cancelSent()`, a running init is not cancellable, and anything
 * else reports no-matching-inflight.
 *
 * The dequeue scan must cover EVERY tier — high, normal and low. A tier the
 * scan does not know about falls through to `no-matching-inflight` and never
 * calls the entry's `done()`, leaking the promise `handleMessage` returned
 * for it. The low-tier case is covered in `dispatcher.queue.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  handleMessage,
  __resetDispatcherForTests,
  __getRunningForTests,
  __getQueueDepthsForTests,
  type Respond,
} from '@/worker/dispatcher';
import type { WorkerMessage } from '@/worker/types';

vi.mock('@/worker/duckdb', () => {
  const cancelSent = vi.fn(() => Promise.resolve(true));
  const conn = { cancelSent } as { cancelSent: ReturnType<typeof vi.fn> };
  return {
    initializeDuckDB: vi.fn(() => Promise.resolve()),
    executeQuery: vi.fn(() => Promise.resolve([])),
    executeQueryCancellable: vi.fn(() => Promise.resolve([])),
    getConnection: vi.fn(() => conn),
    getDatabase: vi.fn(() => ({})),
    isInitialized: vi.fn(() => true),
    __conn: conn,
  };
});

vi.mock('@/worker/loaders/csv', () => ({
  loadCSV: vi.fn(() => Promise.resolve({ tableName: 't', rowCount: 0, columns: [], schema: [] })),
}));
vi.mock('@/worker/loaders/json', () => ({
  loadJSON: vi.fn(() => Promise.resolve({ tableName: 't', rowCount: 0, columns: [], schema: [] })),
}));
vi.mock('@/worker/loaders/parquet', () => ({
  loadParquet: vi.fn(() =>
    Promise.resolve({ tableName: 't', rowCount: 0, columns: [], schema: [] }),
  ),
}));

interface CapturedReply {
  id: string;
  type: 'result' | 'error' | 'progress';
  payload: unknown;
}

function captureRespond(): { respond: Respond; replies: CapturedReply[] } {
  const replies: CapturedReply[] = [];
  const respond: Respond = (id, type, payload) => {
    replies.push({ id, type, payload });
  };
  return { respond, replies };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('worker dispatcher — cancel routing', () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetDispatcherForTests();
  });

  it('cancel of a queued id dequeues it without execution', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
    };
    const deferreds: Record<string, Deferred<unknown[]>> = {
      'SELECT 1': deferred<unknown[]>(),
      'SELECT 2': deferred<unknown[]>(),
    };
    duckdbMock.executeQueryCancellable.mockImplementation((sql: string) => deferreds[sql].promise);

    const { respond: respond1 } = captureRespond();
    const { respond: respond2, replies: replies2 } = captureRespond();

    const p1 = handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    const p2 = handleMessage(
      { id: 'q2', type: 'query', payload: { sql: 'SELECT 2' } } as WorkerMessage,
      respond2,
    );
    expect(__getRunningForTests()).toEqual({ id: 'q1', type: 'query' });
    expect(__getQueueDepthsForTests()).toEqual({ high: 0, normal: 1, low: 0 });

    const { respond: cancelRespond, replies: cancelReplies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q2' } } as WorkerMessage,
      cancelRespond,
    );

    // q2's query fn was never invoked: only q1's SQL ever reached executeQueryCancellable.
    expect(duckdbMock.executeQueryCancellable).toHaveBeenCalledTimes(1);
    expect(duckdbMock.executeQueryCancellable).toHaveBeenCalledWith('SELECT 1');

    // The dequeued target gets a QUERY_CANCELLED error on its own respond…
    expect(replies2).toHaveLength(1);
    expect(replies2[0]).toMatchObject({
      id: 'q2',
      type: 'error',
      payload: { message: 'Cancelled before execution', code: 'QUERY_CANCELLED' },
    });

    // …and the cancel message reports the dequeue.
    expect(cancelReplies).toHaveLength(1);
    expect(cancelReplies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: true, reason: 'dequeued' },
    });

    // The removed entry's handleMessage promise must still resolve.
    await p2;

    expect(__getQueueDepthsForTests()).toEqual({ high: 0, normal: 0, low: 0 });
    expect(replies2).toHaveLength(1); // no second reply after the dequeue

    deferreds['SELECT 1'].resolve([]);
    await p1;
  });

  it('cancel of the running id calls cancelSent exactly once', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
    };
    const d1 = deferred<unknown[]>();
    duckdbMock.executeQueryCancellable.mockImplementation(() => d1.promise);
    duckdbMock.__conn.cancelSent.mockResolvedValueOnce(true);

    const { respond: respond1 } = captureRespond();
    const p1 = handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    expect(__getRunningForTests()).toEqual({ id: 'q1', type: 'query' });

    const { respond: cancelRespond, replies: cancelReplies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q1' } } as WorkerMessage,
      cancelRespond,
    );

    expect(duckdbMock.__conn.cancelSent).toHaveBeenCalledTimes(1);
    expect(cancelReplies).toHaveLength(1);
    expect(cancelReplies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: true },
    });

    // Settle the running query so nothing leaks past this test.
    d1.resolve([]);
    await p1;
  });

  it('cancel of an unknown or completed id reports no-matching-inflight', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
    };
    duckdbMock.executeQueryCancellable.mockImplementation(() => Promise.resolve([]));

    const { respond: respond1, replies: replies1 } = captureRespond();
    await handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    expect(replies1[0]).toMatchObject({ id: 'q1', type: 'result' });
    expect(__getRunningForTests()).toBeNull();

    const { respond: cancelRespond, replies: cancelReplies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q1' } } as WorkerMessage,
      cancelRespond,
    );

    expect(cancelReplies).toHaveLength(1);
    expect(cancelReplies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: false, reason: 'no-matching-inflight' },
    });
    expect(duckdbMock.__conn.cancelSent).not.toHaveBeenCalled();
  });

  it('wrong-cancel regression: cancel of a queued id must not touch the running query', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
    };
    const deferreds: Record<string, Deferred<unknown[]>> = {
      'SELECT 1': deferred<unknown[]>(),
      'SELECT 2': deferred<unknown[]>(),
    };
    duckdbMock.executeQueryCancellable.mockImplementation((sql: string) => deferreds[sql].promise);

    const { respond: respond1, replies: replies1 } = captureRespond();
    const { respond: respond2 } = captureRespond();

    const p1 = handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    const p2 = handleMessage(
      { id: 'q2', type: 'query', payload: { sql: 'SELECT 2' } } as WorkerMessage,
      respond2,
    );

    const { respond: cancelRespond, replies: cancelReplies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q2' } } as WorkerMessage,
      cancelRespond,
    );

    // The queued target took the dequeue path — no DuckDB interrupt was sent,
    // so the running q1 was not collaterally cancelled.
    expect(cancelReplies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: true, reason: 'dequeued' },
    });
    expect(duckdbMock.__conn.cancelSent).not.toHaveBeenCalled();

    deferreds['SELECT 1'].resolve([{ n: 1 }]);
    await p1;

    // q1 completed normally, unaffected by the cancel aimed at q2.
    expect(replies1).toHaveLength(1);
    expect(replies1[0]).toMatchObject({ id: 'q1', type: 'result', payload: { rows: [{ n: 1 }] } });

    await p2;
  });

  it('cancel targeting a running init is not-cancellable', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      initializeDuckDB: ReturnType<typeof vi.fn>;
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
    };
    duckdbMock.initializeDuckDB.mockImplementationOnce(() => new Promise(() => undefined));

    const { respond: initRespond } = captureRespond();
    void handleMessage({ id: 'i1', type: 'init', payload: {} } as WorkerMessage, initRespond);
    expect(__getRunningForTests()).toEqual({ id: 'i1', type: 'init' });

    const { respond: cancelRespond, replies: cancelReplies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'i1' } } as WorkerMessage,
      cancelRespond,
    );

    expect(cancelReplies).toHaveLength(1);
    expect(cancelReplies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: false, reason: 'not-cancellable' },
    });
    expect(duckdbMock.__conn.cancelSent).not.toHaveBeenCalled();
  });
});
