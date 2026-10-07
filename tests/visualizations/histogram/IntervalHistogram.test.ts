/**
 * IntervalHistogram Visualization Tests
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock canvas 2D context
const mockContext = {
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
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

vi.mock('../../../src/data/WorkerBridge', () => ({
  WorkerBridge: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

// The fetches are mocked; the parsing, formatting and brush helpers are real.
vi.mock('../../../src/visualizations/histogram/IntervalHistogramData', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../src/visualizations/histogram/IntervalHistogramData')
  >()),
  fetchIntervalHistogramData: vi.fn().mockResolvedValue({
    bins: [
      { binStartSeconds: 0, binEndSeconds: 720, count: 10 },
      { binStartSeconds: 720, binEndSeconds: 1440, count: 20 },
      { binStartSeconds: 1440, binEndSeconds: 2160, count: 15 },
      { binStartSeconds: 2160, binEndSeconds: 2880, count: 8 },
      { binStartSeconds: 2880, binEndSeconds: 3600, count: 5 },
    ],
    nullCount: 3,
    minSeconds: 0,
    maxSeconds: 3600,
    medianSeconds: 1800,
    total: 61,
    isSingleValue: false,
  }),
  fetchIntervalColumnStats: vi.fn().mockResolvedValue({
    minSeconds: 0,
    maxSeconds: 3600,
    medianSeconds: 1800,
    count: 58,
    nullCount: 3,
  }),
  fetchIntervalNumericBins: vi.fn().mockResolvedValue([
    { binStartSeconds: 0, binEndSeconds: 720, count: 5 },
    { binStartSeconds: 720, binEndSeconds: 1440, count: 10 },
    { binStartSeconds: 1440, binEndSeconds: 2160, count: 8 },
    { binStartSeconds: 2160, binEndSeconds: 2880, count: 4 },
    { binStartSeconds: 2880, binEndSeconds: 3600, count: 3 },
  ]),
}));

import { IntervalHistogram } from '../../../src/visualizations/histogram/IntervalHistogram';
import {
  fetchIntervalHistogramData,
  fetchIntervalNumericBins,
} from '../../../src/visualizations/histogram/IntervalHistogramData';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

describe('IntervalHistogram', () => {
  let container: HTMLElement;
  let column: ColumnSchema;
  let options: VisualizationOptions;
  let histogram: IntervalHistogram;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '150px';
    container.style.height = '60px';
    document.body.appendChild(container);

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

    column = {
      name: 'duration',
      type: 'interval',
      nullable: true,
      originalType: 'INTERVAL',
    };

    options = {
      tableName: 'test_table',
      bridge: {
        query: vi.fn().mockResolvedValue([]),
        initialize: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn(),
      } as unknown as VisualizationOptions['bridge'],
      filters: [],
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    histogram?.destroy();
    container.remove();
  });

  describe('constructor', () => {
    it('creates a canvas element in the container', () => {
      histogram = new IntervalHistogram(container, column, options);
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.style.width).toBe('100%');
      expect(canvas?.style.height).toBe('100%');
    });

    it('calls fetchData on creation', async () => {
      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(fetchIntervalHistogramData).toHaveBeenCalledWith(
        'test_table',
        'duration',
        [],
        options.bridge,
        15,
      );
    });
  });

  describe('render', () => {
    it('renders bars after data loads', async () => {
      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(histogram.isDestroyed()).toBe(false);
    });

    it('shows empty state when no data', async () => {
      vi.mocked(fetchIntervalHistogramData).mockResolvedValueOnce({
        bins: [],
        nullCount: 0,
        minSeconds: null,
        maxSeconds: null,
        medianSeconds: null,
        total: 0,
        isSingleValue: false,
      });

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(histogram.isDestroyed()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('removes canvas from DOM', () => {
      histogram = new IntervalHistogram(container, column, options);
      expect(container.querySelector('canvas')).not.toBeNull();

      histogram.destroy();
      expect(container.querySelector('canvas')).toBeNull();
    });

    it('marks visualization as destroyed', () => {
      histogram = new IntervalHistogram(container, column, options);
      expect(histogram.isDestroyed()).toBe(false);
      histogram.destroy();
      expect(histogram.isDestroyed()).toBe(true);
    });

    it('prevents further renders after destroy', async () => {
      histogram = new IntervalHistogram(container, column, options);
      histogram.destroy();
      await histogram.fetchData();
    });
  });

  describe('stats emission', () => {
    it('emits IntervalColumnStats via onDefaultStatsChange', async () => {
      const statsCallback = vi.fn();
      options.onDefaultStatsChange = statsCallback;

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(statsCallback).toHaveBeenCalled();
      const stats = statsCallback.mock.calls[0][0];
      expect(stats.kind).toBe('interval');
      expect(stats.totalRows).toBe(61);
      expect(stats.nullCount).toBe(3);
      expect(stats.nonNullCount).toBe(58);
    });
  });

  describe('getColumn', () => {
    it('returns the column schema', () => {
      histogram = new IntervalHistogram(container, column, options);
      expect(histogram.getColumn()).toBe(column);
    });
  });

  describe('mouse interaction', () => {
    it('handles mouse events without error', async () => {
      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const canvas = container.querySelector('canvas')!;
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 30 }));
      canvas.dispatchEvent(new MouseEvent('mouseleave'));
      canvas.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 30 }));

      expect(histogram.isDestroyed()).toBe(false);
    });
  });

  describe('brush sync', () => {
    type Brushable = {
      brushState: { startBinIndex: number; endBinIndex: number; committed: boolean };
      emitBrushFilter(): void;
    };

    /** Bars as fetchIntervalNumericBins makes them. */
    const barsOf = (min: number, max: number, n: number, count: number) => {
      const width = (max - min) / n;
      return Array.from({ length: n }, (_, i) => ({
        binStartSeconds: min + i * width,
        binEndSeconds: i === n - 1 ? max : min + (i + 1) * width,
        count,
      }));
    };

    /** Brush bars `start`–`end`, as a drag would, and return the filter it emits. */
    const brush = (h: IntervalHistogram, start: number, end: number): Filter => {
      const onFilterChange = vi.fn();
      options.onFilterChange = onFilterChange;
      const state = h as unknown as Brushable;
      state.brushState.startBinIndex = start;
      state.brushState.endBinIndex = end;
      state.brushState.committed = true;
      state.emitBrushFilter();
      return onFilterChange.mock.calls[0]![0] as Filter;
    };

    const brushStateOf = (h: IntervalHistogram) => (h as unknown as Brushable).brushState;

    it('restores bars 1–2 from bounds a hair off their edges, and no neighbour', async () => {
      // The bars run 0, 12, 24, 36, 48, 60 minutes. Within half a microsecond
      // of an edge is the edge.
      options.filters = [
        {
          column: 'duration',
          type: 'range' as const,
          min: '00:11:59.9999996',
          max: '00:36:00.0000004',
          valueType: 'interval' as const,
        },
      ];

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 1,
        endBinIndex: 2,
      });
    });

    it('reads a filter added in code in any unit DuckDB reads', async () => {
      options.filters = [
        {
          column: 'duration',
          type: 'range' as const,
          min: '12 minutes',
          max: '0.6 hours',
          valueType: 'interval' as const,
        },
      ];

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 1,
        endBinIndex: 2,
      });
    });

    it('restores a brush on 0.3 ms bars after the refetch', async () => {
      // Five 0.3 ms bars from 0.1 ms.
      const bins = barsOf(0.0001, 0.0016, 5, 10);
      vi.mocked(fetchIntervalHistogramData).mockResolvedValueOnce({
        bins,
        nullCount: 0,
        minSeconds: 0.0001,
        maxSeconds: 0.0016,
        medianSeconds: 0.00085,
        total: 50,
        isSingleValue: false,
      });
      vi.mocked(fetchIntervalNumericBins).mockResolvedValueOnce(bins);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 1 ms itself is bar 2's: the bin query's FLOOR((0.001 - 0.0001) / w)
      // is FLOOR(2.9999999999999996). So the brush runs to 1,001 µs.
      const filter = brush(histogram, 1, 2);
      expect(filter).toMatchObject({
        type: 'range',
        min: '00:00:00.0004',
        max: '00:00:00.001001',
        valueType: 'interval',
      });

      // The crossfilter refetch under that filter keeps the brush on bars 1–2.
      await histogram.updateFilters([filter]);
      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 1,
        endBinIndex: 2,
      });
    });

    it('starts a brush on bars under 2 µs at their first whole microsecond', async () => {
      // 1 to 20 µs in 15 bars: bar 5 runs from 7.33 to 8.6 µs and holds only
      // 8 µs. Rounded to the nearest, its start would take bar 4's 7 µs.
      const bins = barsOf(0.000001, 0.00002, 15, 1);
      vi.mocked(fetchIntervalHistogramData).mockResolvedValueOnce({
        bins,
        nullCount: 0,
        minSeconds: 0.000001,
        maxSeconds: 0.00002,
        medianSeconds: 0.0000105,
        total: 20,
        isSingleValue: false,
      });
      vi.mocked(fetchIntervalNumericBins).mockResolvedValueOnce(bins);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filter = brush(histogram, 5, 5);
      expect(filter).toMatchObject({ min: '00:00:00.000008', max: '00:00:00.000009' });
      await histogram.updateFilters([filter]);
      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 5,
        endBinIndex: 5,
      });
    });

    it('restores a click on a single-value chart after the refetch', async () => {
      const bins = [{ binStartSeconds: 0.25, binEndSeconds: 0.25, count: 4 }];
      vi.mocked(fetchIntervalHistogramData).mockResolvedValueOnce({
        bins,
        nullCount: 0,
        minSeconds: 0.25,
        maxSeconds: 0.25,
        medianSeconds: 0.25,
        total: 4,
        isSingleValue: true,
      });
      vi.mocked(fetchIntervalNumericBins).mockResolvedValueOnce(bins);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filter = brush(histogram, 0, 0);
      expect(filter).toMatchObject({
        min: '00:00:00.25',
        max: '00:00:00.25',
        maxInclusive: true,
      });
      await histogram.updateFilters([filter]);
      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 0,
        endBinIndex: 0,
      });
    });
  });
});
