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
 * Truncate text to fit within maxWidth, appending ellipsis (…) if needed.
 * Returns empty string if nothing fits.
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
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
