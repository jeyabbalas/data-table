/**
 * `refreshNonVizStats` is the fallback writer for the line-1 row count of
 * every column header nothing else owns. Two signals drive it — `filters`
 * and `filteredRows` — and both move inside a single filter cycle, so a naive
 * subscription runs the whole sweep twice per interaction. At 1,000 columns
 * that is 2,000 `innerHTML` assignments where 1,000 would do.
 *
 * These tests pin two things the lazy-visualization phase depends on:
 *
 * 1. **Coalescing.** A burst of signal writes in one turn produces exactly one
 *    pass over the headers, on a microtask (i.e. still before paint).
 * 2. **The lazy predicate.** The sweep skips a column only when it has a
 *    *live* visualization instance. Before lazy creation the predicate was
 *    "is a viz applicable to this column", which under lazy creation would
 *    freeze an offscreen chart column's row count at its attach-time value
 *    forever.
 *
 * The spy seam is `messages.statistics.filteredRowCount`: it is a public
 * option and `tableWideLine1Html` is its only caller in the library, so a
 * call count is a faithful count of header writes. It only runs while a
 * filter is active, hence every test here applies one.
 *
 * `filteredCount` shadows what the stubbed `COUNT(*)` reports so the
 * crossfilter coordinator's own re-count writes back the value the test
 * already set — signals dedupe on `!==`, so that write notifies nobody and
 * the sweep count stays honest.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

import { createDataTable, VisualizationRegistry, type DataTable } from '@/index';
import { BaseVisualization, type VisualizationOptions } from '@/visualizations/BaseVisualization';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
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
  { name: 'c', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

const TOTAL_ROWS = 20;

/** What the stubbed `COUNT(*)` reports; kept in step with `filteredRows`. */
let filteredCount = TOTAL_ROWS;

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation((sql: string) => {
      if (/COUNT\(\*\)/i.test(sql)) return Promise.resolve([{ cnt: filteredCount }]);
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

/** Inert viz — it never emits stats, so it never writes a slot itself. */
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
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
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

interface Harness {
  table: DataTable;
  container: HTMLElement;
  filteredRowCount: ReturnType<typeof vi.fn>;
  /** Move both filter signals in one turn, as a real filter cycle does. */
  applyFilter(value: number, filteredRows: number): void;
  /** Line-1 text of one header, by column name. */
  line1(column: string): string | undefined;
}

async function mount(opts: { visualizations?: boolean } = {}): Promise<Harness> {
  const filteredRowCount = vi.fn((f: number, t: number) => `${f} / ${t} rows`);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    visualizationRegistry: makeVizRegistry(),
    messages: { statistics: { filteredRowCount } },
    ...(opts.visualizations === undefined ? {} : { visualizations: opts.visualizations }),
  });
  table.state.tableName.set('t1');
  table.state.totalRows.set(TOTAL_ROWS);
  table.state.filteredRows.set(TOTAL_ROWS);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return {
    table,
    container,
    filteredRowCount,
    applyFilter(value: number, filteredRows: number) {
      filteredCount = filteredRows;
      table.state.filters.set([{ type: 'point', column: 'a', value }]);
      table.state.filteredRows.set(filteredRows);
    },
    line1(column: string) {
      const header = container.querySelector(`.dt-col-header[data-column="${column}"]`);
      return header?.querySelector('.dt-stats-line1')?.textContent ?? undefined;
    },
  };
}

afterEach(() => {
  StubViz.instances = [];
  filteredCount = TOTAL_ROWS;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('refreshNonVizStats coalescing', () => {
  it('sweeps the headers once when both filter signals move in the same turn', async () => {
    const h = await mount({ visualizations: false });
    h.filteredRowCount.mockClear();

    h.applyFilter(1, 7);
    // Nothing written yet — the sweep is deferred, not synchronous.
    expect(h.filteredRowCount).not.toHaveBeenCalled();

    await Promise.resolve();
    // One formatter call per column, not two.
    expect(h.filteredRowCount).toHaveBeenCalledTimes(SCHEMA.length);
    expect(h.line1('a')).toBe('7 / 20 rows');
    await h.table.destroy();
  });

  it('collapses a burst of filter writes into a single pass', async () => {
    const h = await mount({ visualizations: false });
    h.filteredRowCount.mockClear();

    for (let i = 1; i <= 5; i++) h.applyFilter(i, i);
    await Promise.resolve();

    expect(h.filteredRowCount).toHaveBeenCalledTimes(SCHEMA.length);
    // The single pass reads the *latest* values, so nothing is left stale.
    expect(h.line1('a')).toBe('5 / 20 rows');
    await h.table.destroy();
  });

  it('re-arms after the microtask so the next cycle still refreshes', async () => {
    const h = await mount({ visualizations: false });

    h.applyFilter(1, 9);
    await Promise.resolve();
    expect(h.line1('b')).toBe('9 / 20 rows');

    h.applyFilter(2, 3);
    await Promise.resolve();
    expect(h.line1('b')).toBe('3 / 20 rows');
    await h.table.destroy();
  });

  it('does not sweep after destroy()', async () => {
    const h = await mount({ visualizations: false });
    await h.table.destroy();
    h.filteredRowCount.mockClear();

    h.applyFilter(1, 4);
    await Promise.resolve();
    expect(h.filteredRowCount).not.toHaveBeenCalled();
  });
});

describe('refreshNonVizStats predicate under lazy visualizations', () => {
  /**
   * An observer that accepts registrations and never reports a target as
   * intersecting — every header is offscreen, so the controller creates
   * nothing. This is what the real lazy path does for column 40 of 1,000.
   */
  function installBlindObserver(): () => void {
    const original = (window as { IntersectionObserver?: unknown }).IntersectionObserver;
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(_cb: unknown, _init?: unknown) {}
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return [];
      }
    };
    return () => {
      (window as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    };
  }

  it('keeps refreshing a viz-applicable column that has no live instance', async () => {
    const restore = installBlindObserver();
    try {
      const h = await mount();
      // Nothing scrolled into view, so nothing was created …
      expect(StubViz.instances).toHaveLength(0);

      h.filteredRowCount.mockClear();
      h.applyFilter(1, 6);
      await Promise.resolve();

      // … and the fallback writer therefore owns all three slots.
      expect(h.filteredRowCount).toHaveBeenCalledTimes(SCHEMA.length);
      expect(h.line1('a')).toBe('6 / 20 rows');
      expect(h.line1('c')).toBe('6 / 20 rows');
      await h.table.destroy();
    } finally {
      restore();
    }
  });

  it('leaves columns with a live visualization to their own stats callback', async () => {
    // No `IntersectionObserver` in jsdom → the controller falls back to
    // treating every column as visible, so all three get an instance.
    const h = await mount();
    expect(StubViz.instances).toHaveLength(SCHEMA.length);

    h.filteredRowCount.mockClear();
    h.applyFilter(1, 6);
    await Promise.resolve();

    expect(h.filteredRowCount).not.toHaveBeenCalled();
    await h.table.destroy();
  });
});
