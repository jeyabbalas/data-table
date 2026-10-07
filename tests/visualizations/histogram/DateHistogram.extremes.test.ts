/**
 * @vitest-environment jsdom
 *
 * A date histogram's brush over bars before year 1 and past 9999, and the
 * count of values it leaves out, on the chart itself (RT-18, bug C).
 *
 * The brush wrote its bounds with `toISOString()`, which gives a year past
 * 9999 a sign and six digits, `+012000-01-01T…`: DuckDB rejects that in
 * every query the filter is in. It now writes `12000-01-01T…`, which
 * `new Date()` does not read, so the brush drawn back from the filter reads
 * that form itself. The data is mocked; the DuckDB side is in
 * `DateHistogramData.extremes.duckdb.test.ts`.
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

const at = (iso: string): Date => new Date(iso);

/** Equal-width bars from 44 BC to the year 12000, as the numeric fallback gives them. */
function farData() {
  const edges = [
    '-000043-03-15T00:00:00.000Z',
    '2000-01-01T00:00:00.000Z',
    '6000-01-01T00:00:00.000Z',
    '+012000-01-01T00:00:00.000Z',
  ].map(at);
  return {
    bins: [0, 1, 2].map((i) => ({ binStart: edges[i]!, binEnd: edges[i + 1]!, count: 10 + i })),
    nullCount: 3,
    min: edges[0]!,
    max: edges[3]!,
    total: 38,
    interval: 'day',
    isSingleValue: false,
    isNumericBinning: true,
    nonFiniteCount: 2,
  };
}

const canned = { data: farData() as Record<string, unknown> };

vi.mock('../../../src/visualizations/histogram/DateHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchDateHistogramData: vi.fn(() => Promise.resolve(canned.data)),
    fetchDateNumericBins: vi.fn(() =>
      Promise.resolve(farData().bins.map((bin, i) => ({ ...bin, count: i }))),
    ),
    fetchDateHistogramBins: vi.fn(() => Promise.resolve([])),
    fetchDateStats: vi.fn(() =>
      Promise.resolve({ min: null, max: null, count: 4, nullCount: 1, nonFiniteCount: 1 }),
    ),
  };
});

import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { TemporalColumnStats } from '../../../src/statistics/ColumnStatsTypes';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';
import { DateHistogram } from '../../../src/visualizations/histogram/DateHistogram';
import {
  fetchDateNumericBins,
  fetchDateStats,
} from '../../../src/visualizations/histogram/DateHistogramData';

const COLUMN: ColumnSchema = { name: 'd', type: 'date', nullable: true, originalType: 'DATE' };
const NS_COLUMN: ColumnSchema = {
  name: 'd',
  type: 'timestamp',
  nullable: true,
  originalType: 'TIMESTAMP_NS',
};

/** Equal-width bars of a TIMESTAMP_NS column up to its last value, rounded up past it. */
function nsData() {
  const edges = [
    '2000-01-01T00:00:00.000Z',
    '2100-01-01T00:00:00.000Z',
    '2262-04-11T23:47:16.855Z',
  ].map(at);
  return {
    ...farData(),
    bins: [0, 1].map((i) => ({ binStart: edges[i]!, binEnd: edges[i + 1]!, count: 5 })),
    min: edges[0]!,
    max: edges[2]!,
    nonFiniteCount: 0,
  };
}

let container: HTMLElement;

beforeEach(() => {
  canned.data = farData();
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

interface ChartInternals {
  dataPromise: Promise<void>;
  brushState: { committed: boolean; startBinIndex: number; endBinIndex: number };
  selectedBin: number | null;
  emitBrushFilter: () => void;
}

async function mount(
  filters: Filter[] = [],
  extra: Partial<VisualizationOptions> = {},
  column: ColumnSchema = COLUMN,
): Promise<{ viz: DateHistogram; internals: ChartInternals }> {
  const viz = new DateHistogram(container, column, {
    tableName: 't',
    bridge: { query: vi.fn() } as unknown as VisualizationOptions['bridge'],
    filters,
    ...extra,
  });
  const internals = viz as unknown as ChartInternals;
  await internals.dataPromise;
  return { viz, internals };
}

/** The filter the brush emits over bars `start` to `end`. */
async function brushFilter(start: number, end: number, column = COLUMN): Promise<Filter> {
  const onFilterChange = vi.fn();
  const { viz, internals } = await mount([], { onFilterChange }, column);
  internals.brushState.startBinIndex = start;
  internals.brushState.endBinIndex = end;
  internals.emitBrushFilter();
  viz.destroy();
  expect(onFilterChange).toHaveBeenCalledTimes(1);
  return onFilterChange.mock.calls[0]![0] as Filter;
}

describe('DateHistogram — bars before year 1 and past 9999', () => {
  it('brushes the last bar, ending in the year 12000, as DuckDB reads it', async () => {
    expect(await brushFilter(2, 2)).toEqual({
      column: 'd',
      type: 'range',
      min: '6000-01-01T00:00:00.000Z',
      max: '12000-01-01T00:00:00.000Z',
      maxInclusive: true,
    });
  });

  it('brushes the first bar, from 44 BC, with its sign', async () => {
    expect(await brushFilter(0, 1)).toEqual({
      column: 'd',
      type: 'range',
      min: '-000043-03-15T00:00:00.000Z',
      max: '6000-01-01T00:00:00.000Z',
    });
  });

  it('draws the brush back from a filter past 9999 after the refetch', async () => {
    // As the brush writes it: `new Date('12000-01-01T…')` is Invalid Date.
    const { viz, internals } = await mount([
      {
        column: 'd',
        type: 'range',
        min: '6000-01-01T00:00:00.000Z',
        max: '12000-01-01T00:00:00.000Z',
        maxInclusive: true,
      },
    ]);

    expect(internals.brushState).toMatchObject({
      committed: true,
      startBinIndex: 2,
      endBinIndex: 2,
    });
    viz.destroy();
  });

  it('draws the brush back from a filter before year 1', async () => {
    const filter = await brushFilter(0, 1);
    const { viz, internals } = await mount([filter]);

    expect(internals.brushState).toMatchObject({
      committed: true,
      startBinIndex: 0,
      endBinIndex: 1,
    });
    viz.destroy();
  });

  it('selects the bar of a point filter past 9999', async () => {
    const { viz, internals } = await mount([
      { type: 'point', column: 'd', value: '11000-06-01T00:00:00.000Z' },
    ]);

    expect(internals.selectedBin).toBe(2);
    viz.destroy();
  });

  it('draws the brush back from DuckDB’s text for a date before year 1', async () => {
    // `new Date()` reads none of these: year 44 BC is year -43.
    for (const [min, max] of [
      ['0044-03-15 (BC)', '0001-01-01 (BC)'],
      ['0044-03-15 (BC) 10:00:00', '0010-06-01 (BC) 23:59:59.5'],
      ['0044-03-15 (BC) 10:00:00+05:30', '0001-12-31 (BC) 00:00:00+00'],
    ]) {
      const { viz, internals } = await mount([{ column: 'd', type: 'range', min, max }]);

      expect(internals.brushState, `${min} to ${max}`).toMatchObject({
        committed: true,
        startBinIndex: 0,
        endBinIndex: 0,
      });
      viz.destroy();
    }
  });

  it('selects the bar of a point filter in DuckDB’s text before year 1', async () => {
    const { viz, internals } = await mount([
      { type: 'point', column: 'd', value: '0044-03-15 (BC) 12:30:00+00' },
    ]);

    expect(internals.selectedBin).toBe(0);
    viz.destroy();
  });

  it('keeps a TIMESTAMP_NS brush inside the type, and draws it back', async () => {
    // The last bar ends a rounded-up millisecond past the type's last value:
    // `<= '…16.855Z'` would fail every query with a Conversion Error.
    canned.data = nsData();
    const filter = await brushFilter(1, 1, NS_COLUMN);
    expect(filter).toEqual({
      column: 'd',
      type: 'range',
      min: '2100-01-01T00:00:00.000Z',
      max: '2262-04-11T23:47:16.854775806Z',
      maxInclusive: true,
    });

    const { viz, internals } = await mount([filter], {}, NS_COLUMN);
    expect(internals.brushState).toMatchObject({
      committed: true,
      startBinIndex: 1,
      endBinIndex: 1,
    });
    viz.destroy();
  });
});

describe('DateHistogram — the foreground fetches know what the unfiltered fetch found', () => {
  it.each([
    ['holds values left out', 2, false],
    ['holds only values the chart draws', 0, true],
    ['does not say', undefined, undefined],
  ] as const)('a column that %s', async (_label, nonFiniteCount, allChartable) => {
    const { nonFiniteCount: _omitted, ...data } = farData();
    canned.data = nonFiniteCount === undefined ? data : { ...data, nonFiniteCount };
    const { viz } = await mount([{ type: 'range', column: 'other', min: 0, max: 5 }]);

    // fetchDateNumericBins(…, filters, bridge, allChartable), fetchDateStats(…, bridge, allChartable)
    expect(vi.mocked(fetchDateNumericBins).mock.calls[0]![7]).toBe(allChartable);
    expect(vi.mocked(fetchDateStats).mock.calls[0]![4]).toBe(allChartable);
    viz.destroy();
  });
});

describe('DateHistogram — default stats: the non-finite count', () => {
  const lastStats = (spy: ReturnType<typeof vi.fn>): TemporalColumnStats =>
    spy.mock.calls[spy.mock.calls.length - 1]![0] as TemporalColumnStats;

  it('reports the count the data carries, and the years as toISOString writes them', async () => {
    const onDefaultStatsChange = vi.fn();
    const { viz } = await mount([], { onDefaultStatsChange });

    expect(lastStats(onDefaultStatsChange)).toEqual({
      kind: 'temporal',
      totalRows: 38,
      nonNullCount: 35,
      nullCount: 3,
      filteredTotalRows: null,
      min: '-000043-03-15T00:00:00.000Z',
      max: '+012000-01-01T00:00:00.000Z',
      nonFiniteCount: 2,
    });
    viz.destroy();
  });

  it('reports 0 for data that carries none', async () => {
    const { nonFiniteCount: _omitted, ...withoutCount } = farData();
    canned.data = withoutCount;
    const onDefaultStatsChange = vi.fn();
    const { viz } = await mount([], { onDefaultStatsChange });

    expect(lastStats(onDefaultStatsChange).nonFiniteCount).toBe(0);
    viz.destroy();
  });

  it('counts the rows passing another column’s filter', async () => {
    const onDefaultStatsChange = vi.fn();
    const { viz } = await mount([{ type: 'range', column: 'other', min: 0, max: 5 }], {
      onDefaultStatsChange,
    });

    expect(lastStats(onDefaultStatsChange)).toMatchObject({
      totalRows: 38,
      filteredTotalRows: 5,
      nonFiniteCount: 1,
    });
    viz.destroy();
  });
});
