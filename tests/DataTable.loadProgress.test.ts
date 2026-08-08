/**
 * @vitest-environment jsdom
 *
 * Phase 1 — `loadProgress` reaches consumers.
 *
 * The event has been declared on `TableEvents`, typed as `ProgressInfo`,
 * named in `DataTable`'s JSDoc load-sequence comment, documented in the API
 * reference and the loading guide, and bound to a progress bar by a shipped
 * example (`examples/02-load-from-url/main.ts`) — while `grep "emit(
 * 'loadProgress'" src/` returned nothing. The worker posted reports, the
 * bridge delivered them to an `onProgress` callback, and no caller ever
 * passed one. This file covers the reconnected chain end to end:
 * `DataLoader` → `bridge.loadData(…, onProgress)` → `actions.loadData` →
 * `loadDataImpl` → the public emitter.
 *
 * Mock-bridge shape and the `clientHeight` patch follow
 * `tests/DataTable.loadMarks.test.ts`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProgressInfo } from '@/core/Progress';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, type DataTable } from '@/index';

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

const baseOpts = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
  persistence: false,
} as const;

const CSV = 'a,b\n1,2\n3,4';

/**
 * A bridge whose `loadData` replays `workerReports` through the callback it
 * is handed, standing in for the worker's `progress` responses.
 */
function makeBridge(workerReports: ProgressInfo[]): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi
      .fn()
      .mockImplementation(
        async (_source: unknown, _options: unknown, onProgress?: (i: ProgressInfo) => void) => {
          for (const report of workerReports) onProgress?.(report);
          return {
            tableName: 'data',
            rowCount: 2,
            columns: ['a', 'b'],
            schema: [
              { name: 'a', type: 'INTEGER', nullable: true, originalType: 'INTEGER' },
              { name: 'b', type: 'INTEGER', nullable: true, originalType: 'INTEGER' },
            ],
          };
        },
      ),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
}

/** The stage sequence a real worker produces for a small source. */
const WORKER_SEQUENCE: ProgressInfo[] = [
  { stage: 'parsing', percent: 15, cancelable: false },
  { stage: 'analyzing', percent: 80, loaded: 1, total: 1, cancelable: false },
  { stage: 'indexing', percent: 80, cancelable: false },
  { stage: 'indexing', percent: 100, cancelable: false },
];

describe('loadProgress', () => {
  let table: DataTable | undefined;
  let container: HTMLElement | undefined;

  afterEach(async () => {
    await table?.destroy();
    table = undefined;
    container?.remove();
    container = undefined;
  });

  async function mount(workerReports: ProgressInfo[]): Promise<ProgressInfo[]> {
    container = document.createElement('div');
    container.style.height = '500px';
    document.body.appendChild(container);

    const seen: ProgressInfo[] = [];
    table = await createDataTable({
      container,
      bridge: makeBridge(workerReports),
      ...baseOpts,
    });
    table.on('loadProgress', (info) => seen.push(info));
    await table.loadData(CSV, { sourceFormat: 'csv' });
    return seen;
  }

  it('emits a monotone sequence ending in exactly one 100', async () => {
    const seen = await mount(WORKER_SEQUENCE);

    expect(seen.length).toBeGreaterThan(WORKER_SEQUENCE.length - 1);
    const percents = seen.map((r) => r.percent);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]!);
    }
    expect(percents.filter((p) => p === 100)).toHaveLength(1);
    expect(percents.at(-1)).toBe(100);
  });

  it('reports the source byte count during reading', async () => {
    const seen = await mount(WORKER_SEQUENCE);

    // The main thread owns `reading` — it is the only stage that knows how
    // big the source was, and the only one still cancelable.
    const reading = seen.filter((r) => r.stage === 'reading');
    expect(reading.length).toBeGreaterThan(0);
    const bytes = new TextEncoder().encode(CSV).byteLength;
    expect(reading.at(-1)).toMatchObject({ loaded: bytes, total: bytes, cancelable: true });
    // …and it hands over below the worker's first report rather than
    // overlapping it.
    expect(reading.at(-1)!.percent).toBeLessThanOrEqual(WORKER_SEQUENCE[0]!.percent);
  });

  it('drops a report that would move the bar backwards', async () => {
    // Two threads produce this sequence, so an out-of-order delivery is a
    // real possibility. A bar that jumps back reads as a bug in the app.
    const seen = await mount([
      { stage: 'parsing', percent: 40, cancelable: false },
      { stage: 'analyzing', percent: 20, loaded: 1, total: 2, cancelable: false },
      { stage: 'indexing', percent: 100, cancelable: false },
    ]);

    expect(seen.map((r) => r.percent)).not.toContain(20);
    const percents = seen.map((r) => r.percent);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]!);
    }
  });
});
