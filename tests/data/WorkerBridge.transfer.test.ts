/**
 * Phase 1 — the load message transfers its source buffer instead of cloning
 * it (`plans/scaling/phase-01-load-path.md` §"zero-copy ingest").
 *
 * `postMessage` structured-clones every byte of its payload by default, so a
 * 200 MB source peaks at 400 MB across the two threads before the worker has
 * read a row. Naming the buffer in the transfer list hands ownership over
 * instead, at the cost of detaching it on the sending side.
 *
 * What this file can prove is the *contract*: the buffer is named in the
 * transfer list, and nothing else is. Actual detachment is a real-`Worker`
 * behavior that a synthetic mock cannot reproduce — `tests/browser/` asserts
 * `byteLength === 0` after a load against a live worker.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

function loadAnsweringMock(): MockWorkerHandle {
  return createMockWorker({
    onMessage: (msg) =>
      msg.type === 'load'
        ? {
            id: msg.id,
            type: 'result',
            payload: { tableName: 't', rowCount: 0, columns: [], schema: [] },
          }
        : undefined,
  });
}

describe('WorkerBridge load transfer list', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  afterEach(() => {
    bridge?.terminate();
  });

  /** Index of the `load` message in the mock's recording. */
  function loadIndex(): number {
    const index = mock.posted.findIndex((m) => m.type === 'load');
    expect(index, 'expected a load message to have been posted').toBeGreaterThan(-1);
    return index;
  }

  it('transfers an ArrayBuffer source', async () => {
    mock = loadAnsweringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    // Allocated through the ambient `ArrayBuffer`, not `TextEncoder`: under
    // vitest's jsdom environment those are two different realms and the
    // `instanceof` check in `loadData` is realm-sensitive. A browser has one
    // realm, so this only matters here.
    const source = new ArrayBuffer(8);
    new Uint8Array(source).set(new TextEncoder().encode('a,b\n1,2'));
    await bridge.loadData(source, { format: 'csv' });

    const i = loadIndex();
    expect(mock.postedTransfers[i]).toEqual([source]);
    // The payload still carries the buffer — the transfer list names it, it
    // does not replace it.
    expect((mock.posted[i]!.payload as { data: unknown }).data).toBe(source);
  });

  it('sends no transfer list for a string source', async () => {
    mock = loadAnsweringMock();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    await bridge.loadData('a,b\n1,2', { format: 'csv' });

    // A string is not transferable; naming one would throw a DataCloneError
    // against a real Worker.
    expect(mock.postedTransfers[loadIndex()]).toEqual([]);
  });

  it('leaves every other message type untransferred', async () => {
    mock = createMockWorker({
      onMessage: (msg) =>
        msg.type === 'query' ? { id: msg.id, type: 'result', payload: { rows: [] } } : undefined,
    });
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();

    await bridge.query('SELECT 1');

    for (const transfer of mock.postedTransfers) expect(transfer).toEqual([]);
  });
});
