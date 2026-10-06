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

// =========================================
// Label ink
// =========================================

/** Ink for a label on a dark fill. */
const LIGHT_INK = '#ffffff';
/** Ink for a label on a light fill: gray-900, the light theme's `--dt-text`. */
const DARK_INK = '#111827';
const DARK_INK_LUMINANCE = relativeLuminance([0x11, 0x18, 0x27, 1]);
/** Ink for a mid-tone fill neither of the two clears 4.5:1 on. */
const BLACK_INK = '#000000';
/** WCAG AA for text below 18pt, which every chart label is. */
const MIN_TEXT_CONTRAST = 4.5;

type Rgba = [number, number, number, number];

/** Options for {@link inkFor}. */
export interface InkOptions {
  /**
   * What a translucent fill is painted over, which the label then reads
   * against too: one color, or the layers under the fill from the bottom
   * up (a chart's slot, then a tint drawn on it). The bottom layer is read
   * as painted over white, and a layer this cannot read is left out.
   * Default white.
   */
  backdrop?: string | readonly string[] | undefined;
  /** The ink for a fill this cannot read (a named color, `oklch()`). Default white. */
  fallback?: string | undefined;
}

/**
 * A color to draw a label in on `fill`, with at least 4.5:1 contrast: white
 * on a dark fill, near-black (`#111827`) on a light one, and black on a
 * mid-tone fill that neither of those clears 4.5:1 on. A chart's fills come
 * from the theme's CSS variables, so the ink follows a host app's
 * `--dt-primary` and a dark-mode flip on the next render. A translucent
 * fill is read as what shows: the fill painted over `backdrop`.
 *
 * Reads `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` (comma or
 * space syntax), `transparent`, and a tint of one of those as the theme's
 * alpha tokens write it, `color-mix(in srgb, <color> 30%, transparent)`.
 * Other syntaxes (a named color, `hsl()`, `oklch()`) get `fallback`.
 *
 * @param fill - The fill the label is drawn on.
 * @param options - The backdrop under a translucent fill, and the ink for a
 *   fill this cannot read.
 *
 * @example
 * ```ts
 * inkFor('#2563eb'); // '#ffffff' — 5.2:1 on the light theme's --dt-primary
 * inkFor('#60a5fa'); // '#111827' — 7.0:1 on the dark theme's
 * inkFor('#f59e0b'); // '#111827' — on --dt-accent
 * // A host's translucent primary on the dark chart slot: white, 5.3:1.
 * inkFor('rgba(96, 165, 250, 0.55)', { backdrop: '#1f2937' });
 * ```
 */
export function inkFor(fill: string, options: InkOptions = {}): string {
  const color = parseRgba(fill);
  if (!color) return options.fallback ?? LIGHT_INK;
  const layers = typeof options.backdrop === 'string' ? [options.backdrop] : options.backdrop;
  let backdrop: Rgba = [255, 255, 255, 1];
  for (const layer of layers ?? []) {
    const rgba = parseRgba(layer);
    if (rgba) backdrop = flatten(rgba, backdrop);
  }
  const luminance = relativeLuminance(flatten(color, backdrop));
  const onWhite = 1.05 / (luminance + 0.05);
  const onDark = (luminance + 0.05) / (DARK_INK_LUMINANCE + 0.05);
  // Whichever reads better; black when that is still under 4.5:1, which it
  // then clears (a fill too light for white is at least 4.67:1 on black).
  if (onWhite >= onDark) return onWhite >= MIN_TEXT_CONTRAST ? LIGHT_INK : BLACK_INK;
  return onDark >= MIN_TEXT_CONTRAST ? DARK_INK : BLACK_INK;
}

/**
 * `[r, g, b, a]` (0–255, alpha 0–1) of a hex, `rgb()` or `rgba()` color, or
 * of a tint of one, or `null`.
 */
function parseRgba(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return [0, 0, 0, 0];

  // The theme's tints, as a computed style gives them with the variable
  // substituted: `color-mix(in srgb, #60a5fa 30%, transparent)`. Mixed with
  // transparent, a color keeps its channels and scales its alpha.
  const tint = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/.exec(
    text,
  );
  if (tint) {
    const color = parseRgba(tint[1]!);
    const share = parseFloat(tint[2]!) / 100;
    if (!color || !Number.isFinite(share)) return null;
    return [color[0], color[1], color[2], color[3] * clamp(share, 0, 1)];
  }

  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      const digit = (i: number): number => parseInt(hex[i]! + hex[i]!, 16);
      return [digit(0), digit(1), digit(2), hex.length === 4 ? digit(3) / 255 : 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      const pair = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
      return [pair(0), pair(2), pair(4), hex.length === 8 ? pair(6) / 255 : 1];
    }
    return null;
  }

  const args = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (args === undefined) return null;
  const parts = args
    .trim()
    .split(/\s*[,/]\s*|\s+/)
    .filter((p) => p !== '');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const read = (part: string, scale: number): number =>
    part.endsWith('%') ? (parseFloat(part) / 100) * scale : parseFloat(part);
  const rgba: Rgba = [
    read(parts[0]!, 255),
    read(parts[1]!, 255),
    read(parts[2]!, 255),
    parts[3] === undefined ? 1 : read(parts[3], 1),
  ];
  if (rgba.some((n) => !Number.isFinite(n))) return null;
  return [
    clamp(rgba[0], 0, 255),
    clamp(rgba[1], 0, 255),
    clamp(rgba[2], 0, 255),
    clamp(rgba[3], 0, 1),
  ];
}

/** `color` painted over the opaque `backdrop`. */
function flatten(color: Rgba, backdrop: Rgba): Rgba {
  const a = color[3];
  return [
    color[0] * a + backdrop[0] * (1 - a),
    color[1] * a + backdrop[1] * (1 - a),
    color[2] * a + backdrop[2] * (1 - a),
    1,
  ];
}

/** WCAG 2 relative luminance of an opaque sRGB color. */
function relativeLuminance(color: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
