/**
 * Interactive Data Table Library
 *
 * A client-side JavaScript library for interactive, explorable data tables
 * using DuckDB WASM for in-browser analytics.
 *
 * This is the root entry (`@jeyabbalas/data-table`) — the public surface.
 * Advanced building blocks (low-level state, UI components, export helpers,
 * visualization internals, persistence snapshot serializers, `AutoSave`)
 * live at `@jeyabbalas/data-table/advanced`.
 */

export const VERSION = '0.1.0';

// ---- Facade ----
// High-level entry point for most consumers. Wraps worker + state + actions
// + container + visualizations + persistence + presets + undo/redo + export
// into a single `createDataTable()` call.
export { createDataTable } from './DataTable';
export type { DataTable, CreateDataTableOptions, ColorScheme } from './DataTable';
export type { TableEvents, TableEventName, TableErrorSource } from './core/TableEvents';

// ---- Typed error model ----
// All library errors extend `DataTableError`; catch sites narrow via
// `instanceof` and branch on `err.code`.
export {
  DataTableError,
  WorkerInitError,
  WorkerTerminatedError,
  QueryError,
  LoadError,
  SQLValidationError,
  DerivedColumnError,
  PersistenceError,
  AnnotationError,
  ExportError,
  ConfigurationError,
  DestroyedError,
} from './core/errors';
export type { DataTableErrorOptions } from './core/errors';

// ---- Core types ----
export type {
  DataType,
  ColumnSchema,
  Filter,
  FilterType,
  SortColumn,
  SortDirection,
  RowId,
} from './core/types';
export { ROWID_COLUMN } from './core/types';
export type { GetColumnValuesOptions } from './core/Actions';

// ---- Filter shapes ----
export type {
  RangeFilter,
  PointFilter,
  SetFilter,
  NotSetFilter,
  NullFilter,
  PatternFilter,
  RawSQLFilter,
} from './filters/FilterTypes';

// ---- SQL-authoring helpers ----
// For consumers building raw SQL on top of the bridge (e.g. custom SELECTs,
// data-quality rule authoring). Filter-object → WHERE-clause conversion is
// handled internally; consumers construct `Filter[]` via `table.actions`.
export { quoteIdentifier, formatSQLValue, filtersToWhereClause } from './filters/FilterSQL';

// ---- Filter presets ----
export { FilterPresetManager } from './filters/FilterPresets';
export type { FilterPreset, FilterPresetCollection } from './filters/FilterPresetTypes';

// ---- Data layer ----
// Exposed for consumers pre-constructing a bridge or passing custom
// load options (progress callbacks, abort signals, format overrides).
export { WorkerBridge } from './data/WorkerBridge';
export type { LoadOptions, WorkerBridgeOptions } from './data/WorkerBridge';
export type { DataFormat, LoadResult } from './data/DataLoader';

// ---- Persistence ----
// `SessionStore` is injectable for apps that manage their own storage.
// `serializeFilter` / `deserializeFilter` let apps round-trip filter
// state into their own stores (URL params, cloud sync, etc.).
export { SessionStore, serializeFilter, deserializeFilter } from './persistence/SessionStore';
export type { SerializedFilter } from './persistence/types';

// ---- Annotations ----
// Programmatic row / column / cell annotation overlay exposed on
// `table.annotations`. Types let consumers build JSON payloads for
// `loadJSON` without constructing a store by hand.
export type {
  Annotation,
  AnnotationScope,
  AnnotationSeverity,
  RowAnnotation,
  ColumnAnnotation,
  CellAnnotation,
  AnnotationFile,
  AnnotationChangePayload,
  AnnotationChangeHandler,
  NewAnnotation,
} from './annotations/types';
export { ANNOTATION_FILE_VERSION } from './annotations/types';

// ---- Visualization registry ----
// Register custom visualizations per-instance via `createDataTable({
// visualizationRegistry })`, or globally via `defaultVisualizationRegistry`.
export {
  VisualizationRegistry,
  defaultVisualizationRegistry,
} from './visualizations/VisualizationRegistry';
export type {
  VisualizationRegistration,
  VisualizationConstructor,
} from './visualizations/VisualizationRegistry';

// ---- Derived columns ----
// Types consumers need when passing initial derived-column definitions
// or when injecting a custom expression editor.
export type {
  DerivedColumnKind,
  VectorDataType,
  ExpressionColumnDef,
  VectorColumnDef,
  DerivedColumnDef,
  CompletionContext,
} from './derived/types';
export type {
  ExpressionEditor,
  ExpressionEditorFactory,
} from './derived/ExpressionEditorTypes';

// ---- Progress reporting ----
export type {
  ProgressInfo,
  ProgressCallback,
  ProgressStage,
} from './core/Progress';

// ---- Internationalization ----
// Pass `messages: DeepPartial<Strings>` to `createDataTable` to override any
// user-facing string. `defaultStrings` holds the English defaults;
// `mergeStrings` applies overrides recursively (functions replace wholesale).
export {
  defaultStrings,
  mergeStrings,
} from './core/Strings';
export type { Strings, DeepPartial } from './core/Strings';

// ---- Stylesheet presence detection ----
// Pair the sync getter with the `warning` event (code `STYLESHEET_MISSING`):
// the getter is useful for pre-mount checks, the event for logging.
export { isStylesheetLoaded } from './core/stylesheet';

// ---- Browser feature detection ----
// Sync probe of the browser APIs the library relies on. Pair with
// `strictBrowserCheck: true` on `createDataTable` for fail-fast init.
export { checkBrowserSupport } from './core/checkBrowserSupport';
export type { BrowserSupport } from './core/checkBrowserSupport';
