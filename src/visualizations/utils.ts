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
