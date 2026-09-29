/**
 * @vitest-environment jsdom
 *
 * `loadProgress`: the worker's progress messages reach the table's event, in
 * order, between `loadStart` and `loadComplete` or `loadError`. Before, no
 * progress callback was passed to the bridge and the event never fired.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import type { ProgressCallback, ProgressInfo } from '@/core/Progress';
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

/** What the worker's dispatcher sends for a load. */
const WORKER_PROGRESS: ProgressInfo[] = [
  { stage: 'reading', percent: 0, cancelable: true },
  { stage: 'parsing', percent: 25, cancelable: true },
  { stage: 'indexing', percent: 90, cancelable: false },
];

/** A bridge whose load reports the worker's progress, then settles. */
function makeBridge(outcome: 'resolve' | 'reject' = 'resolve'): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn(async (_source: unknown, _options: unknown, onProgress?: ProgressCallback) => {
      for (const info of WORKER_PROGRESS) {
        await Promise.resolve();
        onProgress?.({ ...info });
      }
      if (outcome === 'reject') throw new Error('parse failed');
      return { tableName: 't', rowCount: 0, columns: [], schema: [] };
    }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    dropTable: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

const BARE = {
  persistence: false,
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
} as const;

describe('loadProgress', () => {
  const tables: DataTable[] = [];

  afterEach(async () => {
    for (const table of tables.splice(0)) await table.destroy();
    document.body.innerHTML = '';
  });

  async function mount(
    bridge: WorkerBridge,
    options: Partial<Parameters<typeof createDataTable>[0]> = {},
  ) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const table = await createDataTable({ container, bridge, ...BARE, ...options });
    tables.push(table);
    return table;
  }

  /** Every load event, in order. */
  function record(table: DataTable): string[] {
    const events: string[] = [];
    table.on('loadStart', () => events.push('loadStart'));
    table.on('loadProgress', ({ stage, percent }) => events.push(`${stage} ${percent}`));
    table.on('loadComplete', () => events.push('loadComplete'));
    table.on('loadError', () => events.push('loadError'));
    return events;
  }

  it('fires for each progress message of table.loadData, before loadComplete', async () => {
    const table = await mount(makeBridge());
    const events = record(table);
    const percents: number[] = [];
    table.on('loadProgress', ({ percent }) => percents.push(percent));

    await table.loadData('a,b\n1,2\n');

    expect(events).toEqual(['loadStart', 'reading 0', 'parsing 25', 'indexing 90', 'loadComplete']);
    for (const percent of percents) {
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it('fires before loadError when the load fails', async () => {
    const table = await mount(makeBridge('reject'));
    const events = record(table);

    await expect(table.loadData('a,b\n1,2\n')).rejects.toThrow('parse failed');

    expect(events).toEqual(['loadStart', 'reading 0', 'parsing 25', 'indexing 90', 'loadError']);
  });

  it('also calls an onProgress passed to table.loadData', async () => {
    const table = await mount(makeBridge());
    const onProgress = vi.fn();
    const events = record(table);

    await table.loadData('a,b\n1,2\n', { onProgress });

    expect(onProgress.mock.calls.map(([info]) => (info as ProgressInfo).stage)).toEqual([
      'reading',
      'parsing',
      'indexing',
    ]);
    expect(events).toContain('parsing 25');
  });

  it('the initial source load reports its progress to the table too', async () => {
    // Its events fire before createDataTable resolves, where no listener can
    // be; what the bridge was handed is the table's own reporter.
    const bridge = makeBridge();
    const table = await mount(bridge, { source: 'a,b\n1,2\n' });
    const onProgress = vi.mocked(bridge.loadData).mock.calls[0]?.[2];
    expect(onProgress).toBeTypeOf('function');

    const seen: ProgressInfo[] = [];
    table.on('loadProgress', (info) => seen.push(info));
    onProgress!({ stage: 'indexing', percent: 90, cancelable: false });
    expect(seen).toEqual([{ stage: 'indexing', percent: 90, cancelable: false }]);
  });
});
