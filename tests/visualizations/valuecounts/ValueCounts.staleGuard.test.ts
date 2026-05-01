/**
 * @vitest-environment jsdom
 *
 * Phase 6 — `ValueCounts.fetchData()` `fetchSequence` stale-result guard.
 *
 * Two filter changes arriving in quick succession schedule two `fetchData()`
 * calls. The latter increments `this.fetchSequence`; the former checks
 * `seq !== this.fetchSequence` after every await and bails before mutating
 * `this.data` / `this.backgroundData` or calling `render()`. Without the
 * guard, the slower (older) query's result would overwrite the faster
 * (newer) one and the histogram would briefly snap back to the stale state.
 *
 * The guard sites we want to lock are `src/visualizations/valuecounts/
 * ValueCounts.ts:246, 270, 284`.
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

const fetchValueCountsDataDeferreds: Deferred<unknown>[] = [];
const fetchAlignedValueCountsDataDeferreds: Deferred<unknown>[] = [];

vi.mock('../../../src/visualizations/valuecounts/ValueCountsData', () => ({
  fetchValueCountsData: vi.fn(() => {
    const d = defer<unknown>();
    fetchValueCountsDataDeferreds.push(d);
    return d.promise;
  }),
  fetchAlignedValueCountsData: vi.fn(() => {
    const d = defer<unknown>();
    fetchAlignedValueCountsDataDeferreds.push(d);
    return d.promise;
  }),
}));

import { ValueCounts } from '../../../src/visualizations/valuecounts/ValueCounts';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

function makeColumn(): ColumnSchema {
  return { name: 'country', type: 'string', nullable: true, originalType: 'VARCHAR' };
}

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn() } as unknown as VisualizationOptions['bridge'];
}

function makeData(label: string): {
  segments: { value: string; count: number; isOther: boolean }[];
  total: number;
  nullCount: number;
  distinctCount: number;
} {
  return {
    segments: [{ value: label, count: 10, isOther: false }],
    total: 10,
    nullCount: 0,
    distinctCount: 1,
  };
}

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  fetchValueCountsDataDeferreds.length = 0;
  fetchAlignedValueCountsDataDeferreds.length = 0;
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

async function constructAndAwaitInitial(
  initialLabel: string,
  filters: Filter[] = [],
): Promise<ValueCounts> {
  const viz = new ValueCounts(container, makeColumn(), {
    tableName: 't',
    bridge: makeBridge(),
    filters,
  });
  // Constructor auto-fires fetchData; resolve the deferred it queued.
  fetchValueCountsDataDeferreds[0]!.resolve(makeData(initialLabel));
  await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;
  return viz;
}

describe('ValueCounts — fetchSequence stale-result guard', () => {
  it('drops the older fetch when a newer fetch supersedes it (fetchSequence increments)', async () => {
    const viz = await constructAndAwaitInitial('INIT');

    // Two manual fetchData calls back-to-back. Both follow the unfiltered
    // `fetchValueCountsData` branch since options.filters === [].
    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    // Constructor already drained deferred[0]; the next two fill [1] and [2].
    expect(fetchValueCountsDataDeferreds.length).toBe(3);

    // Sentinel: render() invokes ctx.clearRect at the top. Count delta tells
    // us whether the stale fetch's branch reached render(). With the
    // local-then-guard-then-assign pattern, a stale fetch lands its result
    // in a local var, the seq guard sees a newer fetchSequence and bails
    // before assigning `this.data` or calling render().
    const clearsBeforeStale = mockContext.clearRect.mock.calls.length;

    fetchValueCountsDataDeferreds[1]!.resolve(makeData('STALE'));
    await p1;
    const clearsAfterStale = mockContext.clearRect.mock.calls.length;
    expect(clearsAfterStale).toBe(clearsBeforeStale);
    // The post-await guard runs *before* `this.data = fetched`, so the stale
    // value never reaches the field.
    const dataAfterStale = (
      viz as unknown as { data: { segments: { value: string }[] } | null }
    ).data;
    expect(dataAfterStale?.segments[0]?.value).not.toBe('STALE');

    // Resolve the NEWER → wins; render() runs again.
    fetchValueCountsDataDeferreds[2]!.resolve(makeData('FRESH'));
    await p2;
    const clearsAfterFresh = mockContext.clearRect.mock.calls.length;
    expect(clearsAfterFresh).toBeGreaterThan(clearsAfterStale);
    const data = (viz as unknown as { data: { segments: { value: string }[] } }).data;
    expect(data.segments[0]!.value).toBe('FRESH');

    viz.destroy();
  });

  it('rapid updateFilters(F1) → updateFilters(F2): only F2 paint reaches `data`', async () => {
    const viz = await constructAndAwaitInitial('INIT');

    const F1: Filter[] = [{ type: 'point', column: 'country', value: 'US' } as Filter];
    const F2: Filter[] = [{ type: 'point', column: 'country', value: 'CA' } as Filter];

    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);
    // updateFilters() with hasAnyFilter goes through fetchAlignedValueCountsData
    // because initialCategoryOrder is already cached from the constructor.
    expect(fetchAlignedValueCountsDataDeferreds.length).toBe(2);

    // Older resolves first → should bail at the seq check after the await.
    fetchAlignedValueCountsDataDeferreds[0]!.resolve(makeData('F1_RESULT'));
    await u1;
    fetchAlignedValueCountsDataDeferreds[1]!.resolve(makeData('F2_RESULT'));
    await u2;

    const data = (viz as unknown as { data: { segments: { value: string }[] } }).data;
    expect(data.segments[0]!.value).toBe('F2_RESULT');
    expect((viz as unknown as { options: { filters: Filter[] } }).options.filters).toEqual(F2);

    viz.destroy();
  });

  it('destroy() during in-flight fetchData: post-await guard returns before caching/render', async () => {
    // Construct without resolving the constructor's auto-fetch.
    const viz = new ValueCounts(container, makeColumn(), {
      tableName: 't',
      bridge: makeBridge(),
      filters: [],
    });
    expect(fetchValueCountsDataDeferreds.length).toBe(1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);
    const renderClearsBefore = mockContext.clearRect.mock.calls.length;

    // Resolve the in-flight fetch AFTER destroy.
    fetchValueCountsDataDeferreds[0]!.resolve(makeData('LATE'));
    await (viz as unknown as { dataPromise: Promise<void> }).dataPromise;

    // The post-await guard (`seq !== fetchSequence || destroyed`) returns
    // before assigning `this.data`, before caching `initialCategoryOrder`,
    // and before invoking `render()`. With the local-then-guard-then-assign
    // pattern, the late-resolved value is never written to `this.data`.
    const renderClearsAfter = mockContext.clearRect.mock.calls.length;
    expect(renderClearsAfter).toBe(renderClearsBefore);
    const initialCategoryOrder = (viz as unknown as { initialCategoryOrder: string[] | null })
      .initialCategoryOrder;
    expect(initialCategoryOrder).toBeNull();
    expect((viz as unknown as { data: unknown }).data).toBeNull();
  });
});
