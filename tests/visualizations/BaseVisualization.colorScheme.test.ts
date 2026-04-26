/**
 * @vitest-environment jsdom
 *
 * Phase 7 follow-up: visualizations must re-render when the owning
 * `.dt-root`'s `data-dt-color-scheme` attribute flips. Palette values
 * (brush overlay rgba, selection indicators, bar fills) are resolved
 * inside `render()` via `getComputedStyle`, so a fresh render is all
 * that's needed to pick up new theme values after a toggle.
 *
 * A MutationObserver attached to the nearest `.dt-root` drives that
 * re-render. On `destroy()` the observer is disconnected so stray
 * mutations after teardown do not call into a destroyed canvas.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseVisualization } from '@/visualizations/BaseVisualization';
import type { VisualizationOptions } from '@/visualizations/BaseVisualization';
import type { ColumnSchema } from '@/core/types';

// jsdom ships no ResizeObserver.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(global as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// jsdom's 2D context mock is minimal; provide enough for BaseVisualization.
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

/**
 * Concrete probe: counts render calls and exposes abstract hooks as no-ops.
 * We only need to observe whether `render()` runs after a mutation.
 */
class RenderProbe extends BaseVisualization {
  public renderCount = 0;
  async fetchData(): Promise<void> {}
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

function mountContainerInsideRoot(): {
  root: HTMLElement;
  container: HTMLElement;
} {
  const root = document.createElement('div');
  root.className = 'dt-root';
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    bottom: 40,
    right: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  root.appendChild(container);
  document.body.appendChild(root);
  return { root, container };
}

function makeOptions(): VisualizationOptions {
  return {
    tableName: 't',
    bridge: {} as unknown as VisualizationOptions['bridge'],
    filters: [],
  };
}

function makeColumn(): ColumnSchema {
  return { name: 'c', type: 'integer', nullable: false, originalType: 'INTEGER' };
}

function flushMutations(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

let vizzes: BaseVisualization[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  vizzes = [];
});

afterEach(() => {
  for (const v of vizzes) v.destroy();
  vizzes = [];
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('BaseVisualization — color-scheme MutationObserver', () => {
  it('re-renders when `data-dt-color-scheme` flips on the owning `.dt-root`', async () => {
    const { root, container } = mountContainerInsideRoot();
    const viz = new RenderProbe(container, makeColumn(), makeOptions());
    vizzes.push(viz);
    const before = viz.renderCount;

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(viz.renderCount).toBeGreaterThan(before);

    const mid = viz.renderCount;
    root.setAttribute('data-dt-color-scheme', 'light');
    await flushMutations();
    expect(viz.renderCount).toBeGreaterThan(mid);

    const late = viz.renderCount;
    root.removeAttribute('data-dt-color-scheme');
    await flushMutations();
    expect(viz.renderCount).toBeGreaterThan(late);
  });

  it('does not re-render after destroy()', async () => {
    const { root, container } = mountContainerInsideRoot();
    const viz = new RenderProbe(container, makeColumn(), makeOptions());
    viz.destroy();
    const frozen = viz.renderCount;

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(viz.renderCount).toBe(frozen);
  });

  it('no-ops when there is no `.dt-root` ancestor', async () => {
    // Container mounted directly on body — `resolveScope` falls back to the
    // canvas, which has no attribute to watch. The viz should construct
    // without throwing and never re-render on unrelated body mutations.
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    document.body.appendChild(container);
    const viz = new RenderProbe(container, makeColumn(), makeOptions());
    vizzes.push(viz);
    const before = viz.renderCount;
    document.body.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(viz.renderCount).toBe(before);
  });
});
