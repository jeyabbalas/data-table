/**
 * Canvas visualizations resolve theme colors from CSS custom properties at
 * render time so that host-app `--dt-*` overrides and dark-mode flips
 * propagate to histogram / value-counts pixels on the next render call.
 *
 * Use `resolveScope(canvas)` to pick the DOM element whose computed style
 * carries the variables, then `resolveColor(scope, '--dt-foo', fallback)`
 * per token.
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
