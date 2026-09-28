/**
 * A table whose bridge's worker fails reports it once: an `error` event with
 * `source: 'query'`, as the bridge tells of it, whatever fails after it. With
 * the charts off, nothing else would: the body logged a row fetch failing,
 * and retried it at most every 8 s, for good. With them on, each chart's
 * fetch was an `error` event of its own, the failure wrapped in a
 * `QUERY_RUNTIME` error whose `cause` it is.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import { QueryError, WorkerInitError, type DataTableError } from '@/core/errors';
import type { TableEvents } from '@/core/TableEvents';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // BaseVisualization draws on a canvas, which jsdom does not implement.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
  }) as never;
});

const LOADED = {
  tableName: 't',
  rowCount: 2,
  columns: ['a'],
  schema: [{ name: 'a', type: 'integer', nullable: true, originalType: 'INTEGER' }],
};

/** The error a bridge fails with. */
function crash(message = 'Worker error: boom'): WorkerInitError {
  return new WorkerInitError(message, { code: 'WORKER_CRASHED' });
}

/** What a call on the failed bridge rejects with, as `ensureInitialized` makes it. */
function laterCall(root: WorkerInitError): WorkerInitError {
  return new WorkerInitError('The DuckDB worker failed: every table is gone.', {
    code: 'WORKER_CRASHED',
    cause: root,
  });
}

/** What a chart's fetch helper reports for a failed query. */
function chartError(cause: unknown): QueryError {
  return new QueryError('Histogram fetch failed', { code: 'QUERY_RUNTIME', cause });
}

/** A chart that reports whatever error a test hands it. */
class StubViz extends BaseVisualization {
  static instances: StubViz[] = [];

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    StubViz.instances.push(this);
  }

  async fetchData(): Promise<void> {}
  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}

  fail(error: DataTableError): void {
    this.options.onError?.(error);
  }
}

function stubCharts(): VisualizationRegistry {
  const registry = new VisualizationRegistry();
  for (const name of registry.getRegisteredTypes()) registry.unregister(name);
  registry.register({
    name: 'stub',
    isApplicable: () => true,
    constructor: StubViz as never,
    priority: 100,
  } as never);
  return registry;
}

/** A bridge double that lets a test fail its worker, with or without the failure hook. */
function makeBridge({ hook = true }: { hook?: boolean } = {}) {
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
    ...(hook
      ? {
          onWorkerFailure: vi.fn((listener: (error: WorkerInitError) => void) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          }),
        }
      : {}),
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
  StubViz.instances = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function mount(
  bridge: ReturnType<typeof makeBridge>['bridge'],
  { charts = false }: { charts?: boolean } = {},
) {
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
    ...(charts ? { visualizationRegistry: stubCharts() } : { visualizations: false }),
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
    const root = crash();

    fail(root);
    fail(root);

    expect(errors).toEqual([{ error: root, source: 'query' }]);
  });

  it('drops the errors charts report after it, however they wrap it', async () => {
    const { bridge, fail } = makeBridge();
    const { errors } = await mount(bridge, { charts: true });
    const chart = StubViz.instances.at(-1)!;
    const root = crash();

    fail(root);
    chart.fail(chartError(root));
    chart.fail(chartError(laterCall(root)));
    chart.fail(laterCall(root));

    expect(errors).toEqual([{ error: root, source: 'query' }]);
  });

  it('reports a chart error that does not come from it', async () => {
    const { bridge, fail } = makeBridge();
    const { errors } = await mount(bridge, { charts: true });
    fail(crash());

    StubViz.instances.at(-1)!.fail(chartError(new Error('Binder Error: no such column')));

    expect(errors.map((e) => e.source)).toEqual(['query', 'visualization']);
  });

  it('reports a new worker failing: another error', async () => {
    const { bridge, fail } = makeBridge();
    const { errors } = await mount(bridge);

    fail(crash('Worker error: first'));
    fail(crash('Worker error: second'));

    expect(errors.map((e) => e.error.message)).toEqual([
      'Worker error: first',
      'Worker error: second',
    ]);
  });

  it('reports a new failure after a reload that failed for another reason', async () => {
    const { bridge, fail } = makeBridge();
    const { table, errors } = await mount(bridge);
    fail(crash('Worker error: first'));
    bridge.loadData.mockRejectedValueOnce(new Error('bad file'));
    await expect(table.loadData('a\n3\n', { sourceFormat: 'csv' })).rejects.toThrow('bad file');

    fail(crash('Worker error: second'));

    expect(errors.map((e) => `${e.source}: ${e.error.message}`)).toEqual([
      'query: Worker error: first',
      'load: bad file',
      'query: Worker error: second',
    ]);
  });

  it('drops the error of a load after it, which still rejects and fires loadError', async () => {
    const { bridge, fail } = makeBridge();
    const { table, errors, loadErrors } = await mount(bridge);
    const root = crash();
    fail(root);
    bridge.loadData.mockRejectedValueOnce(laterCall(root));

    await expect(table.loadData('a\n3\n', { sourceFormat: 'csv' })).rejects.toMatchObject({
      code: 'WORKER_CRASHED',
    });

    expect(errors.map((e) => e.source)).toEqual(['query']);
    expect(loadErrors).toHaveLength(1);
  });

  it('without the bridge hook, reports the first error that carries it and drops the rest', async () => {
    const { bridge } = makeBridge({ hook: false });
    const { errors } = await mount(bridge, { charts: true });
    const chart = StubViz.instances.at(-1)!;
    const root = crash();
    const first = chartError(laterCall(root));

    chart.fail(first);
    chart.fail(chartError(root));
    chart.fail(chartError(laterCall(root)));

    expect(errors).toEqual([{ error: first, source: 'visualization' }]);
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
