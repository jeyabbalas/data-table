/**
 * @vitest-environment jsdom
 *
 * Committed-selection stats emission for `Histogram`: after every
 * fetch+sync cycle the viz emits its own filter's detail text (or null)
 * through `onStatsChange`, with counts measured on the UNFILTERED
 * background out of the full dataset total.
 *
 * Canonical fixture (N = 20): bins 0–10 → 9 rows, 10–20 → 5, 20–30 → 3,
 * null → 3. Foreground under filters: 4 / 2 / 0, null 0 (total 6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = {
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  rect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 30 }),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
};

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mutable canned data the module mocks serve. Tests overwrite `fg*` to
// simulate other columns' filters changing the foreground.
const canned = {
  initial: () => makeInitial(false),
  fgBins: [4, 2, 0],
  fgDiscrete: [4, 2, 0],
  fgCount: 6,
  fgNullCount: 0,
};

function makeInitial(isDiscrete: boolean) {
  return {
    bins: isDiscrete
      ? [
          { x0: 1, x1: 1, count: 9 },
          { x0: 2, x1: 2, count: 5 },
          { x0: 3, x1: 3, count: 3 },
        ]
      : [
          { x0: 0, x1: 10, count: 9 },
          { x0: 10, x1: 20, count: 5 },
          { x0: 20, x1: 30, count: 3 },
        ],
    nullCount: 3,
    min: isDiscrete ? 1 : 0,
    max: isDiscrete ? 3 : 30,
    total: 20,
    isSingleValue: false,
    isDiscrete,
    median: 10,
    distinctCount: isDiscrete ? 3 : 15,
  };
}

vi.mock('../../../src/visualizations/histogram/HistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchHistogramData: vi.fn(() => Promise.resolve(canned.initial())),
    fetchHistogramBins: vi.fn(() =>
      Promise.resolve(
        canned.initial().bins.map((b, i) => ({ ...b, count: canned.fgBins[i] ?? 0 })),
      ),
    ),
    fetchDiscreteBins: vi.fn(() =>
      Promise.resolve(
        canned.initial().bins.map((b, i) => ({ ...b, count: canned.fgDiscrete[i] ?? 0 })),
      ),
    ),
    fetchColumnStats: vi.fn(() =>
      Promise.resolve({
        count: canned.fgCount,
        nullCount: canned.fgNullCount,
        min: canned.initial().min,
        max: canned.initial().max,
        median: 5,
        distinctCount: 5,
      }),
    ),
  };
});

import { Histogram } from '../../../src/visualizations/histogram/Histogram';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

const COLUMN: ColumnSchema = {
  name: 'v',
  type: 'integer',
  nullable: true,
  originalType: 'INTEGER',
};

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn() } as unknown as VisualizationOptions['bridge'];
}

let container: HTMLElement;
let statsChanges: (string | null)[];

function makeViz(filters: Filter[], extra: Partial<VisualizationOptions> = {}): Histogram {
  return new Histogram(container, COLUMN, {
    tableName: 't',
    bridge: makeBridge(),
    filters,
    onStatsChange: (s) => statsChanges.push(s),
    ...extra,
  });
}

async function settled(viz: Histogram): Promise<void> {
  await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
}

function lastStats(): string | null {
  return statsChanges[statsChanges.length - 1] ?? null;
}

/**
 * Assert the detail region was explicitly cleared.
 *
 * `expect(lastStats()).toBeNull()` cannot express this on its own: the `?? null`
 * collapses "emitted null" and "emitted nothing at all" into the same value, so
 * such an assertion passes even when the emission under test never fires —
 * deleting the `emitCommittedStats()` call from `fetchData` would keep it green.
 * Pinning the emission count is what makes the clear path actually covered.
 */
function expectCleared(): void {
  expect(statsChanges.length).toBeGreaterThan(0);
  expect(statsChanges[statsChanges.length - 1]).toBeNull();
}

beforeEach(() => {
  document.body.innerHTML = '';
  statsChanges = [];
  canned.initial = () => makeInitial(false);
  canned.fgBins = [4, 2, 0];
  canned.fgDiscrete = [4, 2, 0];
  canned.fgCount = 6;
  canned.fgNullCount = 0;
  container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 32,
    top: 0,
    left: 0,
    bottom: 32,
    right: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Histogram — committed-selection emission (continuous)', () => {
  it('range filter present at construction emits committed detail from the unfiltered background', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Bin:');
    // Bin 0–10 holds 9 of the 20 unfiltered rows — not the 4 foreground rows.
    expect(detail).toContain('9 rows (45.0%)');
    expect(detail).not.toContain('4 rows');
    viz.destroy();
  });

  it('committed detail is byte-stable when another column’s filter changes the foreground', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    await settled(viz);
    const before = lastStats();

    canned.fgBins = [1, 0, 0];
    canned.fgCount = 1;
    await viz.updateFilters([
      { type: 'range', column: 'v', min: 0, max: 10 },
      { type: 'point', column: 'other', value: 'x' },
    ]);
    expect(lastStats()).toBe(before);
    viz.destroy();
  });

  it('removing the filter clears the committed detail (null emission)', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    await settled(viz);
    expect(lastStats()).toContain('Bin:');
    await viz.updateFilters([]);
    expectCleared();
    viz.destroy();
  });

  it('null filter emits the null-bin detail with the background null count', async () => {
    canned.fgNullCount = 3;
    canned.fgCount = 0;
    canned.fgBins = [0, 0, 0];
    const viz = makeViz([{ type: 'null', column: 'v' }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Bin:');
    expect(detail).toContain('null');
    expect(detail).toContain('3 rows (15.0%)');
    viz.destroy();
  });

  it('not-null filter emits a full-range committed detail excluding nulls', async () => {
    canned.fgBins = [9, 5, 3];
    canned.fgCount = 17;
    const viz = makeViz([{ type: 'not-null', column: 'v' }]);
    await settled(viz);
    expect(lastStats()).toContain('17 rows (85.0%)');
    viz.destroy();
  });

  it('pattern and raw-sql filters produce no committed detail', async () => {
    const patternViz = makeViz([{ type: 'pattern', column: 'v', pattern: 'x', mode: 'contains' }]);
    await settled(patternViz);
    expectCleared();
    patternViz.destroy();

    statsChanges = [];
    const rawViz = makeViz([
      { type: 'raw-sql', column: '__raw_sql_1__', sql: 'v > 1', id: '1' } as Filter,
    ]);
    await settled(rawViz);
    expectCleared();
    rawViz.destroy();
  });

  it('routes labels and count line through messages overrides', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }], {
      messages: {
        statistics: {
          binLabel: 'Intervalle:',
          selectionRowCount: (count: number, pct: string) => `${count} lignes (${pct})`,
        },
      } as unknown as VisualizationOptions['messages'],
    });
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Intervalle:');
    expect(detail).toContain('9 lignes (45.0%)');
    viz.destroy();
  });

  it('hover shows the bin’s unfiltered share plus the surviving-match count', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    await settled(viz);
    const anyViz = viz as unknown as {
      barPositions: { x: number; width: number; binIndex: number }[];
      handleMouseMove: (x: number, y: number) => void;
    };
    const bar = anyViz.barPositions.find((b) => b.binIndex === 1);
    expect(bar).toBeDefined();
    anyViz.handleMouseMove(bar!.x + bar!.width / 2, 10);
    const hover = lastStats();
    expect(hover).toContain('5 rows (25.0%)');
    expect(hover).toContain('2 match');

    // Mouse-leave restores the committed detail.
    (viz as unknown as { handleMouseLeave: () => void }).handleMouseLeave();
    expect(lastStats()).toContain('9 rows (45.0%)');
    viz.destroy();
  });

  it('a brush committed before any refetch shows the same count after the refetch', async () => {
    const viz = makeViz([]);
    await settled(viz);
    expectCleared();

    // Simulate the state handleMouseUp leaves after a one-bin brush commit,
    // before the filter round-trips (backgroundData is still null).
    const anyViz = viz as unknown as {
      brushState: { committed: boolean; startBinIndex: number; endBinIndex: number };
      backgroundData: unknown;
      emitCommittedStats: () => void;
    };
    anyViz.brushState.committed = true;
    anyViz.brushState.startBinIndex = 0;
    anyViz.brushState.endBinIndex = 0;
    expect(anyViz.backgroundData).toBeNull();
    anyViz.emitCommittedStats();
    const atCommit = lastStats();
    expect(atCommit).toContain('9 rows (45.0%)');

    // The filter lands and the crossfilter refetch completes — same text.
    await viz.updateFilters([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    expect(lastStats()).toBe(atCommit);
    viz.destroy();
  });
});

describe('Histogram — committed-selection emission (discrete)', () => {
  beforeEach(() => {
    canned.initial = () => makeInitial(true);
  });

  it('point filter maps to a one-bin selection with background counts', async () => {
    const viz = makeViz([{ type: 'point', column: 'v', value: 2 }]);
    await settled(viz);
    expect(lastStats()).toContain('5 rows (25.0%)');
    viz.destroy();
  });

  it('set filter maps to a multi-bin selection summing background counts', async () => {
    const viz = makeViz([{ type: 'set', column: 'v', values: [1, 2] }]);
    await settled(viz);
    expect(lastStats()).toContain('14 rows (70.0%)');
    viz.destroy();
  });
});

describe('Histogram — a refetch must not blank a live hover', () => {
  /**
   * Any other column's filter change fans out to every registered viz, so a
   * refetch routinely lands while the pointer rests on a bar. Clearing the
   * detail there is unrecoverable in practice: handleMouseMove re-emits only
   * when the hovered bin *changes*, so moving inside the same bar brings
   * nothing back until the cursor crosses a bin boundary.
   */
  function hoverBin(viz: Histogram, index: number): void {
    (viz as unknown as { hoveredBin: number | null }).hoveredBin = index;
  }

  it('re-emits the hover detail — refreshed against the new data — instead of clearing it', async () => {
    const viz = makeViz([]);
    await settled(viz);

    hoverBin(viz, 0);
    statsChanges = [];

    // A second column's filter arrives; this viz refetches and re-emits.
    canned.fgBins = [4, 2, 0];
    await viz.updateFilters([{ type: 'range', column: 'other', min: 0, max: 1 }]);

    const after = lastStats();
    expect(after).not.toBeNull();
    expect(after).toContain('Bin:');
    // Selection size is measured on the unfiltered background: bin 0 holds 9
    // of 20 rows regardless of the other column's filter.
    expect(after).toContain('9 rows (45.0%)');
    // …and the hover carries the match suffix now that a filter is active.
    expect(after).toContain('4 match');
    viz.destroy();
  });

  it('falls back to the committed detail when nothing is hovered', async () => {
    const viz = makeViz([{ type: 'range', column: 'v', min: 0, max: 10 }]);
    await settled(viz);
    const committed = lastStats();
    expect(committed).toContain('9 rows (45.0%)');

    statsChanges = [];
    await viz.updateFilters([
      { type: 'range', column: 'v', min: 0, max: 10 },
      { type: 'range', column: 'other', min: 0, max: 1 },
    ]);
    expect(lastStats()).toBe(committed);
    viz.destroy();
  });
});

describe('Histogram — an all-null column carries no committed selection', () => {
  beforeEach(() => {
    canned.initial = () => ({
      ...makeInitial(false),
      bins: [],
      nullCount: 20,
      total: 20,
    });
    canned.fgBins = [];
    canned.fgCount = 0;
    canned.fgNullCount = 20;
  });

  /**
   * Pins why the all-null hover-exit branches clear rather than restore:
   * `syncVisualStateFromFilter` bails on `data.bins.length === 0` and forces
   * `selectedNull = false`, so a `null` filter on an entirely-null column
   * never produces a committed detail in the first place. If that guard ever
   * changes, the hover-exit branches must be revisited with it — they now
   * route through `emitRestingStats()`, so they will follow automatically.
   */
  it('a null filter on an all-null column leaves selectedNull unset and emits no detail', async () => {
    const viz = makeViz([{ type: 'null', column: 'v' }]);
    await settled(viz);

    const internals = viz as unknown as {
      selectedNull: boolean;
      allNullHovered: boolean;
      isAllNullState: boolean;
      handleMouseLeave: () => void;
    };
    expect(internals.selectedNull).toBe(false);
    expectCleared();

    // Mousing off the bar is consistent with that: still nothing to restore.
    internals.isAllNullState = true;
    internals.allNullHovered = true;
    statsChanges = [];
    internals.handleMouseLeave();
    expectCleared();
    viz.destroy();
  });
});
