/**
 * @vitest-environment jsdom
 *
 * `sourceOptions` through the facade: `createDataTable()` and
 * `table.loadData()` hand them to the bridge with the load, and a bad value
 * fails the load as any load error does.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable, type SourceOptions } from '@/index';
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

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({ tableName: 't', schema: [], rowCount: 0, columns: [] }),
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

const SOURCE_OPTIONS: SourceOptions = {
  timezone: 'Europe/Berlin',
  csv: { delimiter: ';', nullValues: ['-'] },
  parquet: { columns: ['fare'] },
};

describe('sourceOptions through the facade', () => {
  const tables: DataTable[] = [];

  afterEach(async () => {
    for (const table of tables.splice(0)) await table.destroy();
    document.body.innerHTML = '';
  });

  async function mount(options: Partial<Parameters<typeof createDataTable>[0]> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const table = await createDataTable({ container, bridge, ...BARE, ...options });
    tables.push(table);
    return { table, bridge };
  }

  it('createDataTable hands them to the bridge with the initial source', async () => {
    const { bridge } = await mount({
      source: 'a;b\n1;-\n',
      sourceFormat: 'csv',
      sourceOptions: SOURCE_OPTIONS,
    });
    expect(bridge.loadData).toHaveBeenCalledWith(
      'a;b\n1;-\n',
      expect.objectContaining({ format: 'csv', ...SOURCE_OPTIONS }),
      expect.any(Function),
    );
  });

  it('table.loadData hands them to the bridge', async () => {
    const { table, bridge } = await mount();
    const file = new File([new Uint8Array([1, 2])], 'trips.parquet');
    await table.loadData(file, { sourceOptions: SOURCE_OPTIONS });
    expect(bridge.loadData).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ format: 'parquet', ...SOURCE_OPTIONS }),
      expect.any(Function),
    );
  });

  it('a bad value fails the load with loadError, before the bridge is asked', async () => {
    const { table, bridge } = await mount();
    const loadError = vi.fn();
    table.on('loadError', loadError);

    await expect(
      table.loadData('a,b\n1,2\n', { sourceOptions: { csv: { sampleSize: 0 } } }),
    ).rejects.toMatchObject({
      code: 'LOAD_INVALID_OPTIONS',
      details: { option: 'csv.sampleSize', value: 0 },
    });
    expect(loadError).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'LOAD_INVALID_OPTIONS' }),
    });
    expect(bridge.loadData).not.toHaveBeenCalled();
  });

  it('createDataTable rejects with a bad value for its initial source', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    await expect(
      createDataTable({
        container,
        bridge,
        ...BARE,
        source: 'a,b\n1,2\n',
        sourceOptions: { timezone: 'not a zone' },
      }),
    ).rejects.toMatchObject({ code: 'LOAD_INVALID_TIMEZONE' });
    expect(bridge.loadData).not.toHaveBeenCalled();
  });
});
