/**
 * A chart's brush must not outlive the filter it created.
 *
 * Found by the Phase 2 manual pass at 1,000 columns: drag-brush a histogram,
 * remove the resulting filter with its chip, then hide any column. The header
 * row rebuilds, the chart is re-created — and the brush comes back, painting a
 * selection for a filter that no longer exists. The stats slot then reads
 * "60,000 rows" on line 1 and "24,271 rows (40.5%)" underneath, which cannot
 * both be true.
 *
 * The stale entry itself predates this phase. `StateActions.notifyRemovedFilters`
 * (`core/Actions.ts:236`) is never called, so `setOnFilterRemove` — and with it
 * `clearVisualizationState` — fires only for derived-column removals, never
 * when a user drops an ordinary filter. What Phase 2 changed is that charts are
 * now re-created constantly (every header rebuild, every scroll back into
 * view), and `restoreInteractionState` reads that map on each one. Before, a
 * destroyed chart's state was simply lost and the stale entry unreachable.
 *
 * The guard is on the restore side: interaction state is only put back when a
 * filter for that column is still active.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import type { VisualizationOptions } from '@/visualizations/BaseVisualization';
import { Histogram } from '@/visualizations/histogram/Histogram';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
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

const SCHEMA: ColumnSchema[] = [
  { name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'b', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

/**
 * A real `Histogram` subclass, because every facade path under test is gated
 * on `instanceof Histogram` — `saveInteractionState`, `restoreInteractionState`
 * and the `onBrushCommit` handler that populates the map all skip anything
 * else. A structural stub would make these tests pass with the feature
 * reverted.
 *
 * Only the three seams that matter are overridden: `fetchData` (so no query
 * runs), `getBrushState` (so a commit has something to save) and
 * `setBrushState` (recorded rather than applied, since applying it needs real
 * binned data this test has no use for).
 */
class StubViz extends Histogram {
  static created: StubViz[] = [];
  /** What the facade tried to restore onto this instance, if anything. */
  restored: { startBinIndex: number; endBinIndex: number } | null = null;
  private committed: { startBinIndex: number; endBinIndex: number } | null = null;

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    StubViz.created.push(this);
  }

  override async fetchData(): Promise<void> {}
  override render(): void {}

  override getBrushState(): { startBinIndex: number; endBinIndex: number } | null {
    return this.committed;
  }

  override setBrushState(state: { startBinIndex: number; endBinIndex: number } | null): void {
    this.restored = state;
  }

  /** Simulate the user committing a brush, as a real drag would. */
  commitBrush(start: number, end: number): void {
    this.committed = { startBinIndex: start, endBinIndex: end };
    this.options.onFilterChange?.({
      type: 'range',
      column: this.getColumn().name,
      min: start,
      max: end,
    } as Filter);
    this.options.onBrushCommit?.(this.getColumn().name);
  }
}

function makeVizRegistry(): VisualizationRegistry {
  const reg = new VisualizationRegistry();
  for (const name of reg.getRegisteredTypes()) reg.unregister(name);
  reg.register({
    name: 'stub-numeric',
    isApplicable: (t: string) => t === 'integer',
    constructor: StubViz as unknown as never,
    priority: 100,
  } as never);
  return reg;
}

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation((sql: string) => {
      if (/COUNT\(\*\)/i.test(sql)) return Promise.resolve([{ cnt: 10 }]);
      return Promise.resolve([]);
    }),
    loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

function makeSessionStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function mount(): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: false,
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry: makeVizRegistry(),
  });
  table.state.tableName.set('t1');
  table.state.totalRows.set(20);
  table.state.filteredRows.set(20);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return { table, container };
}

/** Force the header row to rebuild, as hide/show/pin/reorder all do. */
async function rebuildHeaders(table: DataTable): Promise<void> {
  table.actions.hideColumn('b');
  await Promise.resolve();
  await Promise.resolve();
  table.actions.showColumn('b');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  StubViz.created = [];
  document.body.innerHTML = '';
  vi.clearAllMocks();
  void makeSessionStore;
});

describe('interaction state does not outlive its filter', () => {
  it('does not restore a brush after its filter was removed', async () => {
    const { table } = await mount();
    const viz = StubViz.created.find((v) => v.getColumn().name === 'a')!;

    viz.commitBrush(2, 5);
    await Promise.resolve();
    expect(table.state.filters.get().map((f) => f.column)).toContain('a');

    // The user drops the filter. Nothing clears the saved brush today —
    // `clearVisualizationState` never fires for an ordinary removal.
    table.actions.removeFilter('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(table.state.filters.get()).toEqual([]);

    StubViz.created = [];
    await rebuildHeaders(table);

    // The replacement instance must come up clean. Before the guard it came
    // up brushed, contradicting its own row count.
    const rebuilt = StubViz.created.filter((v) => v.getColumn().name === 'a');
    expect(rebuilt.length).toBeGreaterThan(0);
    for (const v of rebuilt) expect(v.restored).toBeNull();

    await table.destroy();
  });

  it('still restores a brush while its filter is active', async () => {
    const { table } = await mount();
    const viz = StubViz.created.find((v) => v.getColumn().name === 'a')!;

    viz.commitBrush(2, 5);
    await Promise.resolve();
    await Promise.resolve();
    expect(table.state.filters.get().map((f) => f.column)).toContain('a');

    StubViz.created = [];
    await rebuildHeaders(table);
    await Promise.resolve();

    // The filter is still there, so the selection that produced it belongs on
    // the chart — dropping it would be the opposite bug.
    const rebuilt = StubViz.created.filter((v) => v.getColumn().name === 'a');
    expect(rebuilt.length).toBeGreaterThan(0);
    for (const v of rebuilt) expect(v.restored).toEqual({ startBinIndex: 2, endBinIndex: 5 });

    await table.destroy();
  });

  it('a rebuild after removal leaves nothing behind for the next one either', async () => {
    const { table } = await mount();
    const viz = StubViz.created.find((v) => v.getColumn().name === 'a')!;
    viz.commitBrush(1, 3);
    await Promise.resolve();
    table.actions.removeFilter('a');
    await Promise.resolve();
    await Promise.resolve();

    await rebuildHeaders(table);
    StubViz.created = [];
    // Second rebuild: the stale entry must have been pruned, not merely
    // skipped, or it resurfaces the moment a new filter appears on 'a'.
    await rebuildHeaders(table);
    for (const v of StubViz.created.filter((x) => x.getColumn().name === 'a')) {
      expect(v.restored).toBeNull();
    }

    await table.destroy();
  });
});
