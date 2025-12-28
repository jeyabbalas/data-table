/**
 * Visualization Module Exports
 *
 * This module provides column visualizations for the data table.
 * - Histogram: For numeric columns (integer, float, decimal)
 * - DateHistogram: For date/timestamp columns (Phase 4.5)
 * - ValueCounts: For categorical columns (Phase 4.6)
 */

export { BaseVisualization } from './BaseVisualization';
export type { VisualizationOptions } from './BaseVisualization';
export { PlaceholderVisualization } from './PlaceholderVisualization';

// Histogram visualization
export { Histogram } from './histogram';
export type { HistogramBin, HistogramData } from './histogram';
