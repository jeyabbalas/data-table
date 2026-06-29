/**
 * Phase 4: worker-side cancel.
 *
 * The dispatcher routes `case 'cancel'` to `connection.cancelSent()` and
 * tracks an in-flight reference so a cancel only fires when its `targetId`
 * matches. Errors from a DuckDB interrupt are mapped to the
 * `QUERY_CANCELLED` code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  handleMessage,
  isCancelRejection,
  __resetInFlightForTests,
  __getInFlightForTests,
  type Respond,
} from '@/worker/dispatcher';
import type { WorkerMessage, WorkerResponse } from '@/worker/types';

vi.mock('@/worker/duckdb', () => {
  const cancelSent = vi.fn(() => Promise.resolve(true));
  const conn = { cancelSent } as { cancelSent: ReturnType<typeof vi.fn> };
  let initialized = true;
  return {
    initializeDuckDB: vi.fn(() => Promise.resolve()),
    executeQuery: vi.fn(() => Promise.resolve([])),
    getConnection: vi.fn(() => conn),
    getDatabase: vi.fn(() => ({})),
    isInitialized: vi.fn(() => initialized),
    __setInitialized: (v: boolean) => {
      initialized = v;
    },
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

describe('worker dispatcher — cancel', () => {
  beforeEach(() => {
    __resetInFlightForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetInFlightForTests();
  });

  it('cancel with no in-flight returns { cancelled: false, reason }', async () => {
    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q1' } } as WorkerMessage,
      respond,
    );
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      id: 'c1',
      type: 'result',
      payload: { cancelled: false, reason: 'no-matching-inflight' },
    });
  });

  it('cancel with mismatched targetId returns no-matching-inflight without calling cancelSent', async () => {
    const { __conn } = (await import('@/worker/duckdb')) as unknown as {
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
    };

    // Set up an in-flight query manually by starting one and never resolving.
    // For this test, we simulate it by assigning via the dispatcher's path:
    // start a query that uses a never-resolving executeQuery, then send cancel.
    const { executeQuery } = (await import('@/worker/duckdb')) as unknown as {
      executeQuery: ReturnType<typeof vi.fn>;
    };
    executeQuery.mockImplementationOnce(() => new Promise(() => undefined));

    const { respond: respond1 } = captureRespond();
    void handleMessage(
      { id: 'q-a', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    // Let the query start (microtask).
    await Promise.resolve();
    expect(__getInFlightForTests()).toEqual({ id: 'q-a', type: 'query' });

    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'c1', type: 'cancel', payload: { targetId: 'q-X-different' } } as WorkerMessage,
      respond,
    );
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      type: 'result',
      payload: { cancelled: false, reason: 'no-matching-inflight' },
    });
    expect(__conn.cancelSent).not.toHaveBeenCalled();
  });

  it('cancel with matching targetId calls cancelSent() and replies with the result', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
      executeQuery: ReturnType<typeof vi.fn>;
    };
    duckdbMock.__conn.cancelSent.mockResolvedValueOnce(true);
    duckdbMock.executeQuery.mockImplementationOnce(() => new Promise(() => undefined));

    const { respond: respond1 } = captureRespond();
    void handleMessage(
      { id: 'q-b', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond1,
    );
    await Promise.resolve();
    expect(__getInFlightForTests()?.id).toBe('q-b');

    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'c2', type: 'cancel', payload: { targetId: 'q-b' } } as WorkerMessage,
      respond,
    );
    expect(duckdbMock.__conn.cancelSent).toHaveBeenCalledTimes(1);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      id: 'c2',
      type: 'result',
      payload: { cancelled: true },
    });
  });

  it('cancel returns false when cancelSent reports nothing was running', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      __conn: { cancelSent: ReturnType<typeof vi.fn> };
      executeQuery: ReturnType<typeof vi.fn>;
    };
    duckdbMock.__conn.cancelSent.mockResolvedValueOnce(false);
    duckdbMock.executeQuery.mockImplementationOnce(() => new Promise(() => undefined));

    const { respond: r1 } = captureRespond();
    void handleMessage(
      { id: 'q-c', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      r1,
    );
    await Promise.resolve();

    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'c3', type: 'cancel', payload: { targetId: 'q-c' } } as WorkerMessage,
      respond,
    );
    expect(replies[0]).toMatchObject({
      type: 'result',
      payload: { cancelled: false },
    });
  });

  it('a query rejection with INTERRUPT-shaped message is rewrapped as QUERY_CANCELLED', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQuery: ReturnType<typeof vi.fn>;
    };
    duckdbMock.executeQuery.mockImplementationOnce(() =>
      Promise.reject(new Error('Query was cancelled (INTERRUPT)')),
    );

    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'q-d', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond,
    );

    const errorReply = replies.find((r) => r.type === 'error') as
      (CapturedReply & { payload: { code?: string } }) | undefined;
    expect(errorReply).toBeDefined();
    expect(errorReply!.payload).toMatchObject({ code: 'QUERY_CANCELLED' });
  });

  it('non-cancel query rejections still surface their original code', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQuery: ReturnType<typeof vi.fn>;
    };
    const original = Object.assign(new Error('syntax error at line 1'), {
      code: 'QUERY_RUNTIME',
    });
    duckdbMock.executeQuery.mockImplementationOnce(() => Promise.reject(original));

    const { respond, replies } = captureRespond();
    await handleMessage(
      { id: 'q-e', type: 'query', payload: { sql: 'SELECT bad' } } as WorkerMessage,
      respond,
    );
    const errorReply = replies.find((r) => r.type === 'error') as
      (CapturedReply & { payload: { code?: string } }) | undefined;
    expect(errorReply).toBeDefined();
    expect(errorReply!.payload).toMatchObject({ code: 'QUERY_RUNTIME' });
  });

  it('finally clears in-flight after each query, success or failure', async () => {
    const duckdbMock = (await import('@/worker/duckdb')) as unknown as {
      executeQuery: ReturnType<typeof vi.fn>;
    };
    duckdbMock.executeQuery.mockResolvedValueOnce([{ x: 1 }]);
    const { respond } = captureRespond();
    await handleMessage(
      { id: 'q-f1', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond,
    );
    expect(__getInFlightForTests()).toBeNull();

    duckdbMock.executeQuery.mockRejectedValueOnce(new Error('boom'));
    const { respond: respond2 } = captureRespond();
    await handleMessage(
      { id: 'q-f2', type: 'query', payload: { sql: 'SELECT 1' } } as WorkerMessage,
      respond2,
    );
    expect(__getInFlightForTests()).toBeNull();
  });

  it('isCancelRejection matches INTERRUPT, interrupted, and cancelled phrases', () => {
    expect(isCancelRejection(new Error('INTERRUPT Error: query interrupted'))).toBe(true);
    expect(isCancelRejection(new Error('Query was interrupted by user'))).toBe(true);
    expect(isCancelRejection(new Error('Query was cancelled'))).toBe(true);
    expect(isCancelRejection(new Error('Query was canceled'))).toBe(true); // single-l variant
    expect(isCancelRejection(new Error('Syntax error in query'))).toBe(false);
    expect(isCancelRejection('not an error')).toBe(false);
    expect(isCancelRejection(null)).toBe(false);
  });
});
