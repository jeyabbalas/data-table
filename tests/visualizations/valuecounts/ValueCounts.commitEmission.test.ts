/**
 * @vitest-environment jsdom
 *
 * Committed-selection stats emission for `ValueCounts`: after every
 * fetch+render+sync cycle the viz emits its own filter's detail text (or
 * null) through `onStatsChange`, with counts measured on the UNFILTERED
 * background out of the full dataset total.
 *
 * Canonical fixture (N = 20): US 8, CA 5, DE 3, null 4.
 *
 * Also pins the pattern-filter asymmetry: segments highlight, but no
 * committed detail is emitted (folding could make visible segments
 * undercount the filter's true matches).
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

vi.mock('../../../src/visualizations/valuecounts/ValueCountsData', () => ({
  fetchValueCountsData: vi.fn(),
  fetchAlignedValueCountsData: vi.fn(),
}));

import { ValueCounts } from '../../../src/visualizations/valuecounts/ValueCounts';
import {
  fetchValueCountsData,
  fetchAlignedValueCountsData,
} from '../../../src/visualizations/valuecounts/ValueCountsData';
import type { ValueCountsData } from '../../../src/visualizations/valuecounts/ValueCountsData';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

const COLUMN: ColumnSchema = {
  name: 'country',
  type: 'string',
  nullable: true,
  originalType: 'VARCHAR',
};

function unfiltered(): ValueCountsData {
  return {
    segments: [
      { value: 'US', count: 8, isOther: false },
      { value: 'CA', count: 5, isOther: false },
      { value: 'DE', count: 3, isOther: false },
    ],
    nullCount: 4,
    distinctCount: 3,
    total: 20,
    isAllUnique: false,
  } as ValueCountsData;
}

/** Foreground aligned to the initial order; tests mutate `fg` per scenario. */
const fg = {
  counts: [8, 0, 0],
  nullCount: 0,
};

function foreground(): ValueCountsData {
  const base = unfiltered();
  const segments = base.segments.map((s, i) => ({ ...s, count: fg.counts[i] ?? 0 }));
  const total = segments.reduce((sum, s) => sum + s.count, 0) + fg.nullCount;
  return {
    segments,
    nullCount: fg.nullCount,
    distinctCount: segments.filter((s) => s.count > 0).length,
    total,
    isAllUnique: false,
  } as ValueCountsData;
}

let container: HTMLElement;
let statsChanges: (string | null)[];

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn().mockResolvedValue([]) } as unknown as VisualizationOptions['bridge'];
}

function makeViz(filters: Filter[], extra: Partial<VisualizationOptions> = {}): ValueCounts {
  return new ValueCounts(container, COLUMN, {
    tableName: 't',
    bridge: makeBridge(),
    filters,
    onStatsChange: (s) => statsChanges.push(s),
    ...extra,
  });
}

async function settled(viz: ValueCounts): Promise<void> {
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
 * such an assertion passes even when the emission under test never fires.
 */
function expectCleared(): void {
  expect(statsChanges.length).toBeGreaterThan(0);
  expect(statsChanges[statsChanges.length - 1]).toBeNull();
}

beforeEach(() => {
  document.body.innerHTML = '';
  statsChanges = [];
  fg.counts = [8, 0, 0];
  fg.nullCount = 0;
  vi.mocked(fetchValueCountsData).mockImplementation(() => Promise.resolve(unfiltered()));
  vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => Promise.resolve(foreground()));
  container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 150,
    height: 60,
    top: 0,
    left: 0,
    bottom: 60,
    right: 150,
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

describe('ValueCounts — committed-selection emission', () => {
  it('point filter present at construction emits the category detail from background counts', async () => {
    const viz = makeViz([{ type: 'point', column: 'country', value: 'US' }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Category:');
    expect(detail).toContain('US');
    expect(detail).toContain('8 rows (40.0%)');
    viz.destroy();
  });

  it('committed detail is byte-stable when another column’s filter changes the foreground', async () => {
    const viz = makeViz([{ type: 'point', column: 'country', value: 'US' }]);
    await settled(viz);
    const before = lastStats();

    fg.counts = [4, 0, 0];
    await viz.updateFilters([
      { type: 'point', column: 'country', value: 'US' },
      { type: 'range', column: 'age', min: 30, max: 40 },
    ]);
    expect(lastStats()).toBe(before);
    viz.destroy();
  });

  it('set filter emits the multi-select detail summing background counts', async () => {
    fg.counts = [8, 5, 0];
    const viz = makeViz([{ type: 'set', column: 'country', values: ['US', 'CA'] }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Selected:');
    expect(detail).toContain('US, CA');
    expect(detail).toContain('13 rows (65.0%)');
    viz.destroy();
  });

  it('set filter with includeNull adds the null segment to the sum and the list', async () => {
    fg.counts = [8, 5, 0];
    fg.nullCount = 4;
    const viz = makeViz([
      { type: 'set', column: 'country', values: ['US', 'CA'], includeNull: true },
    ]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Selected:');
    expect(detail).toContain('null');
    expect(detail).toContain('17 rows (85.0%)');
    viz.destroy();
  });

  it('null filter emits the null-segment detail', async () => {
    fg.counts = [0, 0, 0];
    fg.nullCount = 4;
    const viz = makeViz([{ type: 'null', column: 'country' }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Category:');
    expect(detail).toContain('null');
    expect(detail).toContain('4 rows (20.0%)');
    viz.destroy();
  });

  it('not-null filter selects every non-null segment', async () => {
    fg.counts = [8, 5, 3];
    const viz = makeViz([{ type: 'not-null', column: 'country' }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Selected:');
    expect(detail).toContain('16 rows (80.0%)');
    viz.destroy();
  });

  it('not-set filter selects the complement of the excluded values', async () => {
    fg.counts = [0, 5, 3];
    const viz = makeViz([{ type: 'not-set', column: 'country', values: ['US'] }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Selected:');
    expect(detail).toContain('CA, DE');
    expect(detail).toContain('8 rows (40.0%)');
    viz.destroy();
  });

  it('pattern filter highlights segments but emits NO committed detail', async () => {
    fg.counts = [0, 5, 0];
    const viz = makeViz([{ type: 'pattern', column: 'country', pattern: 'CA', mode: 'contains' }]);
    await settled(viz);
    const selected = (viz as unknown as { selectedSegments: Set<number> }).selectedSegments;
    expect(selected.size).toBeGreaterThan(0);
    expectCleared();
    viz.destroy();
  });

  it('removing the filter clears the committed detail', async () => {
    const viz = makeViz([{ type: 'point', column: 'country', value: 'US' }]);
    await settled(viz);
    expect(lastStats()).toContain('Category:');
    await viz.updateFilters([]);
    expectCleared();
    viz.destroy();
  });

  it('raw-sql filters produce no committed detail', async () => {
    fg.counts = [4, 2, 1];
    fg.nullCount = 2;
    const viz = makeViz([
      { type: 'raw-sql', column: '__raw_sql_1__', sql: 'x > 1', id: '1' } as Filter,
    ]);
    await settled(viz);
    expectCleared();
    viz.destroy();
  });

  it('hover shows the segment’s unfiltered share plus the surviving-match count', async () => {
    fg.counts = [4, 2, 0];
    fg.nullCount = 0;
    const viz = makeViz([{ type: 'range', column: 'age', min: 30, max: 40 }]);
    await settled(viz);
    const anyViz = viz as unknown as {
      segmentPositions: { x: number; width: number; index: number }[];
      handleMouseMove: (x: number, y: number) => void;
      handleMouseLeave: () => void;
    };
    const pos = anyViz.segmentPositions.find((p) => p.index === 0);
    expect(pos).toBeDefined();
    anyViz.handleMouseMove(pos!.x + pos!.width / 2, 20);
    const hover = lastStats();
    expect(hover).toContain('Category:');
    expect(hover).toContain('8 rows (40.0%)');
    expect(hover).toContain('4 match');

    // No committed selection on this column — mouse-out restores default.
    anyViz.handleMouseLeave();
    expectCleared();
    viz.destroy();
  });

  it('routes labels and count line through messages overrides', async () => {
    const viz = makeViz([{ type: 'point', column: 'country', value: 'US' }], {
      messages: {
        statistics: {
          categoryLabel: 'Catégorie:',
          selectionRowCount: (count: number, pct: string) => `${count} lignes (${pct})`,
        },
      } as unknown as VisualizationOptions['messages'],
    });
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Catégorie:');
    expect(detail).toContain('8 lignes (40.0%)');
    viz.destroy();
  });
});

describe('ValueCounts — Other segment detail', () => {
  function unfilteredWithOther(): ValueCountsData {
    return {
      segments: [
        { value: 'US', count: 8, isOther: false },
        { value: 'CA', count: 5, isOther: false },
        { value: 'Other', count: 3, isOther: true, otherCount: 5 },
      ],
      nullCount: 4,
      distinctCount: 7,
      total: 20,
      isAllUnique: false,
    } as ValueCountsData;
  }

  it('not-set from an Other click emits the Other label with folded value count', async () => {
    vi.mocked(fetchValueCountsData).mockImplementation(() =>
      Promise.resolve(unfilteredWithOther()),
    );
    vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => {
      const base = unfilteredWithOther();
      return Promise.resolve({
        ...base,
        segments: base.segments.map((s, i) => ({ ...s, count: i === 2 ? 3 : 0 })),
        nullCount: 0,
        total: 3,
      } as ValueCountsData);
    });
    const viz = makeViz([{ type: 'not-set', column: 'country', values: ['US', 'CA'] }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Other (5 values)');
    expect(detail).toContain('3 rows (15.0%)');
    viz.destroy();
  });

  it('marks the folded value count as an estimate above the approximation threshold', async () => {
    // Above 100,000 rows `distinctCount` is a HyperLogLog estimate, and the
    // folded count is derived from it. The stats line one row up already says
    // `~N unique`; printing this one bare would state the same estimate as a
    // fact. The segment's *row* count stays exact and unmarked.
    const approx = (): ValueCountsData =>
      ({ ...unfilteredWithOther(), distinctCountApprox: true }) as ValueCountsData;
    vi.mocked(fetchValueCountsData).mockImplementation(() => Promise.resolve(approx()));
    vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => {
      const base = approx();
      return Promise.resolve({
        ...base,
        segments: base.segments.map((s, i) => ({ ...s, count: i === 2 ? 3 : 0 })),
        nullCount: 0,
        total: 3,
      } as ValueCountsData);
    });
    const viz = makeViz([{ type: 'not-set', column: 'country', values: ['US', 'CA'] }]);
    await settled(viz);
    const detail = lastStats();
    expect(detail).toContain('Other (~5 values)');
    expect(detail).toContain('3 rows (15.0%)');
    viz.destroy();
  });

  /**
   * Folding keeps the top MAX_CATEGORIES values as their own segment and rolls
   * the rest into Other, whose total is known but whose membership is not. A
   * filter naming a folded value therefore cannot be counted from the drawn
   * segments in either direction, so the detail is suppressed rather than
   * stated wrongly. `'rare'` below is one of Other's 5 folded values.
   */
  function mockFolded(fgCounts: [number, number, number], fgNull = 0): void {
    vi.mocked(fetchValueCountsData).mockImplementation(() =>
      Promise.resolve(unfilteredWithOther()),
    );
    vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => {
      const base = unfilteredWithOther();
      const segments = base.segments.map((s, i) => ({ ...s, count: fgCounts[i] ?? 0 }));
      return Promise.resolve({
        ...base,
        segments,
        nullCount: fgNull,
        total: segments.reduce((sum, s) => sum + s.count, 0) + fgNull,
      } as ValueCountsData);
    });
  }

  it('not-set excluding a folded value suppresses rather than attributing all of Other', async () => {
    // NOT IN ('rare') matches 14 of 20 rows. Sync selects Other whole plus US
    // and CA (neither is named), which sums to 16 — an overcount of exactly
    // the folded value's rows, because Other holds rows the filter excludes.
    mockFolded([8, 5, 1], 0);
    const viz = makeViz([{ type: 'not-set', column: 'country', values: ['rare'] }]);
    await settled(viz);
    expectCleared();
    viz.destroy();
  });

  it('set naming a folded value suppresses rather than rendering as a single category', async () => {
    // IN ('US','rare') matches 10 rows; value-matching sync skips Other, so the
    // detail would have read "Category: US · 8 rows (40.0%)" — a two-value set
    // displayed as a one-value selection, with the wrong count.
    mockFolded([8, 0, 2], 0);
    const viz = makeViz([{ type: 'set', column: 'country', values: ['US', 'rare'] }]);
    await settled(viz);
    expectCleared();
    viz.destroy();
  });

  it('point on a folded value emits no detail', async () => {
    mockFolded([0, 0, 2], 0);
    const viz = makeViz([{ type: 'point', column: 'country', value: 'rare' }]);
    await settled(viz);
    expectCleared();
    viz.destroy();
  });

  it('suppression is a property of the filter, not of the last gesture', async () => {
    // The guard used to live only in emitCommittedStats, so any path that
    // restored the committed text directly — mouse-leave, hover-exit —
    // republished the very text the guard exists to prevent.
    mockFolded([8, 5, 0], 0);
    const viz = makeViz([{ type: 'pattern', column: 'country', pattern: 'C', mode: 'contains' }]);
    await settled(viz);
    expectCleared();

    const selected = (viz as unknown as { selectedSegments: Set<number> }).selectedSegments;
    expect(selected.size).toBeGreaterThan(0);

    (viz as unknown as { handleMouseLeave: () => void }).handleMouseLeave();
    expectCleared();
    viz.destroy();
  });
});

describe('ValueCounts — render() early returns consume the filter-sync flag', () => {
  /**
   * `emitCommittedStats()` runs after `render()` on the premise that the
   * filter→selection sync happened inside it. The all-unique and empty-state
   * paths return before that block, so they consume the flag themselves —
   * otherwise a stale selection publishes a detail for a filter that is gone,
   * and the leaked flag fires the sync at an arbitrary later render.
   */
  function mockAllUnique(): void {
    const data = {
      segments: [{ value: 'a', count: 1, isOther: false }],
      nullCount: 0,
      distinctCount: 20,
      total: 20,
      isAllUnique: true,
    } as ValueCountsData;
    vi.mocked(fetchValueCountsData).mockImplementation(() => Promise.resolve(data));
    vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => Promise.resolve(data));
  }

  it('an all-unique column leaves no pending sync and no phantom selection', async () => {
    mockAllUnique();
    const viz = makeViz([{ type: 'null', column: 'country' }]);
    await settled(viz);

    const internals = viz as unknown as {
      pendingFilterSync: boolean;
      selectedSegments: Set<number>;
    };
    expect(internals.pendingFilterSync).toBe(false);
    expect(internals.selectedSegments.size).toBe(0);
    expectCleared();
    viz.destroy();
  });

  it('an empty column leaves no pending sync and no phantom selection', async () => {
    const empty = {
      segments: [],
      nullCount: 0,
      distinctCount: 0,
      total: 0,
      isAllUnique: false,
    } as unknown as ValueCountsData;
    vi.mocked(fetchValueCountsData).mockImplementation(() => Promise.resolve(empty));
    vi.mocked(fetchAlignedValueCountsData).mockImplementation(() => Promise.resolve(empty));

    const viz = makeViz([{ type: 'point', column: 'country', value: 'US' }]);
    await settled(viz);

    const internals = viz as unknown as {
      pendingFilterSync: boolean;
      selectedSegments: Set<number>;
    };
    expect(internals.pendingFilterSync).toBe(false);
    expect(internals.selectedSegments.size).toBe(0);
    expectCleared();
    viz.destroy();
  });
});
