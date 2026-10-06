/**
 * Shared utility functions for visualizations
 */

import { graphemeSegmenter } from '../core/graphemes';

/**
 * Format count with thousands separator
 */
export function formatCount(count: number): string {
  return count.toLocaleString();
}

/**
 * Format percentage from ratio
 */
export function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%';
}

/**
 * Escape HTML special characters to prevent XSS when interpolating
 * user-derived strings (e.g. column values) into innerHTML.
 */
export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Map an x-coordinate to the index of the slot (bar/segment) that owns it,
 * filling inter-slot gaps at their midpoints so hover/click never dead-zones.
 * Slots must be ordered left-to-right. Returns null if x is outside [min, max].
 */
export function findSlotAtX(
  slots: readonly { x: number; width: number }[],
  x: number,
  min: number,
  max: number,
): number | null {
  if (slots.length === 0 || x < min || x > max) return null;
  for (let i = 0; i < slots.length; i++) {
    const next = slots[i + 1];
    const boundary = next ? (slots[i]!.x + slots[i]!.width + next.x) / 2 : max;
    if (x <= boundary) return i;
  }
  return slots.length - 1;
}

/**
 * Fill one segment of a horizontal stacked bar: a rectangle whose left
 * corners are rounded when it starts the bar (`roundLeft`), and whose right
 * corners are rounded when it ends it (`roundRight`). The value counts' and
 * the nested summary's bars are drawn of these.
 */
export function drawSegmentRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  roundLeft: boolean,
  roundRight: boolean,
  radius = 2,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();

  if (roundLeft && roundRight) {
    // Both corners rounded
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  } else if (roundLeft) {
    // Only left corners rounded
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  } else if (roundRight) {
    // Only right corners rounded
    ctx.moveTo(x, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y);
  } else {
    // No rounded corners
    ctx.rect(x, y, width, height);
  }

  ctx.closePath();
  ctx.fill();
}

/**
 * Where each character of `text` ends, in UTF-16 units, first to last.
 * Characters are graphemes where the runtime has `Intl.Segmenter`, so an
 * emoji sequence, a flag or a letter with its accent is one character,
 * else code points, as the filter chips cut their values.
 */
function characterEnds(text: string): number[] {
  const segmenter = graphemeSegmenter();
  const ends: number[] = [];
  if (segmenter) {
    for (const { index, segment } of segmenter.segment(text)) {
      ends.push(index + segment.length);
    }
  } else {
    let end = 0;
    for (const point of text) ends.push((end += point.length));
  }
  return ends;
}

/**
 * Truncate text to fit within maxWidth, appending ellipsis (…) if needed.
 * Returns empty string if nothing fits.
 *
 * The cut falls between characters, never inside one: an emoji sequence, a
 * flag or a letter with its combining accent is kept whole or dropped
 * whole. Cutting UTF-16 units could end the text on half a surrogate pair,
 * which a canvas draws as the replacement character, U+FFFD.
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '\u2026';
  // Drop characters from the end until the rest and the ellipsis fit: one
  // measure per character dropped, and the text segmented once.
  const ends = characterEnds(text);
  for (let i = ends.length - 2; i >= 0; i--) {
    const truncated = text.slice(0, ends[i]) + ellipsis;
    if (ctx.measureText(truncated).width <= maxWidth) return truncated;
  }
  return '';
}
