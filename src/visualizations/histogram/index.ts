/**
 * Histogram visualization module
 *
 * Exports the Histogram visualization class and data fetching utilities.
 */

// Histogram visualization class
export { Histogram } from './Histogram';

// Data types and fetching utilities
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
