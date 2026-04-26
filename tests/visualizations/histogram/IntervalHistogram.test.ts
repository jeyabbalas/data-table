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

vi.mock('../../../src/visualizations/histogram/IntervalHistogramData', () => ({
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
  secondsToIntervalString: vi.fn((s: number) => `${s}s`),
  secondsToIntervalSQL: vi.fn((s: number) => `${s} seconds`),
  parseIntervalToSeconds: vi.fn((s: string) => parseInt(s, 10) || 0),
  MONTH_SECONDS: 2629800,
  YEAR_SECONDS: 31557600,
}));

import { IntervalHistogram } from '../../../src/visualizations/histogram/IntervalHistogram';
import { fetchIntervalHistogramData } from '../../../src/visualizations/histogram/IntervalHistogramData';
import type { ColumnSchema } from '../../../src/core/types';
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

  describe('brush sync fencepost', () => {
    it('does not include extra bin when filter min drifts below bin boundary', async () => {
      // Simulate the round-trip precision loss: filter min is slightly below
      // the bin boundary at 720, which could falsely include bin 0 ([0, 720)).
      const { parseIntervalToSeconds } =
        await import('../../../src/visualizations/histogram/IntervalHistogramData');
      vi.mocked(parseIntervalToSeconds).mockImplementation((s: unknown) => {
        const str = String(s);
        // Simulate drift: "720 seconds" parses to 719.9999 (just below bin edge)
        if (str === '720 seconds') return 719.9999;
        if (str === '2160 seconds') return 2160;
        return parseInt(str, 10) || 0;
      });

      // Set up filter selecting bins 1-2 (720–2160)
      options.filters = [
        {
          column: 'duration',
          type: 'range' as const,
          min: '720 seconds',
          max: '2160 seconds',
          valueType: 'interval' as const,
        },
      ];

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Access private brushState to verify correct bin range
      const state = histogram as unknown as Record<string, unknown>;
      const brushState = state.brushState as {
        startBinIndex: number;
        endBinIndex: number;
        committed: boolean;
      };

      expect(brushState.committed).toBe(true);
      // Should select bins 1-2, NOT bins 0-2 (the epsilon guard prevents bin 0)
      expect(brushState.startBinIndex).toBe(1);
      expect(brushState.endBinIndex).toBe(2);
    });

    it('does not include extra bin when filter max drifts above bin boundary', async () => {
      const { parseIntervalToSeconds } =
        await import('../../../src/visualizations/histogram/IntervalHistogramData');
      vi.mocked(parseIntervalToSeconds).mockImplementation((s: unknown) => {
        const str = String(s);
        if (str === '720 seconds') return 720;
        // Simulate drift: "2160 seconds" parses to 2160.0001 (just above bin edge)
        if (str === '2160 seconds') return 2160.0001;
        return parseInt(str, 10) || 0;
      });

      options.filters = [
        {
          column: 'duration',
          type: 'range' as const,
          min: '720 seconds',
          max: '2160 seconds',
          valueType: 'interval' as const,
        },
      ];

      histogram = new IntervalHistogram(container, column, options);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = histogram as unknown as Record<string, unknown>;
      const brushState = state.brushState as {
        startBinIndex: number;
        endBinIndex: number;
        committed: boolean;
      };

      expect(brushState.committed).toBe(true);
      // Should select bins 1-2, NOT bins 1-3 (the epsilon guard prevents bin 3)
      expect(brushState.startBinIndex).toBe(1);
      expect(brushState.endBinIndex).toBe(2);
    });
  });
});
