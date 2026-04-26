/**
 * Phase 4: WorkerBridge handles many concurrent queries without dropping
 * responses, regardless of reply order.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

describe('WorkerBridge — parallel queries', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  beforeEach(async () => {
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  it('100 concurrent queries: every promise resolves to the matching result', async () => {
    // Use distinct SQL strings so the cache doesn't fold them.
    const queries: Array<{ sql: string; idx: number }> = [];
    for (let i = 0; i < 100; i++) {
      queries.push({ sql: `SELECT ${i} AS i`, idx: i });
    }
    const promises = queries.map((q) =>
      bridge.query<{ i: number }>(q.sql).then((rows) => ({ rows, idx: q.idx })),
    );

    // Wait for all 100 query messages to land at the worker.
    await mock.waitForPosts(101); // 1 init + 100 queries

    // Reply in REVERSE order to ensure the bridge doesn't depend on FIFO.
    const queryMessages = mock.posted.filter((m) => m.type === 'query');
    expect(queryMessages.length).toBe(100);
    for (let i = queryMessages.length - 1; i >= 0; i--) {
      const m = queryMessages[i]!;
      const sql = (m.payload as { sql: string }).sql;
      const idx = parseInt(sql.match(/SELECT (\d+) AS i/)![1]!, 10);
      mock.sendFromWorker({
        id: m.id,
        type: 'result',
        payload: { rows: [{ i: idx }] },
      });
    }

    const results = await Promise.all(promises);
    // Every promise resolved with rows whose `i` matches the query's `idx`.
    for (const { rows, idx } of results) {
      expect(rows[0]?.i).toBe(idx);
    }
  });

  it('100 concurrent queries replied in random order — order-independent dispatch', async () => {
    const N = 100;
    const promises: Promise<{ idx: number; rows: Array<{ x: number }> }>[] = [];
    for (let i = 0; i < N; i++) {
      const idx = i;
      promises.push(
        bridge.query<{ x: number }>(`SELECT ${idx} AS x`).then((rows) => ({ idx, rows })),
      );
    }
    await mock.waitForPosts(N + 1);
    const queryMessages = mock.posted.filter((m) => m.type === 'query');
    // Shuffle a copy of the message ids and reply in shuffled order.
    const shuffled = [...queryMessages].sort(() => Math.random() - 0.5);
    for (const m of shuffled) {
      const sql = (m.payload as { sql: string }).sql;
      const idx = parseInt(sql.match(/SELECT (\d+) AS x/)![1]!, 10);
      mock.sendFromWorker({
        id: m.id,
        type: 'result',
        payload: { rows: [{ x: idx }] },
      });
    }
    const results = await Promise.all(promises);
    for (const { idx, rows } of results) {
      expect(rows[0]?.x).toBe(idx);
    }
  });

  it('a single failing query among 99 successes only rejects that one promise', async () => {
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(bridge.query(`SELECT ${i}`).catch((e: unknown) => ({ error: e, idx: i })));
    }
    await mock.waitForPosts(101);
    const queryMessages = mock.posted.filter((m) => m.type === 'query');
    for (const m of queryMessages) {
      const sql = (m.payload as { sql: string }).sql;
      const idx = parseInt(sql.match(/SELECT (\d+)/)![1]!, 10);
      if (idx === 42) {
        mock.sendFromWorker({
          id: m.id,
          type: 'error',
          payload: { message: 'simulated failure', code: 'QUERY_RUNTIME' },
        });
      } else {
        mock.sendFromWorker({
          id: m.id,
          type: 'result',
          payload: { rows: [{ idx }] },
        });
      }
    }
    const results = await Promise.all(promises);
    const successful = results.filter((r) => Array.isArray(r));
    const failed = results.filter((r) => r && (r as { error: unknown }).error);
    expect(successful.length).toBe(99);
    expect(failed.length).toBe(1);
    expect((failed[0] as { error: { code?: string } }).error.code).toBe('QUERY_RUNTIME');
  });

  it('queryCache shortcircuits identical queries — no duplicate worker dispatch', async () => {
    // Issue the same SELECT twice. First time hits worker, second is cached.
    const sql = 'SELECT 1';
    const q1 = bridge.query<{ x: number }>(sql);
    await mock.waitForPosts(2); // init + query
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    mock.sendFromWorker({
      id: queryPosted!.id,
      type: 'result',
      payload: { rows: [{ x: 1 }] },
    });
    await q1;
    const before = mock.posted.length;
    const q2 = bridge.query<{ x: number }>(sql);
    await q2;
    expect(mock.posted.length).toBe(before); // no new postMessage call
  });
});
