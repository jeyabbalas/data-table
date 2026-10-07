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
    // Each bar with its smallest and largest value, as the unfiltered fetch sets them.
    bins: [
      {
        binStartSeconds: 0,
        binEndSeconds: 720,
        count: 10,
        minValue: '00:00:30',
        maxValue: '00:11:30',
      },
      {
        binStartSeconds: 720,
        binEndSeconds: 1440,
        count: 20,
        minValue: '00:12:30',
        maxValue: '00:23:30',
      },
      {
        binStartSeconds: 1440,
        binEndSeconds: 2160,
        count: 15,
        minValue: '00:24:30',
        maxValue: '00:35:30',
      },
      {
        binStartSeconds: 2160,
        binEndSeconds: 2880,
        count: 8,
        minValue: '00:36:30',
        maxValue: '00:47:30',
      },
      {
        binStartSeconds: 2880,
        binEndSeconds: 3600,
        count: 5,
        minValue: '00:48:30',
        maxValue: '01:00:00',
      },
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

    /** A bar, with its smallest and largest value when it holds any. */
    const bar = (start: number, end: number, count: number, values?: [string, string]) => ({
      binStartSeconds: start,
      binEndSeconds: end,
      count,
      ...(values && { minValue: values[0], maxValue: values[1] }),
    });

    /** Brush bars `start`–`end`, as a drag would, and return what it emits. */
    const brush = (h: IntervalHistogram, start: number, end: number): Filter | null => {
      const onFilterChange = vi.fn();
      options.onFilterChange = onFilterChange;
      const state = h as unknown as Brushable;
      state.brushState.startBinIndex = start;
      state.brushState.endBinIndex = end;
      state.brushState.committed = true;
      state.emitBrushFilter();
      return onFilterChange.mock.calls[0]![0] as Filter | null;
    };

    const brushStateOf = (h: IntervalHistogram) => (h as unknown as Brushable).brushState;

    const mockData = (bins: ReturnType<typeof bar>[], isSingleValue = false) => {
      vi.mocked(fetchIntervalHistogramData).mockResolvedValueOnce({
        bins,
        nullCount: 0,
        minSeconds: bins[0]!.binStartSeconds,
        maxSeconds: bins[bins.length - 1]!.binEndSeconds,
        medianSeconds: null,
        total: bins.reduce((sum, b) => sum + b.count, 0),
        isSingleValue,
      });
      vi.mocked(fetchIntervalNumericBins).mockResolvedValueOnce(bins);
    };

    it('restores bars 1–2 from a filter between their values, and no neighbour', async () => {
      // Bar 0's largest value is 00:11:30 and bar 3's smallest 00:36:30.
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

    it('filters a brush from its bars’ values and restores it after the refetch', async () => {
      // Five 0.3 ms bars from 0.1 ms.
      mockData([
        bar(0.0001, 0.0004, 3, ['00:00:00.0001', '00:00:00.0003']),
        bar(0.0004, 0.0007, 3, ['00:00:00.0004', '00:00:00.0006']),
        bar(0.0007, 0.001, 3, ['00:00:00.0007', '00:00:00.0009']),
        bar(0.001, 0.0013, 3, ['00:00:00.001', '00:00:00.0012']),
        bar(0.0013, 0.0016, 4, ['00:00:00.0013', '00:00:00.0016']),
      ]);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filter = brush(histogram, 1, 2)!;
      expect(filter).toEqual({
        column: 'duration',
        type: 'range',
        min: '00:00:00.0004',
        max: '00:00:00.0009',
        valueType: 'interval',
        maxInclusive: true,
      });

      // The crossfilter refetch under that filter keeps the brush on bars 1–2.
      await histogram.updateFilters([filter]);
      expect(brushStateOf(histogram)).toMatchObject({
        committed: true,
        startBinIndex: 1,
        endBinIndex: 2,
      });
    });

    it('takes the values from the unfiltered bars under another column’s filter', async () => {
      // The foreground bars, from the filtered fetch, carry no values.
      options.filters = [{ type: 'null', column: 'other' }];

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(brush(histogram, 1, 2)).toMatchObject({ min: '00:12:30', max: '00:35:30' });
    });

    it('writes no filter for a brush over bars holding no value, and drops the brush', async () => {
      mockData([
        bar(0, 1, 1, ['00:00:00', '00:00:00']),
        bar(1, 2, 0),
        bar(2, 3, 0),
        bar(3, 4, 1, ['00:00:04', '00:00:04']),
      ]);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The brush and any filter it had go: a filter removal, not one that matches nothing.
      expect(brush(histogram, 1, 2)).toBeNull();
      expect(brushStateOf(histogram).committed).toBe(false);
    });

    it('restores a click on a single-value chart after the refetch', async () => {
      mockData([bar(0.25, 0.25, 4, ['00:00:00.25', '00:00:00.25'])], true);

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const filter = brush(histogram, 0, 0)!;
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
