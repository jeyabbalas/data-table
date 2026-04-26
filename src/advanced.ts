/**
 * Advanced entry point — `@jeyabbalas/data-table/advanced`
 *
 * Lower-level building blocks for consumers composing custom UIs on top
 * of the library: the state store, table/filter/derived-column components,
 * export helpers, persistence snapshot serializers, `AutoSave`, statistics
 * internals, and visualization primitives.
 *
 * Most consumers should use the root entry (`createDataTable()`) instead;
 * reach for this module only when the façade does not expose what you need.
 */

// ---- Low-level state & reactive primitives ----
export { EventEmitter } from './core/EventEmitter';

export { StateActions } from './core/Actions';
export type { LoadDataOptions } from './core/Actions';

export {
  createTableState,
  resetTableState,
  initializeColumnsFromSchema,
} from './core/State';
export type { TableState, HiddenColumnInfo } from './core/State';

export {
  UndoManager,
  captureSnapshot,
  applySnapshot,
  derivedColumnsEqual,
} from './core/UndoManager';
export type { StateSnapshot } from './core/UndoManager';

// ---- Table UI components ----
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

export { AnnotationPopover } from './table/AnnotationPopover';
export type { AnnotationPopoverOptions } from './table/AnnotationPopover';

export { ColumnHeaderTooltipPopover } from './table/ColumnHeaderTooltipPopover';
export type { ColumnHeaderTooltipPopoverOptions } from './table/ColumnHeaderTooltipPopover';

export { CellRenderer } from './table/Cell';
export type { CellOptions } from './table/Cell';

export { ColumnReorder } from './table/ColumnReorder';
export type { ColumnReorderOptions, ReorderCallback } from './table/ColumnReorder';

export { HiddenColumnsGutter } from './table/HiddenColumnsGutter';
export type { HiddenColumnsGutterOptions } from './table/HiddenColumnsGutter';

export { KeyboardNavigator } from './table/KeyboardNavigator';
export type { KeyboardNavigatorOptions } from './table/KeyboardNavigator';

// ---- Filter UI components ----
export { FilterChip } from './filters/FilterChip';
export type { FilterChipOptions } from './filters/FilterChip';

export { FilterBar } from './filters/FilterBar';
export type { FilterBarOptions } from './filters/FilterBar';

export { FilterPanel } from './filters/FilterPanel';
export type { FilterPanelOptions } from './filters/FilterPanel';

export { FilterPanelField } from './filters/FilterPanelField';
export type { FilterPanelFieldOptions } from './filters/FilterPanelField';

export { SQLFilterModal } from './filters/SQLFilterModal';
export type { SQLFilterModalOptions } from './filters/SQLFilterModal';

export { FilterPresetPanel } from './filters/FilterPresetPanel';
export type { FilterPresetPanelOptions } from './filters/FilterPresetPanel';

// ---- Derived column UI ----
export { DerivedColumnEditPanel } from './derived/DerivedColumnEditPanel';
export type { DerivedColumnEditPanelOptions } from './derived/DerivedColumnEditPanel';

export { DerivedColumnModal } from './derived/DerivedColumnModal';
export type { DerivedColumnModalOptions } from './derived/DerivedColumnModal';

export { AddColumnButton } from './derived/AddColumnButton';
export type { AddColumnButtonOptions } from './derived/AddColumnButton';

export { DefaultExpressionEditor } from './derived/DefaultExpressionEditor';

export { DerivedColumnManager } from './derived/DerivedColumnManager';
export type { DerivedColumnInfo } from './derived/types';

export { CodeMirrorExpressionEditor } from './sql-editor/CodeMirrorExpressionEditor';
export { DUCKDB_FUNCTIONS } from './sql-editor/duckdbFunctions';

// ---- Export (low-level) ----
export { ExportDialog } from './export/ExportDialog';
export type { ExportDialogOptions } from './export/ExportDialog';

export { exportToCSV, exportFromState } from './export/CSVExport';
export type { ExportOptions } from './export/CSVExport';

export { exportToJSON, exportJSONFromState } from './export/JSONExport';
export type { JSONExportOptions } from './export/JSONExport';

export { exportToParquet, exportParquetFromState } from './export/ParquetExport';
export type { ParquetExportOptions } from './export/ParquetExport';

export { copyToClipboard, copyRowsToClipboard } from './export/Clipboard';

export type { ExportContext } from './export/ExportQuery';

// ---- Persistence internals ----
export { AutoSave } from './persistence/AutoSave';
export type { AutoSaveOptions } from './persistence/AutoSave';

export type {
  SessionSnapshot,
  SerializedStateSnapshot,
  SerializedDerivedColumnDef,
  PooledVectorColumnRef,
  VectorValuePoolEntry,
  DateWrapper,
} from './persistence/types';
export { SNAPSHOT_VERSION, isPooledVectorRef } from './persistence/types';

// ---- Annotations (advanced construction) ----
// Most consumers reach the store via `table.annotations`. Export the class
// and id generator here for composability (tests, framework integrations).
export { AnnotationStore } from './annotations/AnnotationStore';
export type { AnnotationStoreOptions } from './annotations/AnnotationStore';
export { generateAnnotationId, isAnnotationIdShape } from './annotations/AnnotationId';

// ---- Statistics ----
export type {
  ColumnStatsData,
  NumericColumnStats,
  CategoricalColumnStats,
  TemporalColumnStats,
  TimeColumnStats,
  IntervalColumnStats,
  BaseColumnStats,
} from './statistics/ColumnStatsTypes';
export { statsKindForDataType } from './statistics/ColumnStatsTypes';
export { formatStatValue, formatCount, formatDefaultStats } from './statistics/StatsFormatters';
export { fetchIntervalStats } from './statistics/StatsComputer';

// ---- Visualization internals ----
export { BaseVisualization } from './visualizations/BaseVisualization';
export type { VisualizationOptions } from './visualizations/BaseVisualization';

// ---- Stats panel internals ----
// Subclass `BaseStatsPanel` and register it on a `StatsPanelRegistry` (root
// entry) to replace the column-header stats slot with your own rendering.
// `StatsPanelCoordinator` is composed by the facade and only exposed for
// power users orchestrating panels manually.
export { BaseStatsPanel } from './visualizations/BaseStatsPanel';
export type {
  StatsPanelOptions,
  StatsPanelErrorContext,
  StatsPanelErrorPhase,
} from './visualizations/BaseStatsPanel';
export { StatsPanelCoordinator } from './visualizations/StatsPanelCoordinator';

export { Histogram, DateHistogram, TimeHistogram, IntervalHistogram } from './visualizations/histogram';
export type {
  HistogramBin,
  HistogramData,
  DateHistogramBin,
  DateHistogramData,
  TimeInterval,
  TimeHistogramBin,
  TimeHistogramData,
  IntervalHistogramBin,
  IntervalHistogramData,
} from './visualizations/histogram';

export { ValueCounts } from './visualizations/valuecounts';
export type { CategorySegment, ValueCountsData } from './visualizations/valuecounts';

export { CrossfilterCoordinator } from './visualizations/CrossfilterCoordinator';
export { InteractionManager } from './visualizations/InteractionManager';
export type { InteractiveVisualization } from './visualizations/InteractionManager';

export {
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
  isIntervalType,
  needsVisualization,
} from './visualizations/VisualizationRegistry';

// Deprecated static wrapper — kept reachable here on /advanced only.
// New code should use `VisualizationRegistry` from the root entry.
export { VisualizationFactory } from './visualizations/VisualizationFactory';
