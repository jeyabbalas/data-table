/**
 * Shared utility functions for visualizations
 */

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
 * Truncate text to fit within maxWidth, appending ellipsis (…) if needed.
 * Returns empty string if nothing fits.
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '\u2026';
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + ellipsis : '';
}
