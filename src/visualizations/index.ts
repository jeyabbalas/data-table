/**
 * Visualization Module Exports
 *
 * This module provides column visualizations for the data table.
 * - Histogram: For numeric columns (integer, float, decimal)
 * - DateHistogram: For date/timestamp columns
 * - TimeHistogram: For time columns
 * - ValueCounts: For categorical columns (string, boolean, uuid)
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

// Time histogram visualization
export { TimeHistogram } from './histogram';
export type { TimeHistogramBin, TimeHistogramData } from './histogram';

// Value counts visualization for categorical columns
export { ValueCounts } from './valuecounts';
export type { CategorySegment, ValueCountsData } from './valuecounts';
