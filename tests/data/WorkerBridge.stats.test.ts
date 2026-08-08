/**
 * Phase 0 (`plans/scaling/phase-00-harness.md` §4.2): the `@internal`
 * query-statistics seam on `WorkerBridge`.
 *
 * Every later phase that claims "N fewer queries" reads these counters, so
 * what they count has to be exact, not approximately right. Two facts the
 * suite pins deliberately rather than papering over: an already-aborted
 * send never reaches `postMessage` and so is never counted, and
 * `dropTable` routes its `DROP TABLE` through `query()` and therefore
 * lands in `sent.query` like any other statement.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

/** A mock that answers every query/load/export with a stock result. */
function answeringMock(): MockWorkerHandle {
  return createMockWorker({
    onMessage: (msg) => {
      if (msg.type === 'query') return { id: msg.id, type: 'result', payload: { rows: [] } };
      if (msg.type === 'load') {
        return {
          id: msg.id,
          type: 'result',
          payload: { tableName: 't', rowCount: 0, columns: [], schema: [] },
        };
      }
      if (msg.type === 'export') {
        return { id: msg.id, type: 'result', payload: { buffer: new ArrayBuffer(4) } };
      }
      return undefined;
    },
  });
}

describe('WorkerBridge query statistics', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  afterEach(() => {
    bridge?.terminate();
  });

  it('starts at zero and counts each round trip in its own bucket', async () => {
    mock = answeringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });

    expect(bridge.__getStatsForTests()).toEqual({
      sent: { query: 0, load: 0, export: 0 },
      cacheHits: 0,
      inFlight: 0,
      maxInFlight: 0,
    });

    await bridge.initialize();
    // `init` is a round trip too, but it has no bucket — the three named
    // buckets are what the smoke spec's exact-equality assertion reads.
    expect(bridge.__getStatsForTests().sent).toEqual({ query: 0, load: 0, export: 0 });

    await bridge.query('SELECT 1 AS a');
    await bridge.query('SELECT 2 AS b');
    await bridge.loadData('a,b\n1,2', { format: 'csv' });
    await bridge.exportToBuffer('SELECT 1', 'parquet');

    expect(bridge.__getStatsForTests().sent).toEqual({ query: 2, load: 1, export: 1 });
  });

  it('counts a cache hit instead of a round trip', async () => {
    mock = answeringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const sql = 'SELECT 1 AS a';
    await bridge.query(sql);
    await bridge.query(sql);
    await bridge.query(sql);

    const stats = bridge.__getStatsForTests();
    expect(stats.sent.query).toBe(1);
    expect(stats.cacheHits).toBe(2);

    // A bypassing read is neither a hit nor cached.
    await bridge.query(sql, undefined, { cache: false });
    expect(bridge.__getStatsForTests()).toMatchObject({
      sent: { query: 2 },
      cacheHits: 2,
    });
  });

  it('records dropTable under sent.query — both readouts share one counter', async () => {
    mock = answeringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    await bridge.dropTable('some_table');
    expect(bridge.__getStatsForTests().sent.query).toBe(1);
  });

  it('tracks inFlight as a gauge with a high-water mark', async () => {
    // Hold every query open so three can overlap.
    mock = createMockWorker({ onMessage: () => null });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    // `onMessage: () => null` falls through to the mock's autoInit reply,
    // so initialize() still resolves while every query stays open.
    await bridge.initialize();

    const pending = [
      bridge.query('SELECT 1', undefined, { cache: false }),
      bridge.query('SELECT 2', undefined, { cache: false }),
      bridge.query('SELECT 3', undefined, { cache: false }),
    ];
    await mock.waitForPosts(4); // init + 3 queries

    expect(bridge.__getStatsForTests()).toMatchObject({ inFlight: 3, maxInFlight: 3 });

    for (const sql of ['SELECT 1', 'SELECT 2', 'SELECT 3']) {
      mock.reply((m) => m.type === 'query' && (m.payload as { sql: string }).sql === sql, {
        rows: [],
      });
    }
    await Promise.all(pending);

    // Gauge drains; the high-water mark remembers the peak.
    expect(bridge.__getStatsForTests()).toMatchObject({ inFlight: 0, maxInFlight: 3 });
  });

  it('drains inFlight when a round trip rejects', async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query'
          ? {
              id: msg.id,
              type: 'error',
              payload: { name: 'QueryError', message: 'boom', code: 'QUERY_FAILED' },
            }
          : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    await expect(bridge.query('SELECT bad')).rejects.toThrow();
    expect(bridge.__getStatsForTests()).toMatchObject({ inFlight: 0, sent: { query: 1 } });
  });

  it('drains inFlight when an in-flight request is aborted', async () => {
    mock = createMockWorker({ onMessage: () => null });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    // `onMessage: () => null` falls through to the mock's autoInit reply,
    // so initialize() still resolves while every query stays open.
    await bridge.initialize();

    const controller = new AbortController();
    const pending = bridge.query('SELECT 1', controller.signal, { cache: false });
    await mock.waitForPosts(2);
    expect(bridge.__getStatsForTests().inFlight).toBe(1);

    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(bridge.__getStatsForTests().inFlight).toBe(0);
  });

  it('does not count a send that was aborted before it left', async () => {
    mock = answeringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const controller = new AbortController();
    controller.abort();
    await expect(bridge.query('SELECT 1', controller.signal)).rejects.toThrow('aborted');

    // Nothing was posted, so nothing is counted — and the gauge is clean.
    expect(bridge.__getStatsForTests()).toMatchObject({
      sent: { query: 0, load: 0, export: 0 },
      inFlight: 0,
    });
  });

  it('excludes init and cancel from the named buckets', async () => {
    mock = createMockWorker({ onMessage: () => null });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    // `onMessage: () => null` falls through to the mock's autoInit reply,
    // so initialize() still resolves while every query stays open.
    await bridge.initialize();

    const controller = new AbortController();
    const pending = bridge.query('SELECT 1', controller.signal, { cache: false });
    await mock.waitForPosts(2);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');

    // The abort handler posts a `cancel` inline, bypassing sendMessage —
    // and `init` has no bucket. Neither can move the three named counters.
    expect(mock.posted.map((m) => m.type)).toEqual(
      expect.arrayContaining(['init', 'query', 'cancel']),
    );
    expect(bridge.__getStatsForTests().sent).toEqual({ query: 1, load: 0, export: 0 });
  });

  it('resets counters without corrupting the in-flight gauge', async () => {
    mock = createMockWorker({ onMessage: () => null });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    // `onMessage: () => null` falls through to the mock's autoInit reply,
    // so initialize() still resolves while every query stays open.
    await bridge.initialize();

    const pending = bridge.query('SELECT 1', undefined, { cache: false });
    await mock.waitForPosts(2);

    bridge.__resetStatsForTests();
    // Counters zeroed; the gauge survives because a request is still open.
    expect(bridge.__getStatsForTests()).toEqual({
      sent: { query: 0, load: 0, export: 0 },
      cacheHits: 0,
      inFlight: 1,
      maxInFlight: 1,
    });

    mock.reply((m) => m.type === 'query', { rows: [] });
    await pending;
    expect(bridge.__getStatsForTests()).toMatchObject({ inFlight: 0, maxInFlight: 1 });
  });

  it('hands back a snapshot, not a live reference', async () => {
    mock = answeringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    const before = bridge.__getStatsForTests();
    await bridge.query('SELECT 1');
    expect(before.sent.query).toBe(0);
    expect(bridge.__getStatsForTests().sent.query).toBe(1);
  });
});
