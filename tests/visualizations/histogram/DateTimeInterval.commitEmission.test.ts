/**
 * @vitest-environment jsdom
 *
 * Committed-selection stats emission for the `DateHistogram`,
 * `TimeHistogram`, and `IntervalHistogram` subclasses: their `fetchData`
 * hooks call `emitCommittedStats()` after `syncVisualStateFromFilter`, so a
 * null filter created any way shows the null-bin detail (background counts
 * out of the full total), and removing the filter clears the detail.
 *
 * Range-mapping correctness per subclass is covered by their existing
 * interaction/duckdb suites; what is pinned here is the emission hook.
 *
 * Fixture (N = 20): three bins 9 / 5 / 3, null 3.
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

const DAY = 24 * 60 * 60 * 1000;
const D0 = new Date('2024-01-01T00:00:00Z');

function dateBins(counts: number[]) {
  return counts.map((count, i) => ({
    binStart: new Date(D0.getTime() + i * DAY),
    binEnd: new Date(D0.getTime() + (i + 1) * DAY),
    count,
  }));
}

function numericBins(counts: number[], width: number) {
  return counts.map((count, i) => ({ binStart: i * width, binEnd: (i + 1) * width, count }));
}

const canned = {
  fgCounts: [4, 2, 0],
  fgCount: 6,
  fgNullCount: 0,
};

function makeDateInitial() {
  return {
    bins: dateBins([9, 5, 3]),
    nullCount: 3,
    min: D0,
    max: new Date(D0.getTime() + 3 * DAY),
    total: 20,
    interval: 'day',
    isSingleValue: false,
    isNumericBinning: true,
  };
}

function makeTimeInitial() {
  return {
    bins: numericBins([9, 5, 3], 3600),
    nullCount: 3,
    min: 0,
    max: 3 * 3600,
    total: 20,
    interval: 'hour',
    isSingleValue: false,
    isNumericBinning: true,
  };
}

function makeIntervalInitial() {
  return {
    bins: numericBins([9, 5, 3], 3600),
    nullCount: 3,
    min: 0,
    max: 3 * 3600,
    total: 20,
    isSingleValue: false,
    isNumericBinning: true,
  };
}

vi.mock('../../../src/visualizations/histogram/DateHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchDateHistogramData: vi.fn(() => Promise.resolve(makeDateInitial())),
    fetchDateNumericBins: vi.fn(() =>
      Promise.resolve(
        makeDateInitial().bins.map((b, i) => ({ ...b, count: canned.fgCounts[i] ?? 0 })),
      ),
    ),
    fetchDateHistogramBins: vi.fn(() => Promise.resolve([])),
    fetchDateStats: vi.fn(() =>
      Promise.resolve({
        count: canned.fgCount,
        nullCount: canned.fgNullCount,
        min: D0,
        max: new Date(D0.getTime() + 3 * DAY),
      }),
    ),
  };
});

vi.mock('../../../src/visualizations/histogram/TimeHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchTimeHistogramData: vi.fn(() => Promise.resolve(makeTimeInitial())),
    fetchTimeNumericBins: vi.fn(() =>
      Promise.resolve(
        makeTimeInitial().bins.map((b, i) => ({ ...b, count: canned.fgCounts[i] ?? 0 })),
      ),
    ),
    fetchTimeHistogramBins: vi.fn(() => Promise.resolve([])),
    fetchTimeStats: vi.fn(() =>
      Promise.resolve({
        count: canned.fgCount,
        nullCount: canned.fgNullCount,
        min: 0,
        max: 3 * 3600,
      }),
    ),
  };
});

vi.mock('../../../src/visualizations/histogram/IntervalHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchIntervalHistogramData: vi.fn(() => Promise.resolve(makeIntervalInitial())),
    fetchIntervalNumericBins: vi.fn(() =>
      Promise.resolve(
        makeIntervalInitial().bins.map((b, i) => ({ ...b, count: canned.fgCounts[i] ?? 0 })),
      ),
    ),
    fetchIntervalColumnStats: vi.fn(() =>
      Promise.resolve({
        count: canned.fgCount,
        nullCount: canned.fgNullCount,
        min: 0,
        max: 3 * 3600,
        median: 3600,
        minDisplay: '0s',
        maxDisplay: '3h',
        medianDisplay: '1h',
      }),
    ),
  };
});

import { DateHistogram } from '../../../src/visualizations/histogram/DateHistogram';
import { TimeHistogram } from '../../../src/visualizations/histogram/TimeHistogram';
import { IntervalHistogram } from '../../../src/visualizations/histogram/IntervalHistogram';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';
import type { SharedHistogramBase } from '../../../src/visualizations/histogram/SharedHistogramBase';

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn() } as unknown as VisualizationOptions['bridge'];
}

let container: HTMLElement;
let statsChanges: (string | null)[];

function makeOptions(filters: Filter[]): VisualizationOptions {
  return {
    tableName: 't',
    bridge: makeBridge(),
    filters,
    onStatsChange: (s) => statsChanges.push(s),
  };
}

async function settled(viz: SharedHistogramBase<never>): Promise<void> {
  await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
}

function lastStats(): string | null {
  return statsChanges[statsChanges.length - 1] ?? null;
}

beforeEach(() => {
  document.body.innerHTML = '';
  statsChanges = [];
  canned.fgCounts = [4, 2, 0];
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

const CASES = [
  {
    name: 'DateHistogram',
    columnType: 'date' as const,
    originalType: 'DATE',
    make: (filters: Filter[]) =>
      new DateHistogram(
        container,
        { name: 'v', type: 'date', nullable: true, originalType: 'DATE' } as ColumnSchema,
        makeOptions(filters),
      ),
  },
  {
    name: 'TimeHistogram',
    columnType: 'time' as const,
    originalType: 'TIME',
    make: (filters: Filter[]) =>
      new TimeHistogram(
        container,
        { name: 'v', type: 'time', nullable: true, originalType: 'TIME' } as ColumnSchema,
        makeOptions(filters),
      ),
  },
  {
    name: 'IntervalHistogram',
    columnType: 'interval' as const,
    originalType: 'INTERVAL',
    make: (filters: Filter[]) =>
      new IntervalHistogram(
        container,
        { name: 'v', type: 'interval', nullable: true, originalType: 'INTERVAL' } as ColumnSchema,
        makeOptions(filters),
      ),
  },
];

describe.each(CASES)('$name — committed-selection emission hook', ({ make }) => {
  it('null filter present at construction emits the null-bin detail from background counts', async () => {
    canned.fgCounts = [0, 0, 0];
    canned.fgCount = 0;
    canned.fgNullCount = 3;
    const viz = make([{ type: 'null', column: 'v' }]);
    await settled(viz as never);
    const detail = lastStats();
    expect(detail).toContain('Bin:');
    expect(detail).toContain('null');
    expect(detail).toContain('3 rows (15.0%)');
    viz.destroy();
  });

  it('the detail is stable when another column’s filter changes the foreground', async () => {
    canned.fgCounts = [0, 0, 0];
    canned.fgCount = 0;
    canned.fgNullCount = 3;
    const viz = make([{ type: 'null', column: 'v' }]);
    await settled(viz as never);
    const before = lastStats();

    canned.fgNullCount = 1;
    await viz.updateFilters([
      { type: 'null', column: 'v' },
      { type: 'point', column: 'other', value: 'x' },
    ]);
    expect(lastStats()).toBe(before);
    viz.destroy();
  });

  it('removing the filter clears the committed detail', async () => {
    canned.fgCounts = [0, 0, 0];
    canned.fgCount = 0;
    canned.fgNullCount = 3;
    const viz = make([{ type: 'null', column: 'v' }]);
    await settled(viz as never);
    expect(lastStats()).toContain('Bin:');
    await viz.updateFilters([]);
    expect(lastStats()).toBeNull();
    viz.destroy();
  });
});
