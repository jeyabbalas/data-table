/**
 * Visualization Module Exports
 *
 * This module provides column visualizations for the data table.
 * - Histogram: For numeric columns (integer, float, decimal)
 * - DateHistogram: For date/timestamp columns
 * - ValueCounts: For categorical columns (Phase 4.6)
 */

export { BaseVisualization } from './BaseVisualization';
export type { VisualizationOptions } from './BaseVisualization';
export { PlaceholderVisualization } from './PlaceholderVisualization';

// Numeric histogram visualization
export { Histogram } from './histogram';
export type { HistogramBin, HistogramData } from './histogram';

// Date/timestamp histogram visualization
export { DateHistogram } from './histogram';
export type {
  DateHistogramBin,
  DateHistogramData,
  TimeInterval,
} from './histogram';
