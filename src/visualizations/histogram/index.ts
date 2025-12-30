/**
 * Histogram visualization module
 *
 * Exports histogram visualizations for numeric, date/timestamp, and time columns.
 */

// Numeric histogram
export { Histogram } from './Histogram';

// Date/timestamp histogram
export { DateHistogram } from './DateHistogram';

// Time histogram (for TIME type columns)
export { TimeHistogram } from './TimeHistogram';

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

// Time histogram data types and utilities
export {
  // Types
  type TimeHistogramBin,
  type TimeHistogramData,
  // Functions
  fetchTimeHistogramData,
  parseTimeToSeconds,
  secondsToTimeString,
  detectTimeIntervalForTime,
  formatTimeForSQL,
} from './TimeHistogramData';

// Date formatting utilities
export {
  type DateFormatContext,
  analyzeDateContext,
  formatDateLabel,
  formatDateRange,
  formatDateForStats,
  // Time-only formatters
  formatTimeOnlyLabel,
  formatTimeOnlyRange,
  formatTimeOnlyForStats,
} from './DateFormatters';
