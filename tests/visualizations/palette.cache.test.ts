/**
 * @vitest-environment jsdom
 *
 * Phase 2 §4.6 — per-`.dt-root` palette caching.
 *
 * Every histogram render used to resolve 16 CSS custom properties and every
 * value-counts render 18, each through `getComputedStyle`. That is the hot
 * path: it runs on hover, on resize, on every data refresh, for every visible
 * column. The cache collapses it to one resolve per table per theme flip.
 *
 * The risk the cache introduces is staleness — a dark-mode toggle that leaves
 * pre-flip colors on the canvas forever. Both invalidation paths are pinned
 * here: the shared `ThemeWatcher` (the facade's composition) and
 * `BaseVisualization`'s own fallback observer (standalone `/advanced`
 * composition, where no watcher exists).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPaletteCache,
  invalidatePaletteCache,
  resolveCachedPalette,
} from '@/visualizations/palette';
import { getHistogramColors } from '@/visualizations/histogram/SharedHistogramBase';
import { ThemeWatcher } from '@/visualizations/ThemeWatcher';
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

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

/**
 * Drives `getComputedStyle` from a mutable token so a "theme flip" is
 * observable without jsdom having to evaluate real CSS, and so every
 * resolution is countable.
 */
let themeToken = 'light';
let resolveCalls: Element[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  themeToken = 'light';
  resolveCalls = [];
  // The generation counter is module state shared across tests.
  invalidatePaletteCache();
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) => {
    resolveCalls.push(element);
    return {
      getPropertyValue: (name: string) => `${themeToken}${name}`,
    } as unknown as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'dt-root';
  document.body.appendChild(root);
  return root;
}

function mountCanvas(root: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  return canvas;
}

// =========================================
// The generic mechanism (shared by both palettes)
// =========================================

describe('resolveCachedPalette', () => {
  it('computes once per scope and serves the same object on a hit', () => {
    const root = mountRoot();
    const canvas = mountCanvas(root);
    const cache = createPaletteCache<{ n: number }>();
    const compute = vi.fn(() => ({ n: 1 }));

    const first = resolveCachedPalette(canvas, cache, compute);
    const second = resolveCachedPalette(canvas, cache, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('keys on the `.dt-root` scope, so sibling canvases share one entry', () => {
    const root = mountRoot();
    const a = mountCanvas(root);
    const b = mountCanvas(root);
    const cache = createPaletteCache<{ n: number }>();
    const compute = vi.fn(() => ({ n: 1 }));

    resolveCachedPalette(a, cache, compute);
    resolveCachedPalette(b, cache, compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('computes separately for a second table on the same page', () => {
    const cache = createPaletteCache<{ n: number }>();
    const compute = vi.fn(() => ({ n: 1 }));

    resolveCachedPalette(mountCanvas(mountRoot()), cache, compute);
    resolveCachedPalette(mountCanvas(mountRoot()), cache, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes after invalidatePaletteCache()', () => {
    const canvas = mountCanvas(mountRoot());
    const cache = createPaletteCache<{ n: number }>();
    let value = 1;
    const compute = vi.fn(() => ({ n: value }));

    expect(resolveCachedPalette(canvas, cache, compute).n).toBe(1);
    value = 2;
    expect(resolveCachedPalette(canvas, cache, compute).n).toBe(1); // still cached

    invalidatePaletteCache();
    expect(resolveCachedPalette(canvas, cache, compute).n).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('retires every cache at once — histogram and value-counts share the stamp', () => {
    const canvas = mountCanvas(mountRoot());
    const cacheA = createPaletteCache<number>();
    const cacheB = createPaletteCache<number>();
    const computeA = vi.fn(() => 1);
    const computeB = vi.fn(() => 2);

    resolveCachedPalette(canvas, cacheA, computeA);
    resolveCachedPalette(canvas, cacheB, computeB);
    invalidatePaletteCache();
    resolveCachedPalette(canvas, cacheA, computeA);
    resolveCachedPalette(canvas, cacheB, computeB);

    expect(computeA).toHaveBeenCalledTimes(2);
    expect(computeB).toHaveBeenCalledTimes(2);
  });

  it('falls back to the canvas as its own scope with no `.dt-root` ancestor', () => {
    const loose = document.createElement('canvas');
    document.body.appendChild(loose);
    const cache = createPaletteCache<{ n: number }>();
    const compute = vi.fn(() => ({ n: 1 }));

    resolveCachedPalette(loose, cache, compute);
    resolveCachedPalette(loose, cache, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(loose);
  });
});

// =========================================
// getHistogramColors on top of it
// =========================================

describe('getHistogramColors — cache hit / miss', () => {
  it('resolves CSS variables once, then serves from cache', () => {
    const canvas = mountCanvas(mountRoot());

    const first = getHistogramColors(canvas);
    const afterFirst = resolveCalls.length;
    expect(afterFirst).toBeGreaterThan(10); // ~16 custom properties

    const second = getHistogramColors(canvas);
    expect(resolveCalls.length).toBe(afterFirst); // zero further lookups
    expect(second).toBe(first);
  });

  it('shares one resolution across every column in the same table', () => {
    const root = mountRoot();
    const columns = Array.from({ length: 20 }, () => mountCanvas(root));

    getHistogramColors(columns[0]!);
    const afterFirst = resolveCalls.length;
    for (const canvas of columns) getHistogramColors(canvas);

    expect(resolveCalls.length).toBe(afterFirst);
  });

  it('re-resolves with the new theme values after invalidation', () => {
    const canvas = mountCanvas(mountRoot());
    expect(getHistogramColors(canvas).barFill).toBe('light--dt-primary');

    themeToken = 'dark';
    expect(getHistogramColors(canvas).barFill).toBe('light--dt-primary'); // stale until retired

    invalidatePaletteCache();
    expect(getHistogramColors(canvas).barFill).toBe('dark--dt-primary');
  });
});

// =========================================
// Invalidation in both configurations
// =========================================

/** Records the palette resolved by each render. */
class PaletteProbe extends BaseVisualization {
  public renders: string[] = [];
  async fetchData(): Promise<void> {}
  render(): void {
    this.renders.push(getHistogramColors(this.canvas).barFill);
  }
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

function makeColumn(): ColumnSchema {
  return { name: 'c', type: 'integer', nullable: false, originalType: 'INTEGER' };
}

function makeContainer(root: HTMLElement): HTMLElement {
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
  return container;
}

function baseOptions(): VisualizationOptions {
  return {
    tableName: 't',
    bridge: {} as unknown as VisualizationOptions['bridge'],
    filters: [],
  };
}

function flushMutations(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('palette invalidation on a `data-dt-color-scheme` flip', () => {
  it('with a shared ThemeWatcher: every column repaints with the new palette', async () => {
    const root = mountRoot();
    const watcher = new ThemeWatcher(root);
    const a = new PaletteProbe(makeContainer(root), makeColumn(), {
      ...baseOptions(),
      themeWatcher: watcher,
    });
    const b = new PaletteProbe(makeContainer(root), makeColumn(), {
      ...baseOptions(),
      themeWatcher: watcher,
    });

    a.render();
    b.render();
    expect(a.renders.at(-1)).toBe('light--dt-primary');
    expect(b.renders.at(-1)).toBe('light--dt-primary');

    themeToken = 'dark';
    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(a.renders.at(-1)).toBe('dark--dt-primary');
    expect(b.renders.at(-1)).toBe('dark--dt-primary');

    a.destroy();
    b.destroy();
    watcher.destroy();
  });

  it('with a shared ThemeWatcher: the flip costs one resolution, not one per column', async () => {
    const root = mountRoot();
    const watcher = new ThemeWatcher(root);
    const probes = Array.from(
      { length: 10 },
      () =>
        new PaletteProbe(makeContainer(root), makeColumn(), {
          ...baseOptions(),
          themeWatcher: watcher,
        }),
    );
    for (const p of probes) p.render();

    const before = resolveCalls.length;
    themeToken = 'dark';
    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    const perFlip = resolveCalls.length - before;

    // One palette (~16 lookups) for ten columns, not ten palettes.
    expect(perFlip).toBeGreaterThan(0);
    expect(perFlip).toBeLessThan(32);
    for (const p of probes) expect(p.renders.at(-1)).toBe('dark--dt-primary');

    for (const p of probes) p.destroy();
    watcher.destroy();
  });

  it('without a ThemeWatcher: the private observer still retires the cache', async () => {
    const root = mountRoot();
    // No `themeWatcher` in options — the standalone `/advanced` composition.
    const viz = new PaletteProbe(makeContainer(root), makeColumn(), baseOptions());

    viz.render();
    expect(viz.renders.at(-1)).toBe('light--dt-primary');

    themeToken = 'dark';
    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(viz.renders.at(-1)).toBe('dark--dt-primary');
    viz.destroy();
  });

  it('without a ThemeWatcher: a destroyed instance stops repainting', async () => {
    const root = mountRoot();
    const viz = new PaletteProbe(makeContainer(root), makeColumn(), baseOptions());
    viz.render();
    viz.destroy();
    const frozen = viz.renders.length;

    themeToken = 'dark';
    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(viz.renders.length).toBe(frozen);
  });

  it('a destroyed instance unregisters itself from the shared watcher', async () => {
    const root = mountRoot();
    const watcher = new ThemeWatcher(root);
    const viz = new PaletteProbe(makeContainer(root), makeColumn(), {
      ...baseOptions(),
      themeWatcher: watcher,
    });
    expect(watcher.count).toBe(1);

    viz.destroy();
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);

    const frozen = viz.renders.length;
    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(viz.renders.length).toBe(frozen);

    watcher.destroy();
  });

  it('with a watcher supplied, no per-instance MutationObserver is created', () => {
    const root = mountRoot();
    const watcher = new ThemeWatcher(root);
    const probes: PaletteProbe[] = [];

    // A `vi.spyOn` on the global constructor does not survive `new`;
    // subclass and swap instead.
    const Original = globalThis.MutationObserver;
    let created = 0;
    class Counting extends Original {
      constructor(callback: MutationCallback) {
        super(callback);
        created++;
      }
    }
    globalThis.MutationObserver = Counting as unknown as typeof MutationObserver;
    try {
      for (let i = 0; i < 5; i++) {
        probes.push(
          new PaletteProbe(makeContainer(root), makeColumn(), {
            ...baseOptions(),
            themeWatcher: watcher,
          }),
        );
      }
    } finally {
      globalThis.MutationObserver = Original;
    }

    // Exactly one — the watcher's, created when the first probe registered.
    // Without the watcher this would be 5.
    expect(created).toBe(1);

    for (const p of probes) p.destroy();
    watcher.destroy();
  });
});
