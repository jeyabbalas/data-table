/**
 * @vitest-environment jsdom
 *
 * `fetchSequence` stale-result guard for the no-filter Branch B in each
 * histogram subclass: `Histogram`, `DateHistogram`, `TimeHistogram`,
 * `IntervalHistogram`. Mirrors the test shape in
 * `tests/visualizations/valuecounts/ValueCounts.staleGuard.test.ts`.
 *
 * Each subclass's `fetchData` branch B does:
 *   const fetched = await fetchXxxHistogramData(...);
 *   if (seq !== this.fetchSequence || this.destroyed) return;
 *   this.data = fetched;
 *
 * The two contracts locked here:
 *   1) Older fetch superseded by newer: stale value never reaches `this.data`.
 *   2) Destroy mid-flight: late-resolved value never reaches `this.data`.
 *
 * @see src/visualizations/histogram/Histogram.ts:243-253
 * @see src/visualizations/histogram/DateHistogram.ts:186-198
 * @see src/visualizations/histogram/TimeHistogram.ts:186-198
 * @see src/visualizations/histogram/IntervalHistogram.ts:152-164
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (r: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (r: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// One deferred queue per subclass. The mock factories below push deferreds
// onto these arrays each time the corresponding fetcher is invoked so tests
// can resolve them in any order to drive the race.
const fetchHistogramDataDeferreds: Deferred<unknown>[] = [];
const fetchDateHistogramDataDeferreds: Deferred<unknown>[] = [];
const fetchTimeHistogramDataDeferreds: Deferred<unknown>[] = [];
const fetchIntervalHistogramDataDeferreds: Deferred<unknown>[] = [];

vi.mock('../../../src/visualizations/histogram/HistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchHistogramData: vi.fn(() => {
      const d = defer<unknown>();
      fetchHistogramDataDeferreds.push(d);
      return d.promise;
    }),
  };
});

vi.mock('../../../src/visualizations/histogram/DateHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchDateHistogramData: vi.fn(() => {
      const d = defer<unknown>();
      fetchDateHistogramDataDeferreds.push(d);
      return d.promise;
    }),
  };
});

vi.mock('../../../src/visualizations/histogram/TimeHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchTimeHistogramData: vi.fn(() => {
      const d = defer<unknown>();
      fetchTimeHistogramDataDeferreds.push(d);
      return d.promise;
    }),
  };
});

vi.mock('../../../src/visualizations/histogram/IntervalHistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    fetchIntervalHistogramData: vi.fn(() => {
      const d = defer<unknown>();
      fetchIntervalHistogramDataDeferreds.push(d);
      return d.promise;
    }),
  };
});

import { Histogram } from '../../../src/visualizations/histogram/Histogram';
import { DateHistogram } from '../../../src/visualizations/histogram/DateHistogram';
import { TimeHistogram } from '../../../src/visualizations/histogram/TimeHistogram';
import { IntervalHistogram } from '../../../src/visualizations/histogram/IntervalHistogram';
import type { ColumnSchema } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn() } as unknown as VisualizationOptions['bridge'];
}

function makeColumn(type: ColumnSchema['type'], originalType: string): ColumnSchema {
  return { name: 'c', type, nullable: true, originalType };
}

// Sentinel: each fetch result carries a unique `total` so we can identify
// which payload landed in `this.data`. Bin/min/max kept structurally valid
// so `render()` doesn't trip on undefined fields.
function makeHistogramData(sentinel: number): unknown {
  return {
    bins: [{ x0: 0, x1: 10, count: 1 }],
    nullCount: 0,
    min: 0,
    max: 10,
    total: sentinel,
    isSingleValue: false,
    isDiscrete: false,
    median: 5,
    distinctCount: 1,
  };
}

function makeDateHistogramData(sentinel: number): unknown {
  const min = new Date('2024-01-01T00:00:00Z');
  const max = new Date('2024-01-31T00:00:00Z');
  return {
    bins: [{ binStart: min, binEnd: max, count: 1 }],
    nullCount: 0,
    min,
    max,
    total: sentinel,
    interval: 'day',
    isSingleValue: false,
    isNumericBinning: true,
  };
}

function makeTimeHistogramData(sentinel: number): unknown {
  return {
    bins: [{ binStart: 0, binEnd: 60, count: 1 }],
    nullCount: 0,
    min: 0,
    max: 60,
    total: sentinel,
    interval: 'minute',
    isSingleValue: false,
    isNumericBinning: true,
  };
}

function makeIntervalHistogramData(sentinel: number): unknown {
  return {
    bins: [{ binStart: 0, binEnd: 3600, count: 1 }],
    nullCount: 0,
    min: 0,
    max: 3600,
    total: sentinel,
    isSingleValue: false,
    isNumericBinning: true,
  };
}

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  fetchHistogramDataDeferreds.length = 0;
  fetchDateHistogramDataDeferreds.length = 0;
  fetchTimeHistogramDataDeferreds.length = 0;
  fetchIntervalHistogramDataDeferreds.length = 0;
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

// =========================================
// Histogram (numeric)
// =========================================

describe('Histogram — fetchSequence stale-result guard (no-filter branch)', () => {
  async function constructAndAwaitInitial(initSentinel: number): Promise<Histogram> {
    const viz = new Histogram(container, makeColumn('integer', 'INTEGER'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    fetchHistogramDataDeferreds[0]!.resolve(makeHistogramData(initSentinel));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
    return viz;
  }

  it('drops the older fetch when a newer fetch supersedes it', async () => {
    const viz = await constructAndAwaitInitial(1);

    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    // Constructor consumed deferred[0]; the next two fill [1] and [2].
    expect(fetchHistogramDataDeferreds.length).toBe(3);

    const clearsBeforeStale = mockContext.clearRect.mock.calls.length;

    // Resolve OLDER (seq=2) first → guard sees fetchSequence=3 and bails
    // BEFORE assigning `this.data`. With the local-then-guard-then-assign
    // pattern, the stale value never reaches the field.
    fetchHistogramDataDeferreds[1]!.resolve(makeHistogramData(2));
    await p1;
    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBeforeStale);
    const dataAfterStale = (viz as unknown as { data: { total: number } | null }).data;
    expect(dataAfterStale?.total).toBe(1);

    // Resolve NEWER (seq=3) → guard passes, this.data carries fresh sentinel.
    fetchHistogramDataDeferreds[2]!.resolve(makeHistogramData(3));
    await p2;
    expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(clearsBeforeStale);
    const dataAfterFresh = (viz as unknown as { data: { total: number } }).data;
    expect(dataAfterFresh.total).toBe(3);

    viz.destroy();
  });

  it('destroy() during in-flight fetchData: this.data stays null', async () => {
    const viz = new Histogram(container, makeColumn('integer', 'INTEGER'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    expect(fetchHistogramDataDeferreds.length).toBe(1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);
    const clearsBefore = mockContext.clearRect.mock.calls.length;

    fetchHistogramDataDeferreds[0]!.resolve(makeHistogramData(99));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;

    // Post-await guard returns before assigning this.data and before render.
    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBefore);
    expect((viz as unknown as { data: unknown }).data).toBeNull();
  });
});

// =========================================
// DateHistogram
// =========================================

describe('DateHistogram — fetchSequence stale-result guard (no-filter branch)', () => {
  async function constructAndAwaitInitial(initSentinel: number): Promise<DateHistogram> {
    const viz = new DateHistogram(container, makeColumn('date', 'DATE'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    fetchDateHistogramDataDeferreds[0]!.resolve(makeDateHistogramData(initSentinel));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
    return viz;
  }

  it('drops the older fetch when a newer fetch supersedes it', async () => {
    const viz = await constructAndAwaitInitial(1);

    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    expect(fetchDateHistogramDataDeferreds.length).toBe(3);

    const clearsBeforeStale = mockContext.clearRect.mock.calls.length;

    fetchDateHistogramDataDeferreds[1]!.resolve(makeDateHistogramData(2));
    await p1;
    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBeforeStale);
    const dataAfterStale = (viz as unknown as { data: { total: number } | null }).data;
    expect(dataAfterStale?.total).toBe(1);

    fetchDateHistogramDataDeferreds[2]!.resolve(makeDateHistogramData(3));
    await p2;
    expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(clearsBeforeStale);
    const dataAfterFresh = (viz as unknown as { data: { total: number } }).data;
    expect(dataAfterFresh.total).toBe(3);

    viz.destroy();
  });

  it('destroy() during in-flight fetchData: this.data stays null', async () => {
    const viz = new DateHistogram(container, makeColumn('date', 'DATE'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    expect(fetchDateHistogramDataDeferreds.length).toBe(1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);
    const clearsBefore = mockContext.clearRect.mock.calls.length;

    fetchDateHistogramDataDeferreds[0]!.resolve(makeDateHistogramData(99));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;

    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBefore);
    expect((viz as unknown as { data: unknown }).data).toBeNull();
  });
});

// =========================================
// TimeHistogram
// =========================================

describe('TimeHistogram — fetchSequence stale-result guard (no-filter branch)', () => {
  async function constructAndAwaitInitial(initSentinel: number): Promise<TimeHistogram> {
    const viz = new TimeHistogram(container, makeColumn('time', 'TIME'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    fetchTimeHistogramDataDeferreds[0]!.resolve(makeTimeHistogramData(initSentinel));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
    return viz;
  }

  it('drops the older fetch when a newer fetch supersedes it', async () => {
    const viz = await constructAndAwaitInitial(1);

    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    expect(fetchTimeHistogramDataDeferreds.length).toBe(3);

    const clearsBeforeStale = mockContext.clearRect.mock.calls.length;

    fetchTimeHistogramDataDeferreds[1]!.resolve(makeTimeHistogramData(2));
    await p1;
    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBeforeStale);
    const dataAfterStale = (viz as unknown as { data: { total: number } | null }).data;
    expect(dataAfterStale?.total).toBe(1);

    fetchTimeHistogramDataDeferreds[2]!.resolve(makeTimeHistogramData(3));
    await p2;
    expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(clearsBeforeStale);
    const dataAfterFresh = (viz as unknown as { data: { total: number } }).data;
    expect(dataAfterFresh.total).toBe(3);

    viz.destroy();
  });

  it('destroy() during in-flight fetchData: this.data stays null', async () => {
    const viz = new TimeHistogram(container, makeColumn('time', 'TIME'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    expect(fetchTimeHistogramDataDeferreds.length).toBe(1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);
    const clearsBefore = mockContext.clearRect.mock.calls.length;

    fetchTimeHistogramDataDeferreds[0]!.resolve(makeTimeHistogramData(99));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;

    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBefore);
    expect((viz as unknown as { data: unknown }).data).toBeNull();
  });
});

// =========================================
// IntervalHistogram
// =========================================

describe('IntervalHistogram — fetchSequence stale-result guard (no-filter branch)', () => {
  async function constructAndAwaitInitial(initSentinel: number): Promise<IntervalHistogram> {
    const viz = new IntervalHistogram(container, makeColumn('interval', 'INTERVAL'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    fetchIntervalHistogramDataDeferreds[0]!.resolve(makeIntervalHistogramData(initSentinel));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
    return viz;
  }

  it('drops the older fetch when a newer fetch supersedes it', async () => {
    const viz = await constructAndAwaitInitial(1);

    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    expect(fetchIntervalHistogramDataDeferreds.length).toBe(3);

    const clearsBeforeStale = mockContext.clearRect.mock.calls.length;

    fetchIntervalHistogramDataDeferreds[1]!.resolve(makeIntervalHistogramData(2));
    await p1;
    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBeforeStale);
    const dataAfterStale = (viz as unknown as { data: { total: number } | null }).data;
    expect(dataAfterStale?.total).toBe(1);

    fetchIntervalHistogramDataDeferreds[2]!.resolve(makeIntervalHistogramData(3));
    await p2;
    expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(clearsBeforeStale);
    const dataAfterFresh = (viz as unknown as { data: { total: number } }).data;
    expect(dataAfterFresh.total).toBe(3);

    viz.destroy();
  });

  it('destroy() during in-flight fetchData: this.data stays null', async () => {
    const viz = new IntervalHistogram(container, makeColumn('interval', 'INTERVAL'), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    expect(fetchIntervalHistogramDataDeferreds.length).toBe(1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);
    const clearsBefore = mockContext.clearRect.mock.calls.length;

    fetchIntervalHistogramDataDeferreds[0]!.resolve(makeIntervalHistogramData(99));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;

    expect(mockContext.clearRect.mock.calls.length).toBe(clearsBefore);
    expect((viz as unknown as { data: unknown }).data).toBeNull();
  });
});
