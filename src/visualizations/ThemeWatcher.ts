/**
 * ThemeWatcher - One `data-dt-color-scheme` MutationObserver per DataTable
 *
 * Every visualization used to install its own `MutationObserver` on the
 * owning `.dt-root` so its canvas could repaint after a dark/light flip
 * (`BaseVisualization.setupColorSchemeWatcher`). At 1,000 columns that is
 * 1,000 observers watching one attribute on one element — the WIDE baseline
 * measured 1,001 live MutationObservers with visualizations on versus 1 with
 * them off.
 *
 * This is the same collapse `WindowListenerManager` (`BaseVisualization.ts`)
 * performs for window `mouseup` / `keydown`: one real listener, N registered
 * consumers, attached when the first arrives and detached when the last
 * leaves. It differs in being **per table** rather than a static singleton —
 * each DataTable has its own `.dt-root` to observe, and multiple tables can
 * share a page with independent color schemes.
 *
 * The facade constructs one and passes it to every visualization via
 * `VisualizationOptions.themeWatcher`. Visualizations composed standalone
 * from `/advanced` get no watcher and keep their private observer, so that
 * path is unchanged.
 */

import { invalidatePaletteCache } from './palette';

/** Notified after a `data-dt-color-scheme` flip on the watched root. */
export type ThemeChangeListener = () => void;

/**
 * Watches one `.dt-root` for `data-dt-color-scheme` changes and fans the
 * signal out to every registered visualization.
 *
 * @example
 * ```ts
 * const themeWatcher = new ThemeWatcher(rootElement);
 * const viz = new Histogram(container, column, { ...options, themeWatcher });
 * // …later
 * viz.destroy();      // unregisters itself
 * themeWatcher.destroy();
 * ```
 */
export class ThemeWatcher {
  private listeners = new Set<ThemeChangeListener>();
  private observer: MutationObserver | null = null;
  private destroyed = false;

  private onMutation = (): void => {
    // Retire the cached palettes *before* anyone repaints, or the first
    // listener to render would paint pre-flip colors and re-seed the cache
    // with them.
    invalidatePaletteCache();
    // Copy: a listener is free to unregister itself (or another) from inside
    // its own callback — a destroyed visualization does exactly that.
    for (const listener of [...this.listeners]) {
      listener();
    }
  };

  /**
   * @param root - the table's `.dt-root` element, whose
   *   `data-dt-color-scheme` attribute carries the resolved color scheme.
   */
  constructor(private readonly root: HTMLElement) {}

  /**
   * Add a listener, attaching the shared observer if this is the first one.
   * Registering the same listener twice is a no-op (`Set` semantics).
   */
  register(listener: ThemeChangeListener): void {
    if (this.destroyed) return;
    this.listeners.add(listener);
    if (!this.observer && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(this.onMutation);
      this.observer.observe(this.root, {
        attributes: true,
        attributeFilter: ['data-dt-color-scheme'],
      });
    }
  }

  /**
   * Remove a listener, detaching the shared observer once the last one is
   * gone so an idle table costs no observer at all.
   */
  unregister(listener: ThemeChangeListener): void {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      this.observer?.disconnect();
      this.observer = null;
    }
  }

  /**
   * Tear down: drop every listener and disconnect. Idempotent, and a
   * `register` after it is ignored so a late-destroyed visualization can't
   * resurrect the observer.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Number of registered listeners. */
  get count(): number {
    return this.listeners.size;
  }

  /** Whether the shared MutationObserver is currently attached. */
  get isObserving(): boolean {
    return this.observer !== null;
  }
}
