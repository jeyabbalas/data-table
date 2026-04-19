/**
 * VisualizationFactory Tests
 *
 * Tests the centralized visualization factory, helper functions,
 * and WindowListenerManager behavior.
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
  stroke: vi.fn(),
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

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock data modules
vi.mock('../../src/data/WorkerBridge', () => ({
  WorkerBridge: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

vi.mock('../../src/visualizations/histogram/HistogramData', () => ({
  fetchHistogramData: vi.fn().mockResolvedValue({
    bins: [{ x0: 0, x1: 10, count: 5 }],
    nullCount: 0,
    min: 0,
    max: 10,
    total: 5,
  }),
}));

vi.mock('../../src/visualizations/histogram/DateHistogramData', () => ({
  fetchDateHistogramData: vi.fn().mockResolvedValue({
    bins: [{ x0: '2024-01-01', x1: '2024-02-01', count: 5 }],
    nullCount: 0,
    total: 5,
    interval: 'month',
    minDate: '2024-01-01',
    maxDate: '2024-02-01',
  }),
}));

vi.mock('../../src/visualizations/histogram/TimeHistogramData', () => ({
  fetchTimeHistogramData: vi.fn().mockResolvedValue({
    bins: [{ x0: 0, x1: 3600, count: 5, x0Formatted: '00:00', x1Formatted: '01:00' }],
    nullCount: 0,
    total: 5,
    minSeconds: 0,
    maxSeconds: 3600,
  }),
}));

vi.mock('../../src/visualizations/histogram/IntervalHistogramData', () => ({
  fetchIntervalHistogramData: vi.fn().mockResolvedValue({
    bins: [{ binStartSeconds: 0, binEndSeconds: 3600, count: 5 }],
    nullCount: 0,
    total: 5,
    minSeconds: 0,
    maxSeconds: 3600,
    medianSeconds: 1800,
    isSingleValue: false,
  }),
  fetchIntervalColumnStats: vi.fn().mockResolvedValue({
    minSeconds: 0, maxSeconds: 3600, medianSeconds: 1800, count: 5, nullCount: 0,
  }),
  fetchIntervalNumericBins: vi.fn().mockResolvedValue([
    { binStartSeconds: 0, binEndSeconds: 3600, count: 5 },
  ]),
  secondsToIntervalString: vi.fn((s: number) => `${s}s`),
  secondsToIntervalSQL: vi.fn((s: number) => `${s} seconds`),
  parseIntervalToSeconds: vi.fn((s: string) => parseInt(s, 10) || 0),
  MONTH_SECONDS: 2629800,
  YEAR_SECONDS: 31557600,
}));

vi.mock('../../src/visualizations/valuecounts/ValueCountsData', () => ({
  fetchValueCountsData: vi.fn().mockResolvedValue({
    segments: [{ value: 'a', count: 5, percentage: 100 }],
    nullCount: 0,
    total: 5,
    uniqueCount: 1,
  }),
}));

import { VisualizationFactory } from '../../src/visualizations/VisualizationFactory';
import {
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
  needsVisualization,
} from '../../src/visualizations/VisualizationFactory';
import { Histogram } from '../../src/visualizations/histogram/Histogram';
import { DateHistogram } from '../../src/visualizations/histogram/DateHistogram';
import { TimeHistogram } from '../../src/visualizations/histogram/TimeHistogram';
import { IntervalHistogram } from '../../src/visualizations/histogram/IntervalHistogram';
import { ValueCounts } from '../../src/visualizations/valuecounts/ValueCounts';
import { BaseVisualization } from '../../src/visualizations/BaseVisualization';
import type { ColumnSchema, DataType } from '../../src/core/types';
import type { VisualizationOptions } from '../../src/visualizations/BaseVisualization';

function makeContainer(): HTMLElement {
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
  return container;
}

function makeColumn(type: DataType, name = 'test_col'): ColumnSchema {
  return { name, type, nullable: true, originalType: type.toUpperCase() };
}

function makeOptions(): VisualizationOptions {
  return {
    tableName: 'test_table',
    bridge: {
      query: vi.fn().mockResolvedValue([]),
      initialize: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as VisualizationOptions['bridge'],
    filters: [],
  };
}

describe('VisualizationFactory', () => {
  let containers: HTMLElement[] = [];
  let visualizations: BaseVisualization[] = [];

  beforeEach(() => {
    // Suppress the Phase 3 deprecation warn emitted on the first static call.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    VisualizationFactory.resetToDefaults();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const viz of visualizations) {
      viz.destroy();
    }
    visualizations = [];
    for (const c of containers) {
      c.remove();
    }
    containers = [];
  });

  function createAndTrack(type: DataType): BaseVisualization | null {
    const container = makeContainer();
    containers.push(container);
    const viz = VisualizationFactory.create(container, makeColumn(type), makeOptions());
    if (viz) visualizations.push(viz);
    return viz;
  }

  // =============================================
  // 1. Default registration
  // =============================================
  describe('default registration', () => {
    it('registers all 5 built-in types', () => {
      const types = VisualizationFactory.getRegisteredTypes();
      expect(types).toContain('histogram');
      expect(types).toContain('date-histogram');
      expect(types).toContain('time-histogram');
      expect(types).toContain('interval-histogram');
      expect(types).toContain('value-counts');
      expect(types).toHaveLength(5);
    });
  });

  // =============================================
  // 2. isApplicable
  // =============================================
  describe('isApplicable', () => {
    const supportedTypes: DataType[] = [
      'integer', 'float', 'decimal',
      'date', 'timestamp',
      'time',
      'string', 'boolean', 'uuid',
    ];

    it.each(supportedTypes)('returns true for %s', (type) => {
      expect(VisualizationFactory.isApplicable(makeColumn(type))).toBe(true);
    });

    it('returns true for interval', () => {
      expect(VisualizationFactory.isApplicable(makeColumn('interval'))).toBe(true);
    });
  });

  // =============================================
  // 3. create
  // =============================================
  describe('create', () => {
    it('returns Histogram for integer', () => {
      const viz = createAndTrack('integer');
      expect(viz).toBeInstanceOf(Histogram);
    });

    it('returns Histogram for float', () => {
      const viz = createAndTrack('float');
      expect(viz).toBeInstanceOf(Histogram);
    });

    it('returns Histogram for decimal', () => {
      const viz = createAndTrack('decimal');
      expect(viz).toBeInstanceOf(Histogram);
    });

    it('returns DateHistogram for date', () => {
      const viz = createAndTrack('date');
      expect(viz).toBeInstanceOf(DateHistogram);
    });

    it('returns DateHistogram for timestamp', () => {
      const viz = createAndTrack('timestamp');
      expect(viz).toBeInstanceOf(DateHistogram);
    });

    it('returns TimeHistogram for time', () => {
      const viz = createAndTrack('time');
      expect(viz).toBeInstanceOf(TimeHistogram);
    });

    it('returns ValueCounts for string', () => {
      const viz = createAndTrack('string');
      expect(viz).toBeInstanceOf(ValueCounts);
    });

    it('returns ValueCounts for boolean', () => {
      const viz = createAndTrack('boolean');
      expect(viz).toBeInstanceOf(ValueCounts);
    });

    it('returns ValueCounts for uuid', () => {
      const viz = createAndTrack('uuid');
      expect(viz).toBeInstanceOf(ValueCounts);
    });

    it('returns IntervalHistogram for interval', () => {
      const viz = createAndTrack('interval');
      expect(viz).toBeInstanceOf(IntervalHistogram);
    });

    it('passes container, column, and options to the constructor', () => {
      const container = makeContainer();
      containers.push(container);
      const column = makeColumn('integer');
      const options = makeOptions();

      const viz = VisualizationFactory.create(container, column, options);
      if (viz) visualizations.push(viz);

      expect(viz).not.toBeNull();
      expect(viz!.getColumn()).toBe(column);
      // Canvas should be appended to the container
      expect(container.querySelector('canvas')).not.toBeNull();
    });
  });

  // =============================================
  // 4. Plugin registration
  // =============================================
  describe('plugin registration', () => {
    it('custom type with higher priority overrides built-in', () => {
      // Create a mock visualization class
      class CustomViz extends BaseVisualization {
        async fetchData() {}
        render() {}
        protected handleMouseMove() {}
        protected handleClick() {}
        protected handleMouseLeave() {}
        protected handleMouseDown() {}
        protected handleMouseUp() {}
        protected handleKeyDown() {}
      }

      VisualizationFactory.register({
        name: 'custom-histogram',
        isApplicable: (type) => type === 'integer',
        constructor: CustomViz,
        priority: 1,
      });

      const viz = createAndTrack('integer');
      expect(viz).toBeInstanceOf(CustomViz);
      expect(VisualizationFactory.getRegisteredTypes()).toContain('custom-histogram');
    });

    it('unregister removes a registration', () => {
      expect(VisualizationFactory.unregister('histogram')).toBe(true);
      expect(VisualizationFactory.getRegisteredTypes()).not.toContain('histogram');
      // integer should now not be applicable
      expect(VisualizationFactory.isApplicable(makeColumn('integer'))).toBe(false);
    });

    it('unregister returns false for unknown name', () => {
      expect(VisualizationFactory.unregister('nonexistent')).toBe(false);
    });

    it('re-register replaces existing entry', () => {
      class CustomViz extends BaseVisualization {
        async fetchData() {}
        render() {}
        protected handleMouseMove() {}
        protected handleClick() {}
        protected handleMouseLeave() {}
        protected handleMouseDown() {}
        protected handleMouseUp() {}
        protected handleKeyDown() {}
      }

      VisualizationFactory.register({
        name: 'histogram',
        isApplicable: (type) => type === 'integer',
        constructor: CustomViz,
        priority: 0,
      });

      // Should still only have 5 types (replaced, not added)
      expect(VisualizationFactory.getRegisteredTypes()).toHaveLength(5);

      const viz = createAndTrack('integer');
      expect(viz).toBeInstanceOf(CustomViz);
    });
  });

  // =============================================
  // 5. resetToDefaults
  // =============================================
  describe('resetToDefaults', () => {
    it('clears custom types and restores built-ins', () => {
      // Add custom and remove built-in
      class CustomViz extends BaseVisualization {
        async fetchData() {}
        render() {}
        protected handleMouseMove() {}
        protected handleClick() {}
        protected handleMouseLeave() {}
        protected handleMouseDown() {}
        protected handleMouseUp() {}
        protected handleKeyDown() {}
      }

      VisualizationFactory.register({
        name: 'custom',
        isApplicable: () => true,
        constructor: CustomViz,
        priority: 10,
      });
      VisualizationFactory.unregister('histogram');

      expect(VisualizationFactory.getRegisteredTypes()).toContain('custom');
      expect(VisualizationFactory.getRegisteredTypes()).not.toContain('histogram');

      VisualizationFactory.resetToDefaults();

      expect(VisualizationFactory.getRegisteredTypes()).not.toContain('custom');
      expect(VisualizationFactory.getRegisteredTypes()).toContain('histogram');
      expect(VisualizationFactory.getRegisteredTypes()).toHaveLength(5);
    });
  });

  // =============================================
  // 6. Helper functions
  // =============================================
  describe('helper functions', () => {
    describe('isNumericType', () => {
      it('returns true for integer, float, decimal', () => {
        expect(isNumericType('integer')).toBe(true);
        expect(isNumericType('float')).toBe(true);
        expect(isNumericType('decimal')).toBe(true);
      });

      it('returns false for non-numeric types', () => {
        expect(isNumericType('string')).toBe(false);
        expect(isNumericType('date')).toBe(false);
        expect(isNumericType('time')).toBe(false);
      });
    });

    describe('isDateType', () => {
      it('returns true for date, timestamp', () => {
        expect(isDateType('date')).toBe(true);
        expect(isDateType('timestamp')).toBe(true);
      });

      it('returns false for non-date types', () => {
        expect(isDateType('integer')).toBe(false);
        expect(isDateType('time')).toBe(false);
      });
    });

    describe('isTimeType', () => {
      it('returns true for time', () => {
        expect(isTimeType('time')).toBe(true);
      });

      it('returns false for non-time types', () => {
        expect(isTimeType('date')).toBe(false);
        expect(isTimeType('timestamp')).toBe(false);
      });
    });

    describe('isCategoricalType', () => {
      it('returns true for string, boolean, uuid', () => {
        expect(isCategoricalType('string')).toBe(true);
        expect(isCategoricalType('boolean')).toBe(true);
        expect(isCategoricalType('uuid')).toBe(true);
      });

      it('returns false for non-categorical types', () => {
        expect(isCategoricalType('integer')).toBe(false);
        expect(isCategoricalType('date')).toBe(false);
      });
    });

    describe('needsVisualization', () => {
      it('returns true for all 9 supported types', () => {
        const supported: DataType[] = [
          'integer', 'float', 'decimal',
          'date', 'timestamp',
          'time',
          'string', 'boolean', 'uuid',
        ];
        for (const type of supported) {
          expect(needsVisualization(type)).toBe(true);
        }
      });

      it('returns true for interval', () => {
        expect(needsVisualization('interval')).toBe(true);
      });
    });
  });

  // =============================================
  // 7. Window listener manager
  // =============================================
  describe('window listener manager', () => {
    it('only 2 window listeners regardless of instance count', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');

      const viz1 = createAndTrack('integer');
      const mouseUpCalls1 = addSpy.mock.calls.filter((c) => c[0] === 'mouseup').length;
      const keyDownCalls1 = addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;

      const viz2 = createAndTrack('float');
      const mouseUpCalls2 = addSpy.mock.calls.filter((c) => c[0] === 'mouseup').length;
      const keyDownCalls2 = addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;

      const viz3 = createAndTrack('string');
      const mouseUpCalls3 = addSpy.mock.calls.filter((c) => c[0] === 'mouseup').length;
      const keyDownCalls3 = addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;

      // Should only have 1 mouseup and 1 keydown listener total
      expect(mouseUpCalls3).toBe(1);
      expect(keyDownCalls3).toBe(1);

      // No new listeners added after first
      expect(mouseUpCalls2).toBe(mouseUpCalls1);
      expect(keyDownCalls2).toBe(keyDownCalls1);

      addSpy.mockRestore();
    });

    it('listeners removed when all instances destroyed', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const viz1 = createAndTrack('integer')!;
      const viz2 = createAndTrack('float')!;

      viz1.destroy();
      // Should not remove yet - viz2 still alive
      const mouseUpRemoved1 = removeSpy.mock.calls.filter((c) => c[0] === 'mouseup').length;
      expect(mouseUpRemoved1).toBe(0);

      viz2.destroy();
      // Now all destroyed - listeners should be removed
      const mouseUpRemoved2 = removeSpy.mock.calls.filter((c) => c[0] === 'mouseup').length;
      const keyDownRemoved2 = removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
      expect(mouseUpRemoved2).toBe(1);
      expect(keyDownRemoved2).toBe(1);

      // Remove from tracked so afterEach doesn't double-destroy
      visualizations = visualizations.filter((v) => v !== viz1 && v !== viz2);

      removeSpy.mockRestore();
    });

    it('dispatches mouseup to all instances', async () => {
      const viz1 = createAndTrack('integer')!;
      const viz2 = createAndTrack('float')!;

      const spy1 = vi.spyOn(viz1, 'dispatchWindowMouseUp');
      const spy2 = vi.spyOn(viz2, 'dispatchWindowMouseUp');

      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 30 }));

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('dispatches keydown to all instances', async () => {
      const viz1 = createAndTrack('integer')!;
      const viz2 = createAndTrack('float')!;

      const spy1 = vi.spyOn(viz1, 'dispatchWindowKeyDown');
      const spy2 = vi.spyOn(viz2, 'dispatchWindowKeyDown');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });
  });
});
