/**
 * @vitest-environment jsdom
 *
 * Phase 6 — BaseVisualization lifecycle contracts:
 *   - in-flight `fetchData` when `destroy()` is called must not call `render`
 *     (subclass guards via `this.destroyed` after `await`)
 *   - errors thrown from `fetchData` route to `options.onError` with
 *     `stage: 'fetch'`; the facade re-emits as `error` event with
 *     `source: 'visualization'` (locked separately in
 *     tests/DataTable.errorEvents.test.ts)
 *   - errors thrown during `updateFilters` route to `options.onError` with
 *     `stage: 'filter'`
 *   - `updateFilters` is a no-op after `destroy()`
 *   - re-entrancy: a consumer's `onError` handler that calls `destroy()`
 *     synchronously must not corrupt subsequent state
 *   - non-`DataTableError` rejections are wrapped in `QueryError` with
 *     `code: 'QUERY_RUNTIME'`
 *
 * @see src/visualizations/BaseVisualization.ts:116-126 (the JSDoc contract)
 * @see src/visualizations/BaseVisualization.ts:433-454 (updateFilters)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTableError, QueryError } from '@/core/errors';
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
 * Concrete probe whose `fetchData` resolves only when the supplied deferred
 * settles. After every `fetchData` await, the probe re-checks `destroyed`
 * before invoking `render` so we can assert the subclass-side stale-fetch
 * guard pattern.
 */
class ProbeViz extends BaseVisualization {
  public renderCount = 0;
  public fetchSequence = 0;
  public deferreds: Deferred<void>[] = [];
  public lastFetchSeq = 0;

  enqueue(): Deferred<void> {
    const d = defer<void>();
    this.deferreds.push(d);
    return d;
  }

  async fetchData(): Promise<void> {
    const seq = ++this.fetchSequence;
    this.lastFetchSeq = seq;
    const d = this.deferreds.shift();
    if (!d) return;
    try {
      await d.promise;
      // Mirror the subclass pattern from Histogram.fetchData: drop on stale
      // OR destroyed, route errors through options.onError, never call render
      // after destroy.
      if (seq !== this.fetchSequence || this.destroyed) return;
      this.render();
    } catch (error) {
      if (seq !== this.fetchSequence || this.destroyed) return;
      const typed =
        error instanceof DataTableError
          ? error
          : new QueryError(error instanceof Error ? error.message : String(error), {
              code: 'QUERY_RUNTIME',
              cause: error,
            });
      this.options.onError?.(typed, {
        columnName: this.column.name,
        stage: 'fetch',
      });
      this.render();
    }
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

const created: ProbeViz[] = [];

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

describe('BaseVisualization — in-flight destroy', () => {
  it('does not call render() when destroy() runs while fetchData is in flight', async () => {
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.fetchData();

    viz.destroy();
    expect(viz.isDestroyed()).toBe(true);

    d.resolve();
    await promise;

    expect(viz.renderCount).toBe(0);
  });

  it('does not call render() when destroy() runs while fetchData is rejecting', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.fetchData();

    viz.destroy();
    d.reject(new Error('boom'));
    await promise;

    expect(viz.renderCount).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('drops a stale fetchData when a newer fetchData supersedes it', async () => {
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);

    const d1 = viz.enqueue();
    const d2 = viz.enqueue();
    const p1 = viz.fetchData();
    const p2 = viz.fetchData();
    expect(viz.fetchSequence).toBe(2);

    d1.resolve();
    await p1;
    expect(viz.renderCount).toBe(0);

    d2.resolve();
    await p2;
    expect(viz.renderCount).toBe(1);
  });
});

describe('BaseVisualization — fetchData error routing', () => {
  it('routes a non-DataTableError rejection to options.onError with stage="fetch" and a wrapped QueryError', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.fetchData();

    d.reject(new Error('upstream failure'));
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [err, ctx] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(QueryError);
    expect((err as QueryError).code).toBe('QUERY_RUNTIME');
    expect((err as QueryError).message).toBe('upstream failure');
    expect((err as QueryError).cause).toBeInstanceOf(Error);
    expect(ctx).toEqual({ columnName: 'c', stage: 'fetch' });
  });

  it('passes through a typed DataTableError unchanged (preserves code and identity)', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const original = new QueryError('typed failure', { code: 'QUERY_TIMEOUT' });
    const d = viz.enqueue();
    const promise = viz.fetchData();

    d.reject(original);
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0]!;
    expect(err).toBe(original);
    expect((err as QueryError).code).toBe('QUERY_TIMEOUT');
  });

  it('coerces non-Error rejections (string) to QueryError with the string as message', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.fetchData();

    d.reject('plain-string-failure');
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(QueryError);
    expect((err as QueryError).message).toBe('plain-string-failure');
  });

  it('still calls render() after routing the error so the canvas paints an empty state', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.fetchData();

    d.reject(new Error('boom'));
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(viz.renderCount).toBe(1);
  });

  it('survives a re-entrant destroy() inside the consumer onError handler', async () => {
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions());
    const onError = vi.fn(() => {
      // Consumer chooses to tear down on first error. The probe sets
      // `destroyed = true` synchronously inside destroy(), but by that point
      // the catch block has already invoked render() once. Subsequent fetches
      // must drop without rendering.
      viz.destroy();
    });
    viz.options = { ...viz.options, onError };
    created.push(viz);
    const d1 = viz.enqueue();
    const d2 = viz.enqueue();
    const p1 = viz.fetchData();

    d1.reject(new Error('first'));
    await p1;
    expect(onError).toHaveBeenCalledTimes(1);
    // render() runs once in the catch (mirrors src subclasses' "paint empty
    // state on error" behavior), and after the synchronous destroy() inside
    // onError, the second fetch is a no-op.
    const renderAfterFirst = viz.renderCount;
    expect(viz.isDestroyed()).toBe(true);

    const p2 = viz.fetchData();
    d2.resolve();
    await p2;
    expect(viz.renderCount).toBe(renderAfterFirst);
  });
});

describe('BaseVisualization — updateFilters error routing', () => {
  /**
   * Re-throwing variant that intentionally lets `fetchData` rejections
   * propagate up to `BaseVisualization.updateFilters`'s outer catch. The
   * production subclasses (`Histogram`, `DateHistogram`, ..., `ValueCounts`)
   * always catch internally with `stage: 'fetch'`, so the `stage: 'filter'`
   * branch is reachable only for custom subclasses that opt out of the
   * inner catch. This probe locks that contract.
   */
  class RethrowingProbeViz extends BaseVisualization {
    public renderCount = 0;
    public deferreds: Deferred<void>[] = [];

    enqueue(): Deferred<void> {
      const d = defer<void>();
      this.deferreds.push(d);
      return d;
    }

    async fetchData(): Promise<void> {
      const d = this.deferreds.shift();
      if (!d) return;
      await d.promise;
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

  it('routes a fetchData rejection during updateFilters to options.onError with stage="filter" (custom subclass that re-throws)', async () => {
    const onError = vi.fn();
    const viz = new RethrowingProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz as unknown as ProbeViz);
    const d = viz.enqueue();
    const promise = viz.updateFilters([{ type: 'point', column: 'c', value: 1 } as Filter]);

    d.reject(new Error('filter failure'));
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [err, ctx] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(QueryError);
    expect((err as QueryError).code).toBe('QUERY_RUNTIME');
    expect(ctx).toEqual({ columnName: 'c', stage: 'filter' });
  });

  it('preserves a typed DataTableError thrown from fetchData when re-routed via updateFilters', async () => {
    const onError = vi.fn();
    const viz = new RethrowingProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz as unknown as ProbeViz);
    const original = new QueryError('typed', { code: 'QUERY_TIMEOUT' });
    const d = viz.enqueue();
    const promise = viz.updateFilters([] as Filter[]);

    d.reject(original);
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0]!;
    expect(err).toBe(original);
    expect((err as QueryError).code).toBe('QUERY_TIMEOUT');
  });

  it('production-style subclass catches internally so updateFilters reports stage="fetch"', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    const d = viz.enqueue();
    const promise = viz.updateFilters([{ type: 'point', column: 'c', value: 1 } as Filter]);

    d.reject(new Error('boom'));
    await promise;

    expect(onError).toHaveBeenCalledTimes(1);
    const [, ctx] = onError.mock.calls[0]!;
    // Subclass catches internally → stage 'fetch'. The base class's outer
    // catch with stage 'filter' is dead code for the bundled subclasses but
    // remains the contract for custom re-throwing subclasses.
    expect(ctx).toEqual({ columnName: 'c', stage: 'fetch' });
  });

  it('updateFilters() is a no-op after destroy() (no fetchData, no onError, no render)', async () => {
    const onError = vi.fn();
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions({ onError }));
    created.push(viz);
    viz.destroy();

    const before = viz.fetchSequence;
    await viz.updateFilters([{ type: 'point', column: 'c', value: 1 } as Filter]);

    expect(viz.fetchSequence).toBe(before);
    expect(onError).not.toHaveBeenCalled();
    expect(viz.renderCount).toBe(0);
  });

  it('refreshes options.filters even on success path (filter array reaches subclass via this.options)', async () => {
    const viz = new ProbeViz(mountContainer(), makeColumn(), makeOptions());
    created.push(viz);
    const filters: Filter[] = [{ type: 'point', column: 'c', value: 42 } as Filter];

    const d = viz.enqueue();
    const promise = viz.updateFilters(filters);
    d.resolve();
    await promise;

    expect(viz.options.filters).toEqual(filters);
  });
});
