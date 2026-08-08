/**
 * @vitest-environment jsdom
 *
 * Phase 0 (`plans/scaling/phase-00-harness.md` §4.3): the load pipeline
 * actually emits `dt:load:*`.
 *
 * `tests/core/loadMarks.test.ts` covers the helper in isolation; this
 * covers the wiring — that a real `createDataTable` / `loadData` produces
 * all five marks and all four measures, in order, and that a second load
 * starts from a clean slate instead of measuring against the first load's
 * `dt:load:start`.
 *
 * Mock-bridge shape and the `clientHeight` patch are borrowed from
 * `tests/DataTable.firstpaint.race.test.ts` — without the patch jsdom
 * reports 0 and the body skips its first SELECT, which would make
 * `dt:load:paint` trivially instant.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { LoadStage } from '@/core/loadMarks';

const MARKS: LoadStage[] = ['start', 'workerDone', 'firstPaint', 'vizReady', 'complete'];
const MEASURES = ['worker', 'paint', 'viz', 'total'];

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
});

afterAll(() => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
});

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({
      tableName: 'data',
      rowCount: 3,
      columns: ['a'],
      schema: [{ name: 'a', type: 'INTEGER', nullable: true, originalType: 'INTEGER' }],
    }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
}

const baseOpts = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
  persistence: false,
} as const;

/** `[name, startTime]` for every `dt:load:*` mark present, in time order. */
function markEntries(): Array<[string, number]> {
  return MARKS.map(
    (s) => [s, performance.getEntriesByName(`dt:load:${s}`, 'mark')[0]?.startTime] as const,
  )
    .filter((e): e is readonly [LoadStage, number] => e[1] !== undefined)
    .map(([n, t]) => [n, t]);
}

function measureNames(): string[] {
  return MEASURES.filter((m) => performance.getEntriesByName(`dt:load:${m}`, 'measure').length > 0);
}

async function mount(bridge: WorkerBridge): Promise<DataTable> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return createDataTable({
    container,
    source: new File(['a\n1\n2\n3'], 'x.csv', { type: 'text/csv' }),
    bridge,
    ...baseOpts,
  });
}

let table: DataTable | null = null;

afterEach(async () => {
  await table?.destroy();
  table = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('DataTable load-stage marks', () => {
  it('emits all five marks and all four measures for one load', async () => {
    table = await mount(makeBridge());

    expect(markEntries().map(([n]) => n)).toEqual(MARKS);
    expect(measureNames()).toEqual(MEASURES);
  });

  it('orders the marks the way the pipeline runs', async () => {
    table = await mount(makeBridge());

    const at = Object.fromEntries(markEntries()) as Record<LoadStage, number>;
    expect(at.workerDone).toBeGreaterThanOrEqual(at.start);
    expect(at.firstPaint).toBeGreaterThanOrEqual(at.workerDone);
    expect(at.vizReady).toBeGreaterThanOrEqual(at.workerDone);
    expect(at.complete).toBeGreaterThanOrEqual(at.firstPaint);
    expect(at.complete).toBeGreaterThanOrEqual(at.vizReady);
    // `firstPaint` and `vizReady` are deliberately unordered relative to
    // each other: `Promise.all` awaits them in parallel, and with
    // visualizations off `pendingVizInit` is already resolved, so
    // `vizReady` routinely lands first. Phase 2 moves `vizReady` past
    // `complete` entirely — this is the ordering that must survive that.
  });

  it('measures a viz span even with visualizations off', async () => {
    // `pendingVizInit` is an already-resolved promise when visualizations
    // are disabled, so `dt:load:viz` legitimately reads ~0 — that is the
    // documented meaning, not a missing measurement.
    table = await mount(makeBridge());

    const viz = performance.getEntriesByName('dt:load:viz', 'measure')[0]!;
    expect(viz).toBeDefined();
    expect(viz.duration).toBeGreaterThanOrEqual(0);
  });

  it('clears the previous load before re-measuring', async () => {
    const bridge = makeBridge();
    table = await mount(bridge);

    const firstStart = performance.getEntriesByName('dt:load:start', 'mark')[0]!.startTime;
    // One entry per name, never two — clearing at load start is what keeps
    // `dt:load:total` a span of *this* load.
    expect(performance.getEntriesByName('dt:load:start', 'mark')).toHaveLength(1);

    await table.loadData('a\n4\n5\n6', { sourceFormat: 'csv' });

    const starts = performance.getEntriesByName('dt:load:start', 'mark');
    expect(starts).toHaveLength(1);
    expect(starts[0]!.startTime).toBeGreaterThan(firstStart);
    expect(measureNames()).toEqual(MEASURES);
  });

  it('leaves marks behind when a load fails, without throwing', async () => {
    const bridge = makeBridge();
    (bridge.loadData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('parse failed'));

    const container = document.createElement('div');
    document.body.appendChild(container);
    await expect(
      createDataTable({
        container,
        source: new File(['a\n1'], 'x.csv', { type: 'text/csv' }),
        bridge,
        ...baseOpts,
      }),
    ).rejects.toThrow();

    // `start` was marked before the failure; nothing downstream of the
    // worker was, and no measure could close.
    expect(markEntries().map(([n]) => n)).toEqual(['start']);
    expect(measureNames()).toEqual([]);
  });
});
