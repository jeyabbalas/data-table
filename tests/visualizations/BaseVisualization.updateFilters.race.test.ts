/**
 * @vitest-environment jsdom
 *
 * `BaseVisualization.updateFilters` shared-flag race fix.
 *
 * Without the sequence-guarded `finally`, two overlapping `updateFilters`
 * calls expose a bug: the older call's `finally` flips `isFilterUpdate = false`
 * while the newer call is still mid-await. Subclasses' post-await checks
 * (the `if (this.isFilterUpdate || hasAnyFilter)` gate in
 * `Histogram`/`DateHistogram`/`TimeHistogram`/`IntervalHistogram` and the
 * `pendingFilterSync = this.isFilterUpdate || ...` line in `ValueCounts`)
 * then read a stale `false`, skipping `syncVisualStateFromFilter` when the
 * newer filter has cleared the brush/selection — leaving the visualization
 * showing the older committed state with no underlying filter.
 *
 * The fix tags each `updateFilters` call with a `filterUpdateSequence` token;
 * only the latest call's `finally` resets the flag. Mirrors `fetchSequence`
 * in subclasses and `filterSequence` in `CrossfilterCoordinator`.
 *
 * @see src/visualizations/BaseVisualization.ts:439-467
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnSchema, Filter } from '@/core/types';
import { BaseVisualization } from '@/visualizations/BaseVisualization';
import type { VisualizationOptions } from '@/visualizations/BaseVisualization';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(global as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Probe subclass that mirrors the subclass `fetchData` shape from production
 * (`Histogram`, `ValueCounts`): records `this.isFilterUpdate` at the
 * synchronous top AND immediately after the await, so we can directly assert
 * the invariant the fix establishes — the flag stays `true` for the entire
 * duration any `updateFilters` is in flight, regardless of overlap.
 */
class FlagProbeViz extends BaseVisualization {
  public renderCount = 0;
  public deferreds: Deferred<void>[] = [];
  public flagAtSyncTop: boolean[] = [];
  public flagPostAwait: boolean[] = [];

  enqueue(): Deferred<void> {
    const d = defer<void>();
    this.deferreds.push(d);
    return d;
  }

  async fetchData(): Promise<void> {
    this.flagAtSyncTop.push(this.isFilterUpdate);
    const d = this.deferreds.shift();
    if (!d) return;
    await d.promise;
    if (this.destroyed) return;
    this.flagPostAwait.push(this.isFilterUpdate);
  }

  render(): void {
    this.renderCount += 1;
  }
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

/**
 * Probe variant that re-throws from `fetchData` so the outer `updateFilters`
 * `try/catch` handles the error. Used to verify the `finally`-guard holds
 * even on the error path.
 */
class RethrowingFlagProbeViz extends BaseVisualization {
  public deferreds: Deferred<void>[] = [];
  public flagPostAwait: boolean[] = [];

  enqueue(): Deferred<void> {
    const d = defer<void>();
    this.deferreds.push(d);
    return d;
  }

  async fetchData(): Promise<void> {
    const d = this.deferreds.shift();
    if (!d) return;
    try {
      await d.promise;
      this.flagPostAwait.push(this.isFilterUpdate);
    } catch (err) {
      this.flagPostAwait.push(this.isFilterUpdate);
      throw err;
    }
  }

  render(): void {}
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

function mountContainer(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'dt-root';
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 80,
    height: 32,
    top: 0,
    left: 0,
    bottom: 32,
    right: 80,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  root.appendChild(container);
  document.body.appendChild(root);
  return container;
}

function makeColumn(): ColumnSchema {
  return { name: 'c', type: 'integer', nullable: false, originalType: 'INTEGER' };
}

function makeOptions(overrides: Partial<VisualizationOptions> = {}): VisualizationOptions {
  return {
    tableName: 't',
    bridge: {} as VisualizationOptions['bridge'],
    filters: [] as Filter[],
    ...overrides,
  };
}

const F1: Filter[] = [{ type: 'point', column: 'c', value: 1 } as Filter];
const F2: Filter[] = [{ type: 'point', column: 'c', value: 2 } as Filter];
const EMPTY: Filter[] = [];

const created: BaseVisualization[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  created.length = 0;
});

afterEach(() => {
  for (const v of created) v.destroy();
  created.length = 0;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('BaseVisualization.updateFilters — shared-flag race', () => {
  it('flag stays true while a newer updateFilters is mid-await (older finally must not reset)', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();

    // Two overlapping updateFilters calls. Both bump filterUpdateSequence;
    // both set isFilterUpdate = true synchronously before awaiting fetchData.
    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);

    // Resolve OLDER first. F1's finally runs, but with the fix its `seq`
    // doesn't match `filterUpdateSequence` (now 2), so it must NOT touch
    // `isFilterUpdate`. The flag must remain true so F2's post-await read
    // sees the correct value.
    d1.resolve();
    await u1;

    // F2 is still pending — flag must still be `true`.
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(true);

    // Resolve F2; its post-await read records what the gate condition would
    // observe in real subclasses (`if (this.isFilterUpdate || hasAnyFilter)`).
    d2.resolve();
    await u2;

    // F1 awaited at index 0; F2 awaited at index 1. F2's post-await read must
    // see isFilterUpdate = true — the invariant the fix locks in.
    expect(viz.flagPostAwait).toHaveLength(2);
    expect(viz.flagPostAwait[1]).toBe(true);

    // Both calls have settled — flag is reset by F2's finally.
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(false);
  });

  it('synchronous top of fetchData reads true for both calls (overlapping window)', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();

    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);

    // Both fetchData calls run their synchronous top BEFORE either await
    // resolves. Both must see isFilterUpdate = true (the brush-reset branch
    // in subclasses depends on this).
    expect(viz.flagAtSyncTop).toEqual([true, true]);

    d1.resolve();
    d2.resolve();
    await Promise.all([u1, u2]);
  });

  it('sequential (non-overlapping) updateFilters cycle the flag back to false between calls', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const u1 = viz.updateFilters(F1);
    d1.resolve();
    await u1;
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(false);

    const d2 = viz.enqueue();
    const u2 = viz.updateFilters(F2);
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(true);
    d2.resolve();
    await u2;
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(false);
  });

  it('three overlapping calls: only the latest finally resets the flag', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();
    const d3 = viz.enqueue();

    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);
    const u3 = viz.updateFilters(EMPTY);

    // Resolve in arbitrary order — the fix doesn't depend on resolution
    // order, only on the seq match in finally.
    d2.resolve();
    await u2;
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(true);

    d1.resolve();
    await u1;
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(true);

    d3.resolve();
    await u3;
    // Only u3 (the latest, seq=3) resets the flag.
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(false);
  });

  it('older call rejecting mid-overlap does not flip the flag for the newer call', async () => {
    const onError = vi.fn();
    const viz = new RethrowingFlagProbeViz(
      mountContainer(),
      makeColumn(),
      makeOptions({ onError }),
    );
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();

    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);

    // F1 errors. Its catch runs (routing to onError with stage='filter'),
    // then its finally runs — and must NOT clear the flag because seq is
    // stale.
    d1.reject(new Error('upstream filter failure'));
    await u1;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1]).toEqual({ columnName: 'c', stage: 'filter' });

    // F2 is still pending — flag must remain true.
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(true);

    d2.resolve();
    await u2;

    // F2's post-await read saw the correct `true`.
    expect(viz.flagPostAwait).toContain(true);
    expect((viz as unknown as { isFilterUpdate: boolean }).isFilterUpdate).toBe(false);
  });

  it('destroy mid-overlap: subsequent updateFilters is a no-op (existing contract preserved)', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const u1 = viz.updateFilters(F1);

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);

    // updateFilters after destroy is a no-op (line 440 early return).
    const seqBefore = (viz as unknown as { filterUpdateSequence: number }).filterUpdateSequence;
    await viz.updateFilters(F2);
    const seqAfter = (viz as unknown as { filterUpdateSequence: number }).filterUpdateSequence;
    expect(seqAfter).toBe(seqBefore);

    // Resolve the in-flight u1 — the `if (this.destroyed) return` guard at
    // post-await prevents flagPostAwait from being recorded.
    d1.resolve();
    await u1;

    expect(viz.flagPostAwait).toHaveLength(0);
  });

  it('options.filters reflects the LATEST call after both overlapping calls settle', async () => {
    const viz = new FlagProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();

    const u1 = viz.updateFilters(F1);
    const u2 = viz.updateFilters(F2);

    d1.resolve();
    d2.resolve();
    await Promise.all([u1, u2]);

    // The `this.options = { ...this.options, filters }` mutation is
    // last-writer-wins; F2 was set after F1 and is the final value.
    expect(viz.options.filters).toEqual(F2);
  });
});
