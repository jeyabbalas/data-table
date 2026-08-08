/**
 * Phase 2: `QueryOptions` on `WorkerBridge.query`.
 *
 * `cache: false` bypasses the SQL result cache on read AND write (virtual-
 * scroll row fetches must never serve or pollute cached pages), and
 * `priority` is forwarded verbatim in the wire QueryPayload so the worker
 * can order its three-tier queue (`'high'` viewport rows → `'normal'` →
 * `'low'` viz/stats scans). Caching is asserted purely via posted-message
 * counts.
 */
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';

import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

describe('WorkerBridge.query options', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  // The first posted message is always `init` — count query posts only.
  const queryPosts = () => mock.posted.filter((m) => m.type === 'query');

  afterEach(() => {
    bridge.terminate();
  });

  it('cache: false bypasses both cache read and cache write', async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query'
          ? { id: msg.id, type: 'result', payload: { rows: [{ x: 1 }] } }
          : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const sql = 'SELECT 1 AS x';

    // Neither bypassing call reads the cache — both hit the worker.
    await bridge.query(sql, undefined, { cache: false });
    await bridge.query(sql, undefined, { cache: false });
    expect(queryPosts().length).toBe(2);

    // The default path still hits the worker: the bypassing calls must not
    // have WRITTEN the cache either.
    await bridge.query(sql);
    expect(queryPosts().length).toBe(3);

    // That default-path call DID write the cache — the replay is served
    // locally with no new dispatch (re-proves cache read as well).
    await bridge.query(sql);
    expect(queryPosts().length).toBe(3);
  });

  it('default path caches SELECTs', async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query'
          ? { id: msg.id, type: 'result', payload: { rows: [{ answer: 42 }] } }
          : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const sql = 'SELECT 42 AS answer';
    const first = await bridge.query<{ answer: number }>(sql);
    const second = await bridge.query<{ answer: number }>(sql);

    expect(queryPosts().length).toBe(1);
    expect(first).toEqual([{ answer: 42 }]);
    expect(second).toEqual(first);
  });

  it('every explicit priority tier is forwarded in the payload; absent otherwise', async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query'
          ? { id: msg.id, type: 'result', payload: { rows: [{ ok: true }] } }
          : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    await bridge.query('SELECT 2 AS y', undefined, { priority: 'high' });
    await bridge.query('SELECT 3 AS z');
    // 'low' is what every viz/stats fetch sends — it must survive the trip
    // to the wire unchanged, or the whole tier is inert.
    await bridge.query('SELECT 4 AS w', undefined, { priority: 'low' });
    await bridge.query('SELECT 5 AS v', undefined, { priority: 'normal' });

    const posts = queryPosts();
    expect(posts.length).toBe(4);
    expect(posts[0]!.payload).toMatchObject({ sql: 'SELECT 2 AS y', priority: 'high' });
    expect(posts[2]!.payload).toMatchObject({ sql: 'SELECT 4 AS w', priority: 'low' });
    expect(posts[3]!.payload).toMatchObject({ sql: 'SELECT 5 AS v', priority: 'normal' });

    const secondPayload = posts[1]!.payload as Record<string, unknown>;
    expect(secondPayload.sql).toBe('SELECT 3 AS z');
    // The wire payload stays minimal: no `priority` key at all when unset.
    expect('priority' in secondPayload).toBe(false);
  });

  it('aborting one of two pending queries posts a targeted cancel and leaves the other alive', async () => {
    // No auto-answer for queries — the test controls every reply. The
    // default autoInit still answers the init message.
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const controller = new AbortController();
    const q1 = bridge.query<{ a: number }>('SELECT 10 AS a', controller.signal);
    const q2 = bridge.query<{ b: number }>('SELECT 20 AS b');

    await mock.waitForPosts(3); // init + 2 queries
    const posts = queryPosts();
    expect(posts.length).toBe(2);
    expect((posts[0]!.payload as { sql: string }).sql).toBe('SELECT 10 AS a');
    const q1Id = posts[0]!.id;
    const q2Id = posts[1]!.id;

    // Attach the rejection expectation BEFORE aborting so the rejection is
    // never observed as unhandled.
    const q1Rejection = expect(q1).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    controller.abort();
    await q1Rejection;

    const cancelPost = mock.posted.find((m) => m.type === 'cancel');
    expect(cancelPost).toBeDefined();
    expect((cancelPost!.payload as { targetId: string }).targetId).toBe(q1Id);

    // q2 is untouched by the abort: answering it still resolves normally.
    mock.sendFromWorker({ id: q2Id, type: 'result', payload: { rows: [{ b: 20 }] } });
    await expect(q2).resolves.toEqual([{ b: 20 }]);
  });
});
