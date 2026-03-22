/**
 * Interactive Data Table Library
 *
 * A client-side JavaScript library for interactive, explorable data tables
 * using DuckDB WASM for in-browser analytics.
 */

export const VERSION = '0.1.0';

// Core types
export * from './core/types';

// Filter types (explicit re-exports for direct import)
export type {
  RangeFilter,
  PointFilter,
  SetFilter,
  NotSetFilter,
  NullFilter,
  PatternFilter,
} from './filters/FilterTypes';

// Filter SQL generation
export { filterToSQL, filtersToWhereClause, formatSQLValue, quoteIdentifier } from './filters/FilterSQL';

// Crossfilter query utilities
export { splitCrossfilterFilters } from './filters/CrossfilterQuery';
export type { CrossfilterSplit } from './filters/CrossfilterQuery';

// Filter UI components
export { FilterChip, formatFilter, formatDisplayValue } from './filters/FilterChip';
export type { FilterChipOptions } from './filters/FilterChip';
export { FilterBar } from './filters/FilterBar';
export type { FilterBarOptions } from './filters/FilterBar';

// Core classes
export { EventEmitter } from './core/EventEmitter';

// Signals and reactive state
export { createSignal, computed, batch } from './core/Signal';
export type { Signal, Computed } from './core/Signal';

// State management
export {
  createTableState,
  resetTableState,
  initializeColumnsFromSchema,
} from './core/State';
export type { TableState } from './core/State';

// State actions
export { StateActions } from './core/Actions';
export type { LoadDataOptions } from './core/Actions';

// Table components
export { TableContainer } from './table/TableContainer';
export type { TableContainerOptions, ResizeCallback } from './table/TableContainer';

export { ColumnHeader } from './table/ColumnHeader';
export type { ColumnHeaderOptions } from './table/ColumnHeader';

export { VirtualScroller } from './table/VirtualScroller';
export type {
  VirtualScrollerOptions,
  VisibleRange,
  ScrollCallback,
  ScrollAlign,
} from './table/VirtualScroller';

export { TableBody } from './table/TableBody';
export type { TableBodyOptions, RowData } from './table/TableBody';

export { CellRenderer } from './table/Cell';
export type { CellOptions } from './table/Cell';

export { ColumnReorder } from './table/ColumnReorder';
export type { ColumnReorderOptions, ReorderCallback } from './table/ColumnReorder';

// Progress reporting
export type {
  ProgressInfo,
  ProgressCallback,
  ProgressStage,
} from './core/Progress';
export {
  estimateTimeRemaining,
  formatProgress,
  formatBytes,
  formatDuration,
} from './core/Progress';

// Data layer
export { WorkerBridge, getDefaultBridge } from './data/WorkerBridge';
export type { LoadOptions } from './data/WorkerBridge';

// Data loader
export { DataLoader } from './data/DataLoader';
export type { DataFormat, LoadResult, DataLoaderOptions } from './data/DataLoader';

// Schema detection
export { detectSchema, mapDuckDBType } from './data/SchemaDetector';

// Type inference
export { inferStringColumnType, inferAllStringColumnTypes } from './data/TypeInference';
export type { TypeInferenceResult, TypeInferenceOptions } from './data/TypeInference';

// Pattern detection
export { detectPattern, detectColumnPattern, detectAllColumnPatterns } from './data/PatternDetector';
export type { DetectedPattern, PatternDetectionResult, PatternDetectionOptions } from './data/PatternDetector';

// Visualization factory
export { VisualizationFactory } from './visualizations/VisualizationFactory';
export type { VisualizationRegistration, VisualizationConstructor } from './visualizations/VisualizationFactory';
export { isNumericType, isDateType, isTimeType, isCategoricalType, needsVisualization } from './visualizations/VisualizationFactory';

// Worker types (for advanced usage)
export type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  WorkerResponseType,
} from './worker/types';
