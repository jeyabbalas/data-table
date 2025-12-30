/**
 * Histogram visualization module
 *
 * Exports histogram visualizations for numeric and date/timestamp columns.
 */

// Numeric histogram
export { Histogram } from './Histogram';

// Date/timestamp histogram
export { DateHistogram } from './DateHistogram';

// Numeric histogram data types and utilities
export {
  // Types
  type HistogramBin,
  type HistogramData,
  // Functions
  fetchHistogramData,
  calculateOptimalBins,
  filtersToWhereClause,
  formatSQLValue,
} from './HistogramData';

// Date histogram data types and utilities
export {
  // Types
  type DateHistogramBin,
  type DateHistogramData,
  type TimeInterval,
  // Functions
  fetchDateHistogramData,
} from './DateHistogramData';

// Date formatting utilities
export {
  type DateFormatContext,
  analyzeDateContext,
  formatDateLabel,
  formatDateRange,
  formatDateForStats,
} from './DateFormatters';
