/**
 * Phase 2: worker-side serial queue.
 *
 * The dispatcher enqueues every non-cancel message into a two-priority FIFO
 * (high before normal) and runs exactly one task at a time. Dequeue is
 * synchronous, and when the running task settles its `finally` pumps the
 * next entry before the settled message's `handleMessage` awaiter resumes.
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

describe('worker dispatcher — serial queue', () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetDispatcherForTests();
  });

  it('serial execution: one task at a time, next pumped synchronously on settle', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
    };
    // SQL-keyed deferreds: each query awaits the promise for its own SQL, no
    // matter in which order the queue executes them (a chain of
    // mockImplementationOnce would be consumed in execution order instead).
    const deferreds: Record<string, Deferred<unknown[]>> = {
      'SELECT 1': deferred<unknown[]>(),
      'SELECT 2': deferred<unknown[]>(),
    };
    duckdbMock.executeQueryCancellable.mockImplementation((sql: string) => deferreds[sql].promise);

    const { respond: respond1, replies: replies1 } = captureRespond();
    const { respond: respond2, replies: replies2 } = captureRespond();

    const p1 = handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    const p2 = handleMessage(
      { id: 'q2', type: 'query', payload: { sql: 'SELECT 2' } } as WorkerMessage,
      respond2,
    );

    // q1 was dequeued and started synchronously; q2 waits in the normal queue.
    expect(duckdbMock.executeQueryCancellable).toHaveBeenCalledTimes(1);
    expect(__getRunningForTests()).toEqual({ id: 'q1', type: 'query' });
    expect(__getQueueDepthsForTests()).toEqual({ high: 0, normal: 1 });

    deferreds['SELECT 1'].resolve([]);
    await p1;

    // The settle-pump already started q2 before p1's awaiter resumed, so
    // running is q2 here — never null between back-to-back tasks.
    expect(duckdbMock.executeQueryCancellable).toHaveBeenCalledTimes(2);
    expect(__getRunningForTests()).toEqual({ id: 'q2', type: 'query' });

    deferreds['SELECT 2'].resolve([]);
    await p2;

    expect(__getRunningForTests()).toBeNull();
    expect(replies1).toHaveLength(1);
    expect(replies1[0]).toMatchObject({ id: 'q1', type: 'result', payload: { rows: [] } });
    expect(replies2).toHaveLength(1);
    expect(replies2[0]).toMatchObject({ id: 'q2', type: 'result', payload: { rows: [] } });
  });

  it('priority ordering: a high-priority query jumps ahead of queued normal work', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQueryCancellable: ReturnType<typeof vi.fn>;
    };
    const deferreds: Record<string, Deferred<unknown[]>> = {
      'SELECT 1': deferred<unknown[]>(),
      'SELECT 2': deferred<unknown[]>(),
      'SELECT 3': deferred<unknown[]>(),
    };
    duckdbMock.executeQueryCancellable.mockImplementation((sql: string) => deferreds[sql].promise);

    // One shared collector for all three queries so the completion ORDER is
    // observable in a single replies array.
    const { respond, replies } = captureRespond();

    const p1 = handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond,
    );
    const p2 = handleMessage(
      { id: 'q2', type: 'query', payload: { sql: 'SELECT 2' } } as WorkerMessage,
      respond,
    );
    const p3 = handleMessage(
      { id: 'q3', type: 'query', payload: { sql: 'SELECT 3', priority: 'high' } } as WorkerMessage,
      respond,
    );

    expect(__getRunningForTests()).toEqual({ id: 'q1', type: 'query' });
    expect(__getQueueDepthsForTests()).toEqual({ high: 1, normal: 1 });

    deferreds['SELECT 1'].resolve([]);
    await p1;

    // High queue beats the earlier-enqueued normal q2.
    expect(__getRunningForTests()).toEqual({ id: 'q3', type: 'query' });

    deferreds['SELECT 3'].resolve([]);
    await p3;

    expect(__getRunningForTests()).toEqual({ id: 'q2', type: 'query' });

    deferreds['SELECT 2'].resolve([]);
    await p2;

    expect(__getRunningForTests()).toBeNull();

    const resultIds = replies.filter((r) => r.type === 'result').map((r) => r.id);
    expect(resultIds).toEqual(['q1', 'q3', 'q2']);
  });
});
