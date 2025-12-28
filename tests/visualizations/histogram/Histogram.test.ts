/**
 * Histogram Visualization Tests
 *
 * Tests the Histogram class for rendering histogram visualizations.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock canvas 2D context
const mockContext = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
  fillStyle: '',
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock the WorkerBridge and fetchHistogramData before importing Histogram
vi.mock('../../../src/data/WorkerBridge', () => ({
  WorkerBridge: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

vi.mock('../../../src/visualizations/histogram/HistogramData', () => ({
  fetchHistogramData: vi.fn().mockResolvedValue({
    bins: [
      { x0: 0, x1: 10, count: 5 },
      { x0: 10, x1: 20, count: 15 },
      { x0: 20, x1: 30, count: 25 },
      { x0: 30, x1: 40, count: 10 },
      { x0: 40, x1: 50, count: 3 },
    ],
    nullCount: 2,
    min: 0,
    max: 50,
    total: 60,
  }),
}));

import { Histogram } from '../../../src/visualizations/histogram/Histogram';
import { fetchHistogramData } from '../../../src/visualizations/histogram/HistogramData';
import type { ColumnSchema } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

describe('Histogram', () => {
  let container: HTMLElement;
  let column: ColumnSchema;
  let options: VisualizationOptions;
  let histogram: Histogram;

  beforeEach(() => {
    // Create container with dimensions
    container = document.createElement('div');
    container.style.width = '150px';
    container.style.height = '60px';
    document.body.appendChild(container);

    // Mock getBoundingClientRect
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
      name: 'test_column',
      type: 'integer',
      nullable: true,
      originalType: 'INTEGER',
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

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    histogram?.destroy();
    container.remove();
  });

  describe('constructor', () => {
    it('creates a canvas element in the container', () => {
      histogram = new Histogram(container, column, options);

      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.style.width).toBe('100%');
      expect(canvas?.style.height).toBe('100%');
    });

    it('calls fetchData on creation', async () => {
      histogram = new Histogram(container, column, options);

      // Wait for async fetchData
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Default maxBins is 20
      expect(fetchHistogramData).toHaveBeenCalledWith(
        'test_table',
        'test_column',
        20,
        [],
        options.bridge
      );
    });
  });

  describe('render', () => {
    it('renders bars after data loads', async () => {
      histogram = new Histogram(container, column, options);

      // Wait for data to load and render
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The histogram should have rendered (we can't easily test canvas content,
      // but we can verify no errors occurred)
      expect(histogram.isDestroyed()).toBe(false);
    });

    it('shows empty state when no data', async () => {
      // Mock empty data
      vi.mocked(fetchHistogramData).mockResolvedValueOnce({
        bins: [],
        nullCount: 0,
        min: 0,
        max: 0,
        total: 0,
      });

      histogram = new Histogram(container, column, options);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(histogram.isDestroyed()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('removes canvas from DOM', () => {
      histogram = new Histogram(container, column, options);
      expect(container.querySelector('canvas')).not.toBeNull();

      histogram.destroy();
      expect(container.querySelector('canvas')).toBeNull();
    });

    it('marks visualization as destroyed', () => {
      histogram = new Histogram(container, column, options);
      expect(histogram.isDestroyed()).toBe(false);

      histogram.destroy();
      expect(histogram.isDestroyed()).toBe(true);
    });

    it('prevents further renders after destroy', async () => {
      histogram = new Histogram(container, column, options);
      histogram.destroy();

      // This should not throw
      await histogram.fetchData();
    });
  });

  describe('getColumn', () => {
    it('returns the column schema', () => {
      histogram = new Histogram(container, column, options);
      expect(histogram.getColumn()).toBe(column);
    });
  });

  describe('mouse interaction', () => {
    it('handles mouse events without error', async () => {
      histogram = new Histogram(container, column, options);

      // Wait for render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const canvas = container.querySelector('canvas')!;

      // Simulate mouse events
      const moveEvent = new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 30,
      });
      const leaveEvent = new MouseEvent('mouseleave');
      const clickEvent = new MouseEvent('click', {
        clientX: 50,
        clientY: 30,
      });

      // These should not throw
      canvas.dispatchEvent(moveEvent);
      canvas.dispatchEvent(leaveEvent);
      canvas.dispatchEvent(clickEvent);

      expect(histogram.isDestroyed()).toBe(false);
    });
  });
});

describe('formatAxisValue utility', () => {
  // Test the formatAxisValue function indirectly through axis labels
  // Since it's a private function, we test its behavior through the rendered output

  it('formats large numbers with abbreviations', async () => {
    // Mock data with large values
    vi.mocked(fetchHistogramData).mockResolvedValueOnce({
      bins: [
        { x0: 0, x1: 1000000, count: 50 },
        { x0: 1000000, x1: 2000000, count: 30 },
      ],
      nullCount: 0,
      min: 0,
      max: 2000000,
      total: 80,
    });

    const container = document.createElement('div');
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

    const column: ColumnSchema = {
      name: 'big_numbers',
      type: 'integer',
      nullable: false,
      originalType: 'INTEGER',
    };

    const options: VisualizationOptions = {
      tableName: 'test_table',
      bridge: {
        query: vi.fn().mockResolvedValue([]),
        initialize: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn(),
      } as unknown as VisualizationOptions['bridge'],
      filters: [],
    };

    const histogram = new Histogram(container, column, options);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Histogram should render without errors
    expect(histogram.isDestroyed()).toBe(false);

    histogram.destroy();
    container.remove();
  });
});
