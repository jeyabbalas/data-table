// @vitest-environment jsdom
/**
 * A request must not wait for good on a reply that will never come: a
 * worker that fails, a message that cannot be deserialized, a message the
 * bridge cannot attribute, or a request that never reached the worker.
 */
import { describe, it, expect, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { WorkerInitError, WorkerTerminatedError } from '@/core/errors';
import { createTableState } from '@/core/State';
import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

type Settled =
  | { status: 'pending' }
  | { status: 'resolved'; value: unknown }
  | { status: 'rejected'; reason: unknown };

/** How `promise` has settled after `ms`, or `pending`. */
async function settledWithin(promise: Promise<unknown>, ms = 100): Promise<Settled> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<Settled>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'pending' }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value): Settled => ({ status: 'resolved', value }),
        (reason: unknown): Settled => ({ status: 'rejected', reason }),
      ),
      pending,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function codeOf(settled: Settled): string | undefined {
  if (settled.status !== 'rejected') return undefined;
  return (settled.reason as { code?: string }).code;
}

async function initialized(): Promise<{ bridge: WorkerBridge; mock: MockWorkerHandle }> {
  const mock = createMockWorker();
  const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
  await bridge.initialize();
  return { bridge, mock };
}

function pendingCount(bridge: WorkerBridge): number {
  return (bridge as unknown as { pendingRequests: Map<string, unknown> }).pendingRequests.size;
}

describe('WorkerBridge — a worker error after init', () => {
  it('rejects every pending request with WORKER_CRASHED', async () => {
    const { bridge, mock } = await initialized();
    const query = bridge.query('SELECT 1');
    const load = bridge.loadData('a,b\n1,2', { format: 'csv' });
    const exported = bridge.exportToBuffer('SELECT 1', 'parquet');
    await mock.waitForPosts(4);

    mock.emitError('Uncaught RangeError: out of bounds');

    for (const request of [query, load, exported]) {
      const settled = await settledWithin(request);
      expect(settled.status).toBe('rejected');
      expect(settled.status === 'rejected' && settled.reason).toBeInstanceOf(WorkerInitError);
      expect(codeOf(settled)).toBe('WORKER_CRASHED');
    }
    expect(pendingCount(bridge)).toBe(0);
  });

  it('terminates the worker, so a reply it sends later is not taken', async () => {
    const { bridge, mock } = await initialized();
    const terminate = vi.spyOn(mock.worker, 'terminate');
    const query = bridge.query('SELECT 1');
    await mock.waitForPosts(2);

    mock.emitError();
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(bridge.isInitialized()).toBe(false);
    expect(codeOf(await settledWithin(query))).toBe('WORKER_CRASHED');
  });

  it('rejects later calls at once, naming the failure, without posting them', async () => {
    const { bridge, mock } = await initialized();
    mock.emitError('Uncaught Error: boom');
    const posts = mock.posted.length;

    for (const call of [
      () => bridge.query('SELECT 1'),
      () => bridge.loadData('a\n1', { format: 'csv' }),
      () => bridge.exportToBuffer('SELECT 1', 'parquet'),
      () => bridge.dropTable('t'),
    ]) {
      const settled = await settledWithin(call());
      expect(settled.status).toBe('rejected');
      expect(codeOf(settled)).toBe('WORKER_CRASHED');
      expect(String((settled as { reason: Error }).reason.message)).toContain(
        'Uncaught Error: boom',
      );
    }
    expect(mock.posted.length).toBe(posts);
  });

  it('gives every caller sharing the bridge the same clear error', async () => {
    const { bridge, mock } = await initialized();
    // Two tables on one bridge: each has a request in flight.
    const tableA = bridge.query('SELECT * FROM "a"');
    const tableB = bridge.query('SELECT * FROM "b"');
    await mock.waitForPosts(3);

    mock.emitError();

    expect(codeOf(await settledWithin(tableA))).toBe('WORKER_CRASHED');
    expect(codeOf(await settledWithin(tableB))).toBe('WORKER_CRASHED');
    const later = await settledWithin(bridge.query('SELECT * FROM "b"'));
    expect(codeOf(later)).toBe('WORKER_CRASHED');
    expect(String((later as { reason: Error }).reason.message)).toMatch(/every table/);
  });

  it('starts a new worker on initialize(), which then answers', async () => {
    const first = createMockWorker();
    const second = createMockWorker();
    const workers = [first, second];
    const bridge = new WorkerBridge({ workerFactory: () => workers.shift()!.worker });
    await bridge.initialize();
    first.emitError();

    await bridge.initialize();
    expect(bridge.isInitialized()).toBe(true);
    const query = bridge.query<{ x: number }>('SELECT 1 AS x', undefined, { cache: false });
    await second.waitForPosts(2);
    second.reply((m) => m.type === 'query', { rows: [{ x: 1 }] });
    expect(await settledWithin(query)).toEqual({ status: 'resolved', value: [{ x: 1 }] });
  });

  it('forgets cached results, which came from the failed worker', async () => {
    const first = createMockWorker();
    const second = createMockWorker();
    const workers = [first, second];
    const bridge = new WorkerBridge({ workerFactory: () => workers.shift()!.worker });
    await bridge.initialize();
    const cached = bridge.query('SELECT 1 AS x');
    await first.waitForPosts(2);
    first.reply((m) => m.type === 'query', { rows: [{ x: 'old' }] });
    await cached;

    first.emitError();
    await bridge.initialize();
    const again = bridge.query('SELECT 1 AS x');
    await second.waitForPosts(2);
    second.reply((m) => m.type === 'query', { rows: [{ x: 'new' }] });
    expect(await settledWithin(again)).toEqual({ status: 'resolved', value: [{ x: 'new' }] });
  });

  it('after a failed init, rejects calls instead of posting into the failed worker', async () => {
    const mock = createMockWorker({ autoInit: false });
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    const init = bridge.initialize();
    await mock.waitForPosts(1);

    mock.emitError('Uncaught SyntaxError: bad worker');
    await expect(init).rejects.toMatchObject({ code: 'WORKER_CRASHED' });

    const posts = mock.posted.length;
    const settled = await settledWithin(bridge.query('SELECT 1'));
    expect(codeOf(settled)).toBe('WORKER_CRASHED');
    expect(mock.posted.length).toBe(posts);
  });

  it('terminate() after a failure leaves the bridge merely uninitialized', async () => {
    const { bridge, mock } = await initialized();
    mock.emitError();
    bridge.terminate();
    const settled = await settledWithin(bridge.query('SELECT 1'));
    expect(codeOf(settled)).toBe('BRIDGE_NOT_READY');
  });
});

describe('WorkerBridge — events from a worker it no longer uses', () => {
  it('an error or messageerror from a replaced worker leaves the new one alone', async () => {
    const first = createMockWorker();
    const second = createMockWorker();
    const workers = [first, second];
    const bridge = new WorkerBridge({ workerFactory: () => workers.shift()!.worker });
    await bridge.initialize();
    const staleOnError = first.worker.onerror as unknown as (ev: unknown) => void;
    const staleOnMessageError = first.worker.onmessageerror as unknown as (ev: unknown) => void;
    first.emitError();
    await bridge.initialize();

    const query = bridge.query<{ x: number }>('SELECT 1 AS x', undefined, { cache: false });
    await second.waitForPosts(2);
    staleOnError({ type: 'error', message: 'late' });
    staleOnMessageError({ type: 'messageerror' });

    expect(bridge.isInitialized()).toBe(true);
    expect((await settledWithin(query, 20)).status).toBe('pending');
    second.reply((m) => m.type === 'query', { rows: [{ x: 1 }] });
    expect(await settledWithin(query)).toEqual({ status: 'resolved', value: [{ x: 1 }] });
  });

  it('terminate() before the ready signal rejects initialize() at once, timeout or no', async () => {
    const stuck = createMockWorker({ inert: true, autoReady: false });
    const fresh = createMockWorker();
    const workers = [stuck, fresh];
    const bridge = new WorkerBridge({
      workerFactory: () => workers.shift()!.worker,
      initializeTimeoutMs: 50,
    });
    const first = bridge.initialize();
    bridge.terminate();

    const settled = await settledWithin(first, 20);
    expect(settled.status === 'rejected' && settled.reason).toBeInstanceOf(WorkerTerminatedError);
    expect(codeOf(settled)).toBe('WORKER_TERMINATED');

    // The first init's timeout, had it been left running, would fire by now
    // and take down the worker the bridge has then.
    await bridge.initialize();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(bridge.isInitialized()).toBe(true);
    const query = bridge.query<{ x: number }>('SELECT 1 AS x', undefined, { cache: false });
    await fresh.waitForPosts(2);
    fresh.reply((m) => m.type === 'query', { rows: [{ x: 1 }] });
    expect(await settledWithin(query)).toEqual({ status: 'resolved', value: [{ x: 1 }] });
  });

  it('terminate() while the init message awaits its reply rejects initialize() at once', async () => {
    const mock = createMockWorker({ autoInit: false });
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    const init = bridge.initialize();
    await mock.waitForPosts(1);

    bridge.terminate();

    expect(codeOf(await settledWithin(init, 20))).toBe('WORKER_TERMINATED');
  });
});

describe('WorkerBridge — a worker script that fails to load', () => {
  it('says so, rather than "Worker error: undefined"', async () => {
    const mock = createMockWorker({ autoReady: false });
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    const init = bridge.initialize();

    mock.emitError(null);

    await expect(init).rejects.toMatchObject({
      code: 'WORKER_CRASHED',
      message: 'The worker script failed to load',
    });
  });

  it('names the script when the bridge was given its URL', async () => {
    const original = globalThis.Worker;
    const created: { worker?: { onerror: ((event: unknown) => void) | null } } = {};
    (globalThis as { Worker: unknown }).Worker = function FakeWorker(
      this: Record<string, unknown>,
    ) {
      Object.assign(this, {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onmessage: null,
        onerror: null,
        onmessageerror: null,
      });
      created.worker = this as unknown as { onerror: ((event: unknown) => void) | null };
    };
    try {
      const bridge = new WorkerBridge({ workerUrl: '/assets/dt-worker.js' });
      const init = bridge.initialize();

      created.worker!.onerror!({ type: 'error' });

      await expect(init).rejects.toMatchObject({
        code: 'WORKER_CRASHED',
        message: 'The worker script failed to load (/assets/dt-worker.js)',
      });
    } finally {
      globalThis.Worker = original;
    }
  });
});

describe('WorkerBridge — onWorkerFailure', () => {
  it('tells each listener once, with the error pending requests reject with', async () => {
    const { bridge, mock } = await initialized();
    const heard: unknown[] = [];
    bridge.onWorkerFailure((error) => heard.push(error));
    const off = bridge.onWorkerFailure(() => heard.push('removed'));
    off();
    const query = bridge.query('SELECT 1');
    await mock.waitForPosts(2);

    mock.emitError();

    const settled = await settledWithin(query);
    expect(codeOf(settled)).toBe('WORKER_CRASHED');
    expect(heard).toEqual([(settled as { reason: unknown }).reason]);
  });

  it('tells the others when one listener throws', async () => {
    const { bridge, mock } = await initialized();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const heard: string[] = [];
    bridge.onWorkerFailure(() => {
      throw new Error('listener bug');
    });
    bridge.onWorkerFailure(() => heard.push('second'));

    mock.emitError();

    expect(heard).toEqual(['second']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(codeOf(await settledWithin(bridge.query('SELECT 1')))).toBe('WORKER_CRASHED');
    error.mockRestore();
  });

  it('tells nothing of a messageerror or a terminate()', async () => {
    const { bridge, mock } = await initialized();
    const heard: unknown[] = [];
    bridge.onWorkerFailure((error) => heard.push(error));

    mock.emitMessageError();
    bridge.terminate();

    expect(heard).toEqual([]);
  });
});

describe('WorkerBridge — a reply that cannot be attributed', () => {
  it('a messageerror rejects every pending request, cancels it, and the worker carries on', async () => {
    const { bridge, mock } = await initialized();
    const q1 = bridge.query('SELECT 1', undefined, { cache: false });
    const q2 = bridge.query('SELECT 2', undefined, { cache: false });
    await mock.waitForPosts(3);
    const ids = mock.posted.filter((m) => m.type === 'query').map((m) => m.id);

    mock.emitMessageError();

    for (const request of [q1, q2]) {
      const settled = await settledWithin(request);
      expect(settled.status === 'rejected' && settled.reason).toBeInstanceOf(WorkerInitError);
      expect(codeOf(settled)).toBe('WORKER_PROTOCOL_VIOLATION');
    }
    const cancelled = mock.posted
      .filter((m) => m.type === 'cancel')
      .map((m) => (m.payload as { targetId: string }).targetId);
    expect(cancelled.sort()).toEqual([...ids].sort());
    expect(pendingCount(bridge)).toBe(0);

    // The worker is still used for new work.
    const posts = mock.posted.length;
    const q3 = bridge.query<{ x: number }>('SELECT 3 AS x', undefined, { cache: false });
    await mock.waitForPosts(posts + 1);
    const posted = mock.posted[posts]!;
    expect(posted.type).toBe('query');
    mock.sendFromWorker({ id: posted.id, type: 'result', payload: { rows: [{ x: 3 }] } });
    expect(await settledWithin(q3)).toEqual({ status: 'resolved', value: [{ x: 3 }] });
  });

  it('a non-object message rejects every pending request', async () => {
    const { bridge, mock } = await initialized();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const query = bridge.query('SELECT 1');
    await mock.waitForPosts(2);

    mock.sendRaw('garbled reply');

    expect(codeOf(await settledWithin(query))).toBe('WORKER_PROTOCOL_VIOLATION');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a message without a string id rejects every pending request', async () => {
    const { bridge, mock } = await initialized();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const query = bridge.query('SELECT 1');
    await mock.waitForPosts(2);

    mock.sendRaw({ id: 2, type: 'result', payload: { rows: [] } });

    expect(codeOf(await settledWithin(query))).toBe('WORKER_PROTOCOL_VIOLATION');
    warn.mockRestore();
  });

  it('a non-object message before the ready signal does not throw in the handshake', async () => {
    const mock = createMockWorker({ autoReady: false });
    const bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const init = bridge.initialize();
    await Promise.resolve();

    mock.sendRaw(null);
    mock.sendFromWorker({ id: '__ready__', type: 'result', payload: { ready: true } });

    expect((await settledWithin(init)).status).toBe('resolved');
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('a reply to no pending request is still dropped quietly', async () => {
    const { bridge, mock } = await initialized();
    const query = bridge.query<{ x: number }>('SELECT 1 AS x');
    await mock.waitForPosts(2);

    mock.sendFromWorker({ id: 'msg-999', type: 'result', payload: { rows: [] } });

    expect((await settledWithin(query)).status).toBe('pending');
    mock.reply((m) => m.type === 'query', { rows: [{ x: 1 }] });
    expect(await settledWithin(query)).toEqual({ status: 'resolved', value: [{ x: 1 }] });
  });
});

describe('WorkerBridge — a malformed reply to a pending request', () => {
  it('a result without a payload rejects that request only', async () => {
    const { bridge, mock } = await initialized();
    const q1 = bridge.query('SELECT 1', undefined, { cache: false });
    const q2 = bridge.query<{ x: number }>('SELECT 2 AS x', undefined, { cache: false });
    await mock.waitForPosts(3);
    const [first, second] = mock.posted.filter((m) => m.type === 'query');

    mock.sendRaw({ id: first!.id, type: 'result' });

    const settled = await settledWithin(q1);
    expect(settled.status === 'rejected' && settled.reason).toBeInstanceOf(WorkerInitError);
    expect(codeOf(settled)).toBe('WORKER_PROTOCOL_VIOLATION');
    expect((await settledWithin(q2)).status).toBe('pending');
    mock.sendFromWorker({ id: second!.id, type: 'result', payload: { rows: [{ x: 2 }] } });
    expect(await settledWithin(q2)).toEqual({ status: 'resolved', value: [{ x: 2 }] });
  });
});

describe('WorkerBridge — a request that never reaches the worker', () => {
  it('rejects with the clone error and keeps nothing pending', async () => {
    const { bridge, mock } = await initialized();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const cloneError = new DOMException('ArrayBuffer is detached', 'DataCloneError');
    vi.spyOn(mock.worker, 'postMessage').mockImplementationOnce(() => {
      throw cloneError;
    });

    const settled = await settledWithin(bridge.query('SELECT 1', controller.signal));

    expect(settled).toEqual({ status: 'rejected', reason: cloneError });
    expect(pendingCount(bridge)).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
  });
});

describe('Two tables on one bridge whose worker fails', () => {
  it('a load in flight and a later read both reject with WORKER_CRASHED', async () => {
    const { bridge, mock } = await initialized();
    const tableA = new StateActions(createTableState(), bridge);
    const stateB = createTableState();
    stateB.tableName.set('b');
    stateB.schema.set([{ name: 'b', type: 'integer', nullable: true }]);
    const tableB = new StateActions(stateB, bridge);
    const load = tableA.loadData('a,b\n1,2\n', { format: 'csv', tableName: 'a' });
    await mock.waitForPosts(2);

    mock.emitError();

    expect(codeOf(await settledWithin(load))).toBe('WORKER_CRASHED');
    expect(codeOf(await settledWithin(tableB.getColumnValues('b')))).toBe('WORKER_CRASHED');
  });
});
