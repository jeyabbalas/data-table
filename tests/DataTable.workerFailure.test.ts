/**
 * A table whose bridge's worker fails reports it once: an `error` event with
 * `source: 'query'`, as the bridge tells of it, whatever fails after it. With
 * the charts off, nothing else would: the body logged a row fetch failing,
 * and retried it at most every 8 s, for good. With them on, each chart's
 * fetch was an `error` event of its own.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import { WorkerInitError } from '@/core/errors';
import type { TableEvents } from '@/core/TableEvents';
import type { WorkerBridge } from '@/data/WorkerBridge';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const LOADED = {
  tableName: 't',
  rowCount: 2,
  columns: ['a'],
  schema: [{ name: 'a', type: 'integer', nullable: true, originalType: 'INTEGER' }],
};

function crash(message = 'Worker error: boom'): WorkerInitError {
  return new WorkerInitError(message, { code: 'WORKER_CRASHED' });
}

/** A bridge double that lets a test fail its worker. */
function makeBridge() {
  const listeners = new Set<(error: WorkerInitError) => void>();
  const bridge = {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue(LOADED),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    dropTable: vi.fn().mockResolvedValue(undefined),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    onWorkerFailure: vi.fn((listener: (error: WorkerInitError) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
  const fail = (error: WorkerInitError) => {
    for (const listener of [...listeners]) listener(error);
  };
  return { bridge, listeners, fail };
}

let table: DataTable | undefined;

afterEach(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
  table = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function mount(bridge: ReturnType<typeof makeBridge>['bridge']) {
  const container = document.createElement('div');
  container.style.height = '400px';
  document.body.appendChild(container);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  table = await createDataTable({
    container,
    bridge: bridge as unknown as WorkerBridge,
    persistence: false,
    presets: false,
    visualizations: false,
    source: 'a\n1\n2\n',
    sourceFormat: 'csv',
  });
  const errors: TableEvents['error'][] = [];
  const loadErrors: TableEvents['loadError'][] = [];
  table.on('error', (payload) => errors.push(payload));
  table.on('loadError', (payload) => loadErrors.push(payload));
  return { table, errors, loadErrors };
}

describe('a table whose worker fails', () => {
  it('reports it once, as an error from the query source', async () => {
    const { bridge, fail } = makeBridge();
    const { errors } = await mount(bridge);
    const error = crash();

    fail(error);
    fail(crash('Worker error: again'));

    expect(errors).toEqual([{ error, source: 'query' }]);
  });

  it('drops the same error from a load after it, which still rejects and fires loadError', async () => {
    const { bridge, fail } = makeBridge();
    const { table, errors, loadErrors } = await mount(bridge);
    fail(crash());
    bridge.loadData.mockRejectedValueOnce(crash('The DuckDB worker failed'));

    await expect(table.loadData('a\n3\n', { sourceFormat: 'csv' })).rejects.toMatchObject({
      code: 'WORKER_CRASHED',
    });

    expect(errors.map((e) => e.source)).toEqual(['query']);
    expect(loadErrors).toHaveLength(1);
  });

  it('reports the next failure again once a load has landed', async () => {
    const { bridge, fail } = makeBridge();
    const { table, errors } = await mount(bridge);
    fail(crash());
    await table.loadData('a\n3\n', { sourceFormat: 'csv' });

    fail(crash('Worker error: later'));

    expect(errors.map((e) => e.error.message)).toEqual([
      'Worker error: boom',
      'Worker error: later',
    ]);
  });

  it('reports other errors as before', async () => {
    const { bridge, fail } = makeBridge();
    const { table, errors } = await mount(bridge);
    fail(crash());
    bridge.loadData.mockRejectedValueOnce(new Error('bad file'));

    await expect(table.loadData('a\n3\n', { sourceFormat: 'csv' })).rejects.toThrow('bad file');

    expect(errors.map((e) => e.source)).toEqual(['query', 'load']);
  });

  it('stops listening once destroyed', async () => {
    const { bridge, listeners, fail } = makeBridge();
    const { table, errors } = await mount(bridge);
    expect(listeners.size).toBe(1);

    await table.destroy();
    fail(crash());

    expect(listeners.size).toBe(0);
    expect(errors).toEqual([]);
  });
});
