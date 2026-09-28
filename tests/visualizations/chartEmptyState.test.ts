/**
 * @vitest-environment jsdom
 *
 * What a header chart draws before its data arrives: nothing. "No data" is
 * for a fetch that came back with no values, not for one still in flight, or
 * one that failed.
 *
 * A chart's resize observer renders it as soon as it is laid out, which is
 * before its first fetch lands. Histograms drew "No data" there, so every
 * chart created as its column scrolled into view flashed it.
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
  roundRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  setLineDash: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  clip: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 30 }),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
};

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

/** Each chart's resize observer, so a test can report a layout as a browser would. */
const resizeCallbacks: ResizeObserverCallback[] = [];
class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

/** The latest chart is laid out: its resize observer reports, and it renders. */
function reportLayout(): void {
  resizeCallbacks.at(-1)!([], {} as ResizeObserver);
}

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** Every fetch a chart makes, in the order it makes them, each left for the test to settle. */
const { fetches, deferredFetch } = vi.hoisted(() => {
  const fetches: Deferred[] = [];
  const deferredFetch = vi.fn(() => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    fetches.push({ promise, resolve, reject });
    return promise;
  });
  return { fetches, deferredFetch };
});

vi.mock('../../src/visualizations/histogram/HistogramData', async (importActual) => ({
  ...((await importActual()) as Record<string, unknown>),
  fetchHistogramData: deferredFetch,
}));
vi.mock('../../src/visualizations/histogram/DateHistogramData', async (importActual) => ({
  ...((await importActual()) as Record<string, unknown>),
  fetchDateHistogramData: deferredFetch,
}));
vi.mock('../../src/visualizations/histogram/TimeHistogramData', async (importActual) => ({
  ...((await importActual()) as Record<string, unknown>),
  fetchTimeHistogramData: deferredFetch,
}));
vi.mock('../../src/visualizations/histogram/IntervalHistogramData', async (importActual) => ({
  ...((await importActual()) as Record<string, unknown>),
  fetchIntervalHistogramData: deferredFetch,
}));
vi.mock('../../src/visualizations/valuecounts/ValueCountsData', async (importActual) => ({
  ...((await importActual()) as Record<string, unknown>),
  fetchValueCountsData: deferredFetch,
}));

import type { ColumnSchema } from '../../src/core/types';
import type {
  BaseVisualization,
  VisualizationOptions,
} from '../../src/visualizations/BaseVisualization';
import { DateHistogram } from '../../src/visualizations/histogram/DateHistogram';
import { Histogram } from '../../src/visualizations/histogram/Histogram';
import { IntervalHistogram } from '../../src/visualizations/histogram/IntervalHistogram';
import { TimeHistogram } from '../../src/visualizations/histogram/TimeHistogram';
import { ValueCounts } from '../../src/visualizations/valuecounts/ValueCounts';

type ChartClass = new (
  container: HTMLElement,
  column: ColumnSchema,
  options: VisualizationOptions,
) => BaseVisualization;

interface ChartCase {
  name: string;
  Chart: ChartClass;
  column: ColumnSchema;
  /** What the chart's fetcher returns for a column with no values and no nulls. */
  empty: unknown;
  /** What it returns for a column with values, drawn as bars. */
  values?: unknown;
}

const column = (type: ColumnSchema['type'], originalType: string): ColumnSchema => ({
  name: 'c',
  type,
  nullable: true,
  originalType,
});

// The fetchers' own empty results (see each `*Data.ts`).
const HISTOGRAMS: ChartCase[] = [
  {
    name: 'Histogram',
    Chart: Histogram,
    column: column('float', 'DOUBLE'),
    empty: {
      bins: [],
      nullCount: 0,
      min: NaN,
      max: NaN,
      total: 0,
      isSingleValue: false,
      isDiscrete: false,
      median: null,
      distinctCount: 0,
    },
    values: {
      bins: [
        { x0: 0, x1: 5, count: 3 },
        { x0: 5, x1: 10, count: 1 },
      ],
      nullCount: 0,
      min: 0,
      max: 10,
      total: 4,
      isSingleValue: false,
      isDiscrete: false,
      median: 4,
      distinctCount: 4,
    },
  },
  {
    name: 'DateHistogram',
    Chart: DateHistogram,
    column: column('date', 'DATE'),
    empty: {
      bins: [],
      nullCount: 0,
      min: null,
      max: null,
      total: 0,
      interval: 'day',
      isSingleValue: false,
      isNumericBinning: false,
    },
    values: {
      bins: [
        {
          binStart: new Date('2024-01-01T00:00:00Z'),
          binEnd: new Date('2024-01-16T00:00:00Z'),
          count: 3,
        },
        {
          binStart: new Date('2024-01-16T00:00:00Z'),
          binEnd: new Date('2024-01-31T00:00:00Z'),
          count: 1,
        },
      ],
      nullCount: 0,
      min: new Date('2024-01-01T00:00:00Z'),
      max: new Date('2024-01-31T00:00:00Z'),
      total: 4,
      interval: 'day',
      isSingleValue: false,
      isNumericBinning: true,
    },
  },
  {
    name: 'TimeHistogram',
    Chart: TimeHistogram,
    column: column('time', 'TIME'),
    empty: {
      bins: [],
      nullCount: 0,
      minSeconds: null,
      maxSeconds: null,
      total: 0,
      interval: 'hour',
      isSingleValue: false,
      isNumericBinning: false,
    },
    values: {
      bins: [
        { binStartSeconds: 0, binEndSeconds: 30, count: 3 },
        { binStartSeconds: 30, binEndSeconds: 60, count: 1 },
      ],
      nullCount: 0,
      minSeconds: 0,
      maxSeconds: 60,
      total: 4,
      interval: 'minute',
      isSingleValue: false,
      isNumericBinning: true,
    },
  },
  {
    name: 'IntervalHistogram',
    Chart: IntervalHistogram,
    column: column('interval', 'INTERVAL'),
    empty: {
      bins: [],
      nullCount: 0,
      minSeconds: null,
      maxSeconds: null,
      medianSeconds: null,
      total: 0,
      isSingleValue: false,
    },
    values: {
      bins: [
        { binStartSeconds: 0, binEndSeconds: 1800, count: 3 },
        { binStartSeconds: 1800, binEndSeconds: 3600, count: 1 },
      ],
      nullCount: 0,
      minSeconds: 0,
      maxSeconds: 3600,
      medianSeconds: 900,
      total: 4,
      isSingleValue: false,
    },
  },
];

const CHARTS: ChartCase[] = [
  ...HISTOGRAMS,
  {
    name: 'ValueCounts',
    Chart: ValueCounts,
    column: column('string', 'VARCHAR'),
    empty: { segments: [], nullCount: 0, distinctCount: 0, total: 0, isAllUnique: false },
  },
];

let container: HTMLElement;
let onError: ReturnType<typeof vi.fn>;

function create({ Chart, column }: ChartCase): BaseVisualization {
  return new Chart(container, column, {
    tableName: 't',
    bridge: { query: vi.fn() } as unknown as VisualizationOptions['bridge'],
    filters: [],
    onError,
  });
}

function drewNoData(): boolean {
  return mockContext.fillText.mock.calls.some(([text]) => text === 'No data');
}

beforeEach(() => {
  document.body.innerHTML = '';
  fetches.length = 0;
  resizeCallbacks.length = 0;
  onError = vi.fn();
  container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 120,
    height: 60,
    top: 0,
    left: 0,
    bottom: 60,
    right: 120,
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

describe.each(CHARTS)('$name before and after its data', (chartCase) => {
  it('draws nothing while its first fetch is in flight', () => {
    const chart = create(chartCase);
    expect(fetches).toHaveLength(1);

    reportLayout();

    // It rendered, and drew no "No data".
    expect(mockContext.clearRect).toHaveBeenCalled();
    expect(drewNoData()).toBe(false);
    chart.destroy();
  });

  it('draws "No data" once a fetch returns a column with no values', async () => {
    const chart = create(chartCase);
    reportLayout();

    fetches[0]!.resolve(chartCase.empty);
    await chart.waitForData();

    expect(drewNoData()).toBe(true);
    chart.destroy();
  });

  it('draws nothing after its fetch fails', async () => {
    const chart = create(chartCase);
    reportLayout();

    fetches[0]!.reject(new Error('Conversion Error'));
    await chart.waitForData();

    expect(onError).toHaveBeenCalledWith(expect.anything(), {
      columnName: 'c',
      stage: 'fetch',
    });
    reportLayout();
    expect(drewNoData()).toBe(false);
    chart.destroy();
  });
});

describe.each(HISTOGRAMS)('$name after a fetch fails', (chartCase) => {
  it('drops the bars it drew once a later fetch fails', async () => {
    const chart = create(chartCase);
    reportLayout();
    fetches[0]!.resolve(chartCase.values);
    await chart.waitForData();
    const layout = chart as unknown as { barPositions: unknown[] };
    expect(layout.barPositions.length).toBeGreaterThan(0);

    const refetch = chart.fetchData();
    fetches[1]!.reject(new Error('Conversion Error'));
    await refetch;

    // Nothing is drawn, so no bar is left for hit-testing to find.
    expect(layout.barPositions).toEqual([]);
    expect(drewNoData()).toBe(false);
    chart.destroy();
  });

  it('keeps no all-null state once a later fetch fails', async () => {
    const chart = create(chartCase);
    fetches[0]!.resolve({ ...(chartCase.empty as object), nullCount: 5, total: 5 });
    await chart.waitForData();
    const state = chart as unknown as { isAllNullState: boolean };
    expect(state.isAllNullState).toBe(true);

    const refetch = chart.fetchData();
    fetches[1]!.reject(new Error('Conversion Error'));
    await refetch;

    // With no data drawn, nothing on the canvas is the all-null bar.
    expect(state.isAllNullState).toBe(false);
    chart.destroy();
  });
});
