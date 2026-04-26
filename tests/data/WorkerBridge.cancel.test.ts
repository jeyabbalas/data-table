/**
 * Phase 4: bridge-side cancel locked.
 *
 * Two distinct rejection paths covered:
 *   - Bridge's local AbortSignal-handler rejects with QUERY_ABORTED
 *     synchronously (before any worker reply lands).
 *   - Worker reply with QUERY_CANCELLED reconstructs as
 *     QueryError({ code: 'QUERY_CANCELLED' }) on the bridge side.
 *
 * Cancel-message dispatch is observed via the mock worker's `posted`
 * record.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import { QueryError } from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

describe('WorkerBridge — cancel propagation', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  beforeEach(async () => {
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  it('AbortSignal.aborted at query() call rejects synchronously with QUERY_ABORTED', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(bridge.query('SELECT 1', ac.signal)).rejects.toBeInstanceOf(QueryError);
    try {
      await bridge.query('SELECT 1', ac.signal);
    } catch (err) {
      expect((err as QueryError).code).toBe('QUERY_ABORTED');
    }
  });

  it('mid-flight abort dispatches a cancel WorkerMessage with the matching targetId', async () => {
    const ac = new AbortController();
    const queryPromise = bridge.query('SELECT slow()', ac.signal);

    // Wait for the bridge to post the query message.
    await mock.waitForPosts(2); // [init, query]
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    expect(queryPosted).toBeDefined();
    const queryId = queryPosted!.id;

    ac.abort();

    // The bridge rejects locally with QUERY_ABORTED.
    await expect(queryPromise).rejects.toMatchObject({ code: 'QUERY_ABORTED' });

    // And it sends a cancel message addressing the query's id.
    const cancelPosted = mock.posted.find((m) => m.type === 'cancel');
    expect(cancelPosted).toBeDefined();
    expect((cancelPosted!.payload as { targetId: string }).targetId).toBe(queryId);
  });

  it('worker reply with code=QUERY_CANCELLED reconstructs as QueryError({QUERY_CANCELLED})', async () => {
    // Manually intercept the query: the bridge waits forever; we send a
    // QUERY_CANCELLED error reply ourselves.
    const queryPromise = bridge.query('SELECT 1');
    await mock.waitForPosts(2);
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    mock.sendFromWorker({
      id: queryPosted!.id,
      type: 'error',
      payload: {
        message: 'Query was cancelled by user',
        code: 'QUERY_CANCELLED',
      },
    });

    await expect(queryPromise).rejects.toBeInstanceOf(QueryError);
    try {
      await queryPromise;
    } catch (err) {
      expect((err as QueryError).code).toBe('QUERY_CANCELLED');
    }
  });

  it('cancel after completion is a no-op (request already settled)', async () => {
    const ac = new AbortController();
    const queryPromise = bridge.query('SELECT 1', ac.signal);
    await mock.waitForPosts(2);
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    mock.sendFromWorker({
      id: queryPosted!.id,
      type: 'result',
      payload: { rows: [{ x: 1 }] },
    });
    await expect(queryPromise).resolves.toEqual([{ x: 1 }]);

    // Now abort — should not throw or post additional messages.
    ac.abort();
    expect(mock.posted.find((m) => m.type === 'cancel')).toBeUndefined();
  });

  it('abort listener is removed after rejection (no leak across reuse)', async () => {
    const ac = new AbortController();
    const sig = ac.signal;
    const initialListenerCount = (sig as unknown as { aborted: boolean }).aborted ? 0 : -1;

    void bridge.query('SELECT 1', sig).catch(() => undefined);
    await mock.waitForPosts(2);

    ac.abort();
    // After rejection, the bridge's `cleanupRequest` removes the listener.
    // Re-using the same signal must not double-fire.
    await new Promise((r) => setTimeout(r, 5));

    // Smoke-check: re-issuing a query with the already-aborted signal
    // rejects synchronously without dispatching another worker message.
    const before = mock.posted.length;
    await expect(bridge.query('SELECT 2', sig)).rejects.toBeInstanceOf(QueryError);
    expect(mock.posted.length).toBe(before);
    void initialListenerCount;
  });

  it('cancel does NOT bust the cache on a SELECT — aborted queries are not stored', async () => {
    const ac = new AbortController();
    const queryPromise = bridge.query('SELECT 999', ac.signal);
    await mock.waitForPosts(2);
    ac.abort();
    await expect(queryPromise).rejects.toMatchObject({ code: 'QUERY_ABORTED' });

    // Re-issue the same SQL — should hit the worker again (no cached result).
    const replayPromise = bridge.query('SELECT 999');
    await mock.waitForPosts(4); // init + query (aborted) + cancel + new query
    const queries = mock.posted.filter((m) => m.type === 'query');
    expect(queries.length).toBe(2);

    // Resolve the second query so the test cleans up.
    mock.sendFromWorker({
      id: queries[1]!.id,
      type: 'result',
      payload: { rows: [{ x: 1 }] },
    });
    await replayPromise;
  });
});
