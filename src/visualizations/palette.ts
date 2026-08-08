/**
 * Canvas visualizations resolve theme colors from CSS custom properties so
 * that host-app `--dt-*` overrides and dark-mode flips propagate to
 * histogram / value-counts pixels.
 *
 * Use `resolveScope(canvas)` to pick the DOM element whose computed style
 * carries the variables, then `resolveColor(scope, '--dt-foo', fallback)`
 * per token.
 *
 * Resolution used to run on **every** `render()` — ~15 `getComputedStyle`
 * lookups per histogram paint, ~18 per value-counts paint, multiplied by
 * every visible column and every hover frame. `resolveCachedPalette` keeps
 * one resolved palette per `.dt-root` scope instead, so a repaint that
 * follows a hover, a resize, or a data refresh costs zero style lookups.
 *
 * The cache is only as correct as its invalidation, so there are two of
 * them:
 *
 * 1. **Explicit** — `invalidatePaletteCache()`, called by `ThemeWatcher` (one
 *    per DataTable) and by `BaseVisualization`'s standalone fallback observer
 *    the moment `data-dt-color-scheme` changes on `.dt-root`, before the
 *    re-render those paths trigger.
 * 2. **Implicit** — a single lazily-installed `prefers-color-scheme` media
 *    listener. Under `colorScheme: 'auto'` the library *removes*
 *    `data-dt-color-scheme` entirely (`TableContainer.applyColorSchemeAttribute`),
 *    so an OS-level dark-mode flip changes every `--dt-*` value with no DOM
 *    mutation for any observer to see. Without this listener the cache would
 *    hand out pre-flip colors forever.
 */

export function resolveColor(scope: HTMLElement, cssVar: string, fallback: string): string {
  const value = getComputedStyle(scope).getPropertyValue(cssVar).trim();
  return value || fallback;
}

/**
 * Nearest `.dt-root` ancestor of the canvas, or the canvas itself as a
 * fallback. Canvas inherits CSS variables either way, so the fallback is
 * safe under custom `classPrefix` values.
 */
export function resolveScope(canvas: HTMLCanvasElement): HTMLElement {
  return canvas.closest('.dt-root') ?? canvas;
}

// =========================================
// Per-scope palette cache
// =========================================

/**
 * Monotonic stamp compared against each cache entry. Bumping it retires
 * every cached palette across every table at once — cheaper and far harder
 * to get wrong than tracking which scopes a given theme change touched, and
 * the only cost of over-invalidating is one extra resolve per live scope.
 */
let paletteGeneration = 0;

interface PaletteCacheEntry<T> {
  value: T;
  generation: number;
}

/**
 * A palette cache keyed by `.dt-root` scope. `WeakMap` so a destroyed table's
 * entry disappears with its root element — visualizations come and go
 * constantly as headers are rebuilt, and nothing here should pin DOM.
 */
export type PaletteCache<T> = WeakMap<HTMLElement, PaletteCacheEntry<T>>;

/** Create an empty module-level palette cache for one palette shape. */
export function createPaletteCache<T>(): PaletteCache<T> {
  return new WeakMap<HTMLElement, PaletteCacheEntry<T>>();
}

/**
 * Retire every cached palette. Called on each theme flip — by `ThemeWatcher`
 * when the facade supplies one, and by `BaseVisualization`'s own fallback
 * observer when it does not — before the re-render that repaints with the
 * new colors.
 *
 * Also the escape hatch for a host app that mutates `--dt-*` custom
 * properties at runtime without flipping `data-dt-color-scheme`: call this
 * and the next render re-resolves.
 */
export function invalidatePaletteCache(): void {
  paletteGeneration++;
}

/** Installed at most once, on the first cached resolve. See module docs. */
let osThemeListenerInstalled = false;

function ensureOsThemeListener(): void {
  if (osThemeListenerInstalled) return;
  osThemeListenerInstalled = true;
  // Guarded: jsdom ships no `matchMedia`, and neither does a worker context.
  // Absent it, the `auto` OS flip simply degrades to the pre-cache behavior
  // of "repaints with the new palette whenever something else re-renders".
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  // Never removed: one listener for the lifetime of the module, holding no
  // DOM and doing nothing but bumping an integer.
  query.addEventListener?.('change', invalidatePaletteCache);
}

/**
 * Resolve a palette for `canvas`'s `.dt-root` scope, reusing the previously
 * resolved one unless the theme has changed since.
 *
 * @param canvas - the visualization's canvas; its scope is the cache key
 * @param cache - a module-level cache created by {@link createPaletteCache}
 * @param compute - resolves the palette from scratch for a given scope
 */
export function resolveCachedPalette<T>(
  canvas: HTMLCanvasElement,
  cache: PaletteCache<T>,
  compute: (scope: HTMLElement) => T,
): T {
  ensureOsThemeListener();
  const scope = resolveScope(canvas);
  const cached = cache.get(scope);
  if (cached && cached.generation === paletteGeneration) {
    return cached.value;
  }
  const value = compute(scope);
  cache.set(scope, { value, generation: paletteGeneration });
  return value;
}
