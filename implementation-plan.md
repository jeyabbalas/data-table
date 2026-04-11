# Interactive Data Table Library - Implementation Plan

## Executive Summary

A client-side TypeScript library for browser-based interactive, explorable data tables. Uses DuckDB WASM for in-browser analytics with complete privacy (no server-side processing).

**Key Architecture Decisions:**
- TypeScript with Vite bundling (ESM + UMD output)
- DuckDB WASM running in a Web Worker for non-blocking queries
- Canvas-based visualizations in column headers
- Signal/observable pattern for reactive state (`src/core/Signal.ts`)
- CSS class prefix `dt-` on all DOM elements, CSS custom properties for theming (including automatic dark mode)

---

## Phases 0–8: Completed Foundation (through Task 8.7)

Everything below is fully implemented and working. These summaries describe what exists so you understand the codebase without needing the original step-by-step instructions.

### Phase 0: Project Setup (Completed)

Established the project structure, TypeScript + Vite build config, and Vitest testing infrastructure.

**Key files:**
- `src/core/types.ts` — `DataType` union (`'integer' | 'float' | 'decimal' | 'string' | 'boolean' | 'uuid' | 'date' | 'timestamp' | 'time' | 'interval'`), `ColumnSchema` interface (`name`, `type`, `nullable`, `originalType`), `SortColumn`, and base `Filter`/`FilterType` re-exports
- `src/core/EventEmitter.ts` — Generic typed event emitter with `on()`, `off()`, `emit()`, `once()`

### Phase 1: Core Data Infrastructure (Completed)

DuckDB WASM runs in a Web Worker. A `WorkerBridge` provides async RPC from the main thread. Data loaders support CSV, JSON, and Parquet with automatic format detection, progress reporting, and cancellation.

**Key files:**
- `src/worker/worker.ts` — Web Worker entry point, routes messages to handlers
- `src/worker/duckdb.ts` — Initializes DuckDB WASM, provides `executeQuery()` and `getConnection()`
- `src/worker/loaders/csv.ts`, `json.ts`, `parquet.ts` — Format-specific loaders that create DuckDB tables
- `src/data/WorkerBridge.ts` — Main-thread RPC bridge: `initialize()`, `query<T>(sql, signal?)`, `loadData()`, `terminate()`
- `src/data/DataLoader.ts` — Unified loader: auto-detects format, routes to worker loaders, returns `{ tableName, rowCount, schema }`
- `src/core/Progress.ts` — `ProgressInfo` interface and `ProgressCallback` type

### Phase 2: Schema Detection & State Management (Completed)

Schema detection maps DuckDB native types to simplified `DataType`. Smart type inference detects dates, numbers, booleans hiding in string columns. Reactive state uses signals with computed values.

**Key files:**
- `src/data/SchemaDetector.ts` — `detectSchema(tableName, bridge)` → `ColumnSchema[]`; `mapDuckDBType()` converts DuckDB types
- `src/data/TypeInference.ts` — `inferStringColumnType()` samples values, detects patterns with 95% confidence threshold
- `src/data/PatternDetector.ts` — Detects email, URL, UUID, phone, IP patterns in string columns
- `src/core/Signal.ts` — `createSignal<T>(initial)` → `Signal<T>` with `get()`, `set()`, `subscribe()`; `computed(fn, deps)` → `Computed<T>`
- `src/core/State.ts` — `TableState` interface with signals for: `tableName`, `schema`, `totalRows`, `filters`, `filteredRows`, `filtersByColumn` (computed), `sortColumns`, `visibleColumns`, `columnOrder`, `columnWidths`, `pinnedColumns`, `selectedRows`, `hoveredRow`, `hoveredColumn`. Functions: `createTableState()`, `resetTableState()`, `initializeColumnsFromSchema()`
- `src/core/Actions.ts` — `StateActions` class with methods: `loadData()`, `addFilter()`, `removeFilter()`, `clearFilters()`, `toggleSort()`, `addToSort()`, `clearSort()`, `hideColumn()`, `showColumn()`, `setColumnOrder()`, `toggleColumnPin()`, `setColumnWidth()`, `resetColumnWidth()`, `selectRow()`, `clearSelection()`, `selectAll()`

### Phase 3: Basic Table Rendering (Completed)

Virtualized table with column headers, body rows, sorting, column resizing, and drag-and-drop column reordering. Header and body scroll are synchronized horizontally.

**Key files:**
- `src/table/TableContainer.ts` — Main container. DOM: `.dt-root > .dt-header-area > (.dt-header-scroll > .dt-header-row) + .dt-scrollbar-gutter`, then `.dt-filter-bar`, then `.dt-body-scroll > .dt-body`. Manages column headers, filter bar, table body, column reorder, scroll sync, resize observer. Subscribes to `schema`, `columnWidths`, `sortColumns`.
- `src/table/ColumnHeader.ts` — Per-column header component. DOM: `.dt-col-header > .dt-col-name-row (name + sort button + drag handle) + .dt-col-type + .dt-col-stats + .dt-col-viz`. Handles sort click (regular = cycle, Cmd/Ctrl = multi-sort), subscribes to `sortColumns` and `filtersByColumn`.
- `src/table/VirtualScroller.ts` — Fixed-row-height virtual scrolling with buffer rows
- `src/table/TableBody.ts` — Fetches visible rows from DuckDB via `buildRowQuery()` (SELECT with WHERE/ORDER BY/LIMIT/OFFSET), renders cells. Subscribes to sort, filter, and visible column changes.
- `src/table/ColumnResizer.ts` — Drag-to-resize columns, double-click to auto-fit
- `src/table/ColumnReorder.ts` — Drag-and-drop column reordering with drop indicator
- `src/styles/data-table.css` — All CSS with custom properties (`--dt-primary`, `--dt-bg`, `--dt-border`, `--dt-transition`, etc.), dark mode via `@media (prefers-color-scheme: dark)`

### Phase 4: Column Visualizations (Completed)

Interactive mini-visualizations in column headers with crossfilter coordination. Canvas-based rendering. Each visualization supports brush/click filtering, hover stats, and ghost bars for crossfilter context.

**Key files:**
- `src/visualizations/BaseVisualization.ts` — Abstract base: canvas setup, mouse interaction, `fetchData()`, `render()`, `updateFilters()`, `onFilterChange` and `onStatsChange` callbacks, `onDefaultStatsChange` callback for structured stats
- `src/visualizations/histogram/Histogram.ts` — Numeric columns. Dual-fetch: background (exclude own filter) + foreground (all filters). Brush selection creates `RangeFilter`. Ghost bars show crossfilter context.
- `src/visualizations/histogram/HistogramData.ts` — `fetchHistogramData()`, `fetchColumnStats()` (min, max, Q1, Q3, median, distinct count), `calculateOptimalBins()` (Freedman-Diaconis / Sturges), `fetchHistogramBins()`, `fetchDiscreteBins()`
- `src/visualizations/histogram/DateHistogram.ts` — Date/timestamp columns. Auto-detects temporal interval (seconds → years). Same dual-fetch + ghost bar pattern.
- `src/visualizations/histogram/TimeHistogram.ts` — Time columns. Similar to DateHistogram but for time-of-day.
- `src/visualizations/valuecounts/ValueCounts.ts` — String/boolean/UUID columns. Horizontal stacked bar. Click segments to filter. Ghost segments for crossfilter.
- `src/visualizations/VisualizationFactory.ts` — Maps column types to visualization classes. `create()`, `isApplicable()`
- `src/visualizations/CrossfilterCoordinator.ts` — Subscribes to `state.filters`, calls `updateFilters()` on all registered visualizations, updates `filteredRows` count

### Phase 5: Filtering System (Completed)

Formal filter types, SQL generation, filter bar UI with removable chips, and filter indicators on column headers.

**Key files:**
- `src/filters/FilterTypes.ts` — Discriminated union: `RangeFilter` (min/max, `maxInclusive`), `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter` (contains/starts/ends/regex)
- `src/filters/FilterSQL.ts` — `filterToSQL(filter)`, `filtersToWhereClause(filters)` (AND across filters), `formatValue()` with SQL-safe escaping
- `src/filters/FilterChip.ts` — Pill-shaped chip showing filter description + remove button
- `src/filters/FilterBar.ts` — Horizontal bar between header and body. Auto-shows/hides with `max-height` CSS transition. Shows chips for each active filter + "Clear all" button when 2+ filters. `onFilterRemove` callback for clearing visualization state.
- Column headers show a blue `box-shadow` accent bar (`.dt-col-header--filtered`) when filtered

### Demo Application

`demo/main.ts` wires everything together: file upload, `WorkerBridge` initialization, `StateActions.loadData()`, `TableContainer` creation, `VisualizationFactory.create()` per column, `CrossfilterCoordinator` for filter coordination, stats callbacks (`onStatsChange`, `onDefaultStatsChange`).

### Phase 6: Column Stats Panel and Column Header Actions (Completed)

Column headers gained a rich stats panel and an action panel with pin, hide, sort, and filter buttons. A hidden columns gutter and a manual filter creation panel round out the interactive controls.

**Stats panel** (`src/statistics/`): Replaced simple row-count line with two-line stats answering "how much data / what does it look like / anything wrong." Line 1: count + null info. Line 2: type-specific distribution (min/med/max for numerics, unique count for strings, % true for booleans, date ranges for temporals). Stats flow through visualization callbacks (`onDefaultStatsChange`) to stay synchronized with filter updates.

**Action panel**: Each column header renders a `.dt-col-action-panel` row with four buttons — pin (thumbtack), hide (eye-slash), sort (arrows, relocated from name row), and filter (funnel) — plus the drag handle. Buttons are gray by default, blue when active, following existing `--dt-arrow-default` / `--dt-primary` color scheme. State subscriptions toggle active classes and disable hide when only one column remains visible.

**Pin columns (freeze panes)**: `toggleColumnPin()` in `Actions.ts` adds/removes from `pinnedColumns` and reorders `columnOrder` so pinned columns group at the left. `TableContainer` and `TableBody` apply `position: sticky` with computed cumulative `left` offsets and z-index stacking on both header cells and body cells. A `.dt-pinned-demarcation` overlay marks the freeze boundary. FLIP animation smoothly slides columns to their new positions on pin/unpin.

**Hide/unhide columns**: `hideColumn()` records left/right visible neighbors in `state.hiddenColumnInfo` before removing from `visibleColumns`. `showColumn()` uses neighbor-aware restore logic (`computeRestoreIndex()`) — checks if both neighbors are still adjacent, falls back to closest neighbor in `columnOrder`, walks outward if both neighbors are hidden. A `HiddenColumnsGutter` at the bottom of the table shows chips for hidden columns with one-click restore and a "Show all" button. Both the filter bar and hidden gutter display labels ("Active filters" / "Hidden columns") via `.dt-gutter-label`.

**Manual filter panel**: A floating `FilterPanel` (320px, positioned below the clicked filter button) shows type-specific controls via `FilterPanelField`. Numeric: comparison dropdown + number inputs → `RangeFilter`/`PointFilter`. String: mode dropdown (contains/starts/ends/regex/exact) + text input → `PatternFilter`/`PointFilter`. Boolean: three checkboxes (true/false/null). Date/timestamp: comparison dropdown + date inputs. Time: two time inputs. UUID: contains/exact + text input. All types include a null toggle (any/is null/is not null). Filters apply on button click (with regex validation for strings, UUID format validation). Panel syncs bidirectionally with `state.filtersByColumn` — external filter changes update controls, and panel-created filters appear as chips in the FilterBar.

**Key files:**
- `src/statistics/ColumnStatsTypes.ts` — Discriminated union: `NumericColumnStats`, `CategoricalColumnStats`, `TemporalColumnStats`, `TimeColumnStats`, `IntervalColumnStats`
- `src/statistics/StatsFormatters.ts` — `formatDefaultStats()` produces two-line HTML with compact number formatting
- `src/statistics/StatsComputer.ts` — `fetchIntervalStats()` for columns without visualizations
- `src/table/ColumnHeader.ts` — Action panel with pin/hide/sort/filter buttons, state subscriptions for active states, callbacks for filter click
- `src/table/TableContainer.ts` — Sticky positioning for pinned columns (header + body), FLIP animation, lazy FilterPanel creation, HiddenColumnsGutter integration
- `src/table/TableBody.ts` — Pinned cell sticky positioning with cumulative left offsets, row element pooling
- `src/table/HiddenColumnsGutter.ts` — Bottom gutter with chips per hidden column, restore buttons, "Show all", collapse/expand transitions
- `src/core/State.ts` — `hiddenColumnInfo: Signal<Map<string, HiddenColumnInfo>>` tracking neighbors at hide time
- `src/core/Actions.ts` — Enhanced `toggleColumnPin()` with column reordering, `hideColumn()`/`showColumn()` with neighbor-aware restore via `computeRestoreIndex()`
- `src/filters/FilterPanel.ts` — Floating panel: lazy creation, toggle per column, outside-click/Escape close, bidirectional state sync
- `src/filters/FilterPanelField.ts` — Type-specific filter controls for all data types, null toggle, validation, `syncFromState()` for pre-population
- `src/filters/FilterBar.ts` — "Active filters" gutter label added, chip display with clear-all
- `src/filters/FilterChip.ts` — Pill-shaped chips with human-readable filter descriptions and remove button
- `src/styles/data-table.css` — Styles for `.dt-col-action-panel`, `.dt-col-action-btn`, pinned column sticky/demarcation, `.dt-hidden-gutter`, `.dt-filter-panel` and field controls


### Phase 7: Export & Persistence (Completed)

Data export in three formats (CSV, JSON, Parquet) with configurable scope (all/filtered/selected rows) and column selection. A modal export dialog provides format selection, scope options, and download. Clipboard copy supports TSV format. Session persistence via IndexedDB stores filter, sort, column visibility/order/width, and pin state. Debounced auto-save captures state changes. Session restore validates against current schema (drops filters referencing removed columns).

**Export architecture:** CSV and JSON export build text strings on the main thread via `fetchAllRows()` batching. Parquet export leverages DuckDB's native `COPY TO` command in the Web Worker — DuckDB writes to its virtual filesystem, the buffer is read back via `copyFileToBuffer()` and transferred to the main thread as `Uint8Array`. `ExportQuery.ts` provides shared query infrastructure (`buildSelectQuery()`, `buildBaseQuery()`, `resolveColumns()`, `isContiguousRange()`).

**Persistence architecture:** `SessionSnapshot` captures all UI state (filters with Date wrapping as `{ __date__: isoString }`, sort, columns, widths, pins, hidden info, derived column defs). `SessionStore` uses IndexedDB (`dt-sessions` database, keyed by table name) with graceful fallback. `AutoSave` subscribes to state signals with 1000ms debounce. `restoreStateFromSnapshot()` validates against current schema, silently dropping stale references.

**Key files:**
- `src/export/CSVExport.ts` — `exportToCSV()` with configurable delimiter, null value formatting
- `src/export/JSONExport.ts` — `exportToJSON()` supporting array and NDJSON formats
- `src/export/ParquetExport.ts` — `exportToParquet()` returns `Uint8Array` via DuckDB COPY TO virtual FS
- `src/export/ExportQuery.ts` — Shared query infrastructure: `buildSelectQuery()`, `buildBaseQuery()`, `fetchAllRows()`, `resolveColumns()`, `isContiguousRange()`
- `src/export/ExportDialog.ts` — Modal dialog with format/scope/options selection and download trigger
- `src/export/Clipboard.ts` — `copyToClipboard()` and `copyRowsToClipboard()` via Clipboard API
- `src/persistence/types.ts` — `SessionSnapshot` interface, `SerializedFilter` union, `SNAPSHOT_VERSION` (currently `2`)
- `src/persistence/SessionStore.ts` — IndexedDB wrapper: `open()`, `save()`, `load()`, `delete()`, `list()`, `close()`
- `src/persistence/serialization.ts` — `snapshotFromState()`, `restoreStateFromSnapshot()`, `serializeFilter()`/`deserializeFilter()` with Date wrapping
- `src/persistence/AutoSave.ts` — Debounced state persistence: `enable()`, `disable()`, `destroy()` lifecycle
- `src/worker/worker.ts` — Added `'export'` handler for Parquet COPY TO workflow
- `src/data/WorkerBridge.ts` — Added `exportToBuffer(sql, format, signal?)` for binary export

### Phase 8: Advanced Features — Undo/Redo and Derived Columns (Tasks 8.1–8.7 Completed)

**Undo/Redo (Tasks 8.1–8.3):** `UndoManager` maintains undo/redo stacks (max depth 50) of `StateSnapshot` (filters, sort, visibleColumns, columnOrder, columnWidths, pinnedColumns, hiddenColumnInfo, derivedColumns, baseTableName). `captureForUndo()` is called before mutations in `StateActions`. `undo()`/`redo()` are async — synchronous signal restore via `applySnapshot()` plus async `reconcileDerivedColumns()` when derived columns differ (destroys and recreates DuckDB VIEWs/helper tables). Per-type `filterEqual()` prevents unnecessary snapshot applications. Column width changes capture only on first call of a drag sequence. Keyboard shortcuts: `Ctrl/Cmd+Z` (undo), `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` (redo), scoped to table container focus.

**Derived Columns — Core (Tasks 8.4–8.5):** A virtual, mutable layer over the immutable source table. Two modes: (1) **Expression columns** — a DuckDB SQL expression (e.g., `price * quantity`) evaluated by DuckDB. (2) **Vector columns** — JavaScript provides a typed array of values stored in a DuckDB helper table (`__dt_vec_<name>__` with `__rowid__` for positional alignment, values inserted in batches of 1000). Both are unified in a single DuckDB VIEW (`__dt_view_<baseTableName>__`) that all existing query paths read transparently via `state.tableName`. The `DerivedColumnManager` handles VIEW creation/recreation, helper table lifecycle, expression validation (`SELECT ... LIMIT 0`), type detection (`typeof()`), and cleanup. `ColumnSchema` gained `isDerived?: boolean` and `expression?: string` fields. State additions: `derivedColumns: Signal<DerivedColumnDef[]>`, `baseTableName: Signal<string | null>`.

Derived column definitions (including vector values) are included in `StateSnapshot` and `SessionSnapshot`. Session restore recreates VIEWs and helper tables via `DerivedColumnManager.restoreColumns()`. `SNAPSHOT_VERSION` bumped to `2`. `derivedColumnsEqual()` provides shallow equality check for undo/redo optimization.

**Derived Columns — UI (Tasks 8.6–8.7):** Visual markers include an f(x) icon button before the column name, italic name text, header tint (`color-mix(in srgb, var(--dt-primary-light) 40%, var(--dt-bg-secondary))`), and cell tinting (`color-mix(in srgb, var(--dt-primary-light) 20%, var(--dt-bg))`). The action panel (pin, hide, filter, sort) is identical for derived and source columns. A `DerivedColumnEditPanel` (floating, 360px, same pattern as `FilterPanel`) opens on f(x) click for rename, expression edit, validate, update, and delete with inline confirmation. A `DerivedColumnModal` (centered, 480px, same pattern as `ExportDialog`) opens from the "+" `AddColumnButton` strip at the table's right edge for creating new columns (expression or vector mode with value count validation). Both use the `ExpressionEditor` interface with `ExpressionEditorFactory` pattern for pluggable editors.

**CodeMirror 6 SQL editor (Subtask 8.6.4):** `CodeMirrorExpressionEditor` is the default editor — SQL syntax highlighting via `@codemirror/lang-sql` with `DuckDBSQL` dialect, schema-aware column name autocomplete, DuckDB function completion from a curated static list (~200 functions in `duckdbFunctions.ts`), automatic light/dark theming via CSS custom property bridge (`theme.ts`). Uses a `Compartment` for dynamic schema updates without destroying the editor. `DefaultExpressionEditor` (plain textarea) remains as a zero-dependency fallback. Dispatches synthetic `input` events on document changes for backward compatibility.

**Integration fixes (Task 8.7):** `CrossfilterCoordinator` reads `state.tableName.get()` dynamically (no longer caches tableName from constructor). Visualizations reattach on `tableName` change. Demo sidebar derived column card removed (all management via in-table UI). Library exports consolidated. Snapshot version backward compatibility (v1 snapshots treated as having empty `derivedColumns`).

**Key files:**
- `src/core/UndoManager.ts` — `UndoManager` class with `StateSnapshot`, `captureSnapshot()`, `applySnapshot()`, `derivedColumnsEqual()`, per-type `filterEqual()`
- `src/core/Actions.ts` — `captureForUndo()` before mutations, async `undo()`/`redo()`, `reconcileDerivedColumns()`, derived column CRUD (`addDerivedColumn`, `updateDerivedColumn`, `removeDerivedColumn`, `validateExpression`, `getCompletionContext`)
- `src/core/State.ts` — Added `derivedColumns: Signal<DerivedColumnDef[]>`, `baseTableName: Signal<string | null>`
- `src/core/types.ts` — `ColumnSchema.isDerived?: boolean`, `ColumnSchema.expression?: string`
- `src/derived/types.ts` — `DerivedColumnDef` (union of `ExpressionColumnDef` | `VectorColumnDef`), `DerivedColumnInfo`, `CompletionContext`, `VectorDataType`
- `src/derived/DerivedColumnManager.ts` — DuckDB VIEW lifecycle: `addColumn()`, `updateColumn()`, `removeColumn()`, `validateExpression()`, `restoreColumns()`, `recreateView()`, vector helper table management
- `src/derived/ExpressionEditorTypes.ts` — `ExpressionEditor` interface (`getValue`, `setValue`, `focus`, `setError`, `updateCompletionContext`, `destroy`), `ExpressionEditorFactory` type
- `src/derived/DefaultExpressionEditor.ts` — Built-in textarea fallback implementing `ExpressionEditor`
- `src/derived/DerivedColumnEditPanel.ts` — Floating edit panel: rename, edit expression, validate, update, delete with inline confirmation
- `src/derived/DerivedColumnModal.ts` — Modal for new derived columns: expression/vector mode toggle, name uniqueness validation, expression validation with type preview, vector value count validation
- `src/derived/AddColumnButton.ts` — Thin vertical "+" button strip at table's right edge
- `src/sql-editor/CodeMirrorExpressionEditor.ts` — CodeMirror 6 editor: SQL highlighting, DuckDB dialect, schema-aware autocomplete via `Compartment`, CSS custom property theming
- `src/sql-editor/duckdbFunctions.ts` — Curated static list of ~200 DuckDB SQL functions for autocomplete
- `src/sql-editor/theme.ts` — `dataTableTheme` and `dataTableHighlighting` bridging `--dt-*` CSS custom properties
- `src/table/ColumnHeader.ts` — f(x) icon button for derived columns, `onDerivedIconClick` callback
- `src/table/TableContainer.ts` — Manages `DerivedColumnEditPanel`, `DerivedColumnModal`, `AddColumnButton`; mutual exclusion with `FilterPanel`; undo/redo keyboard handler; `derivedColumns` subscription for auto-closing stale edit panels
- `src/visualizations/CrossfilterCoordinator.ts` — Dynamic `state.tableName.get()` (no cached tableName)
- `src/persistence/types.ts` — `SNAPSHOT_VERSION: 2`, `derivedColumns` and `baseTableName` in snapshots
- `src/persistence/serialization.ts` — Serializes/deserializes derived column defs including vector values
- `src/persistence/AutoSave.ts` — Subscribes to `state.derivedColumns` for auto-save
- `src/styles/data-table.css` — Derived column visual styles (header/cell tint, f(x) icon, edit panel, modal, add button, CodeMirror editor/autocomplete)

---

## Phase 8 (continued): Raw SQL Filters & Filter Presets — Tasks 8.8–8.10

**Goal:** Add raw SQL filter API with expression editor UI, and filter presets with JSON export. The SQL expression editor enables power users to compose complex WHERE conditions (OR clauses, cross-column predicates) for downstream data quality rule creation.

### Task 8.8: Raw SQL Filter — Type, SQL, API, and Persistence

A new `RawSQLFilter` type integrated into the existing filter pipeline, with programmatic API methods for creating, updating, and removing SQL filters. Includes serialization for persistence, undo/redo support, and filter chip rendering.

**Use case:** A downstream data quality check app allows users to compose complex SQL conditions as DQ rules. For example, `(sex = 'male' OR age <= 18) AND (parous = TRUE)`, `(height IS NULL) OR (height < 140)`. These cross-column, disjunctive conditions cannot be expressed via the per-column filter UI. The `RawSQLFilter` type provides the foundation, and Task 8.9 adds an interactive SQL expression editor modal.

**Background context:** The filter system uses a discriminated union (`Filter` type in `src/filters/FilterTypes.ts`) with a `column: string` field on every filter. Filters are stored in `state.filters: Signal<Filter[]>` and grouped by column in `state.filtersByColumn: Computed<Map<string, Filter[]>>`. `filtersToWhereClause(filters, excludeColumn?)` in `src/filters/FilterSQL.ts` generates SQL WHERE clauses and optionally excludes one column for crossfilter visualization. `StateActions` in `src/core/Actions.ts` provides `addFilter(filter)` (replaces existing filter for the same column), `removeFilter(column)`, and `clearFilters()`. The `UndoManager` in `src/core/UndoManager.ts` captures `StateSnapshot` including `filters` (shallow-copied). `FilterChip` in `src/filters/FilterChip.ts` renders filter descriptions as removable pill-shaped chips. Serialization in `src/persistence/serialization.ts` uses `serializeFilter()`/`deserializeFilter()` for IndexedDB storage and `restoreStateFromSnapshot()` validates filters against schema column names via `validColumns.has(f.column)`.

**Design decisions:**
- Synthetic `column` keys (`__raw_sql_<id>__`) integrate with the existing column-keyed filter architecture, allowing multiple SQL filters to coexist
- SQL filters are **global** in crossfilter: never excluded by `excludeColumn`, since no real column matches the synthetic key
- Column header visualizations update automatically — ghost bars show unfiltered data, foreground shows filtered data (including SQL filter effects). No SQL parsing needed to identify referenced columns
- IDs use `crypto.randomUUID()` for stability across undo/redo and session restore

#### Files to Modify

**`src/filters/FilterTypes.ts`** — add to the discriminated union:

```typescript
export interface RawSQLFilter {
  type: 'raw-sql';
  column: string;     // Synthetic key: '__raw_sql_<id>__'
  sql: string;        // WHERE clause fragment (no WHERE keyword)
  label?: string;     // Human-readable label for filter chip
  id: string;         // Unique identifier (crypto.randomUUID())
}

export type Filter = RangeFilter | PointFilter | SetFilter | NotSetFilter
  | NullFilter | PatternFilter | RawSQLFilter;
```

Why synthetic `column` keys: Current architecture keys filters by `column` (one per column via `addFilter`). Raw SQL filters are cross-column, so they use unique synthetic keys (`__raw_sql_${id}__`) to avoid collisions with real columns and to allow multiple raw SQL filters to coexist.

**`src/filters/FilterSQL.ts`** — add SQL generation and crossfilter exclusion handling:

In `filterToSQL()`:
```typescript
case 'raw-sql':
  return '(' + filter.sql + ')';
```

In `filtersToWhereClause()` — raw SQL filters are **never excluded** by `excludeColumn` (they are global conditions):
```typescript
const applicableFilters = excludeColumn
  ? filters.filter(f => f.type === 'raw-sql' || f.column !== excludeColumn)
  : filters;
```

**`src/filters/CrossfilterQuery.ts`** — in `splitCrossfilterFilters()`, raw SQL filters appear in both background and foreground arrays (global conditions). The background filter exclusion uses `f.column !== column`, which already works correctly since synthetic keys (`__raw_sql_<id>__`) never match real column names. No code change needed here, but add a comment documenting this behavior.

**`src/filters/FilterChip.ts`** — add chip rendering for `raw-sql` type:

In `formatFilter()`, add case:
```typescript
case 'raw-sql': {
  const display = filter.label || truncateSQL(filter.sql, 40);
  return { column: 'SQL', description: display };
}
```

Add a helper `truncateSQL(sql: string, maxLen: number): string` that truncates with ellipsis.

Add visual distinction for SQL filter chips:
- Prefix with a small code icon (inline SVG, `<>` brackets or `{ }` symbol) before the "SQL" label
- The chip label span gets class `${prefix}-filter-chip-label--sql` for cursor/hover styling

Add **clickable chip body** for editing SQL filters:
- Add `onEdit?: () => void` to the `FilterChipOptions` interface
- When `onEdit` is provided, the label span gets a click handler that calls `onEdit()` and `cursor: pointer` styling
- The remove button (X) behavior is unchanged — it stops propagation so clicking X doesn't trigger edit

**`src/core/Actions.ts`** — add SQL filter API methods:

```typescript
/**
 * Add a raw SQL filter. Does NOT re-validate — caller is responsible
 * for validation (see validateSQLFilter). Creates a RawSQLFilter with
 * a unique id and synthetic column key, appends to state.filters.
 * Captures undo snapshot before mutation.
 */
addRawSQLFilter(sql: string, label?: string): string {
  // 1. Generate id via crypto.randomUUID()
  // 2. Create RawSQLFilter with column: `__raw_sql_${id}__`
  // 3. captureForUndo(), append to state.filters
  // 4. Return id
}

/**
 * Update an existing raw SQL filter's SQL and/or label.
 * Does NOT re-validate. Finds by id, replaces in state.filters.
 * Captures undo snapshot before mutation.
 */
updateRawSQLFilter(id: string, sql: string, label?: string): void {
  // 1. Find filter with matching synthetic column key `__raw_sql_${id}__`
  // 2. If not found, throw or no-op
  // 3. captureForUndo(), replace in state.filters array
}

/**
 * Remove a raw SQL filter by id.
 * Captures undo snapshot before mutation.
 */
removeRawSQLFilter(id: string): void {
  // Remove filter with column === `__raw_sql_${id}__`
}

/**
 * Get all active raw SQL filters. Convenience getter.
 */
getRawSQLFilters(): RawSQLFilter[] {
  return this.state.filters.get().filter(f => f.type === 'raw-sql') as RawSQLFilter[];
}

/**
 * Validate a SQL WHERE clause fragment. Runs the SQL against DuckDB
 * and returns validity, match count, and any error message.
 * Used by the SQL filter modal's Validate button (Task 8.9).
 */
async validateSQLFilter(sql: string): Promise<{
  valid: boolean;
  matchCount?: number;
  error?: string;
}> {
  // Run: SELECT COUNT(*) AS cnt FROM <tableName> WHERE (<sql>)
  // On success: return { valid: true, matchCount: result[0].cnt }
  // On DuckDB error: return { valid: false, error: errorMessage }
}

/**
 * Get the complete WHERE clause SQL for all active filters.
 * Convenience method for downstream apps that need the raw SQL string.
 */
getFiltersSQL(): string {
  return filtersToWhereClause(this.state.filters.get());
}
```

**`src/core/UndoManager.ts`** — add `raw-sql` case to `filterEqual()`:

```typescript
case 'raw-sql': {
  const br = b as RawSQLFilter;
  const ar = a as RawSQLFilter;
  return ar.sql === br.sql && ar.id === br.id && ar.label === br.label;
}
```

**Critical:** Without this, `filtersEqual()` returns false for identical SQL filters (the `default` case returns `false`), causing unnecessary snapshot applications and re-renders.

**`src/persistence/types.ts`** — add `RawSQLFilter` to the `SerializedFilter` union type.

**`src/persistence/serialization.ts`** — three changes:

1. In `serializeFilter()`: add `case 'raw-sql': return filter;` (no Date wrapping needed — pure strings).

2. In `deserializeFilter()`: add `case 'raw-sql': return filter;`.

3. **Critical fix** in `restoreStateFromSnapshot()` and `deserializeStateSnapshot()`: the column validation `filters.filter(f => validColumns.has(f.column))` uses schema column names in `validColumns`. SQL filters have synthetic column keys that are NOT in the schema. Fix:
```typescript
filters.filter(f => f.type === 'raw-sql' || validColumns.has(f.column))
```

Without this fix, all SQL filters are silently dropped on session restore.

**`src/core/types.ts`** — re-export `RawSQLFilter` alongside existing filter type exports.

**`src/index.ts`** — export `RawSQLFilter` type, `validateSQLFilter`, `getFiltersSQL`, `getRawSQLFilters` from the public API.

**`src/styles/data-table.css`** — add SQL filter chip styles:

```css
/* SQL filter chip — clickable label */
.dt-filter-chip-label--sql {
  cursor: pointer;
}
.dt-filter-chip-label--sql:hover {
  text-decoration: underline;
  text-decoration-color: var(--dt-primary);
}
/* SQL chip code icon */
.dt-filter-chip-sql-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 0.2rem;
  opacity: 0.7;
}
.dt-filter-chip-sql-icon svg {
  width: 12px;
  height: 12px;
}
```

**Verification:**
- Valid SQL → `addRawSQLFilter` returns filterId, filter appears in `state.filters.get()`
- `validateSQLFilter` with invalid SQL → returns `{ valid: false, error: '...' }`
- `validateSQLFilter` with valid SQL → returns `{ valid: true, matchCount: N }`
- Applied raw SQL filter → `filtersToWhereClause()` includes it wrapped in parens
- Crossfilter: raw SQL filter not excluded when computing per-column background data (verify via `filtersToWhereClause(filters, 'someColumn')` — SQL filter still present)
- Multiple raw SQL filters coexist (different ids, all ANDed)
- `updateRawSQLFilter` replaces SQL/label, table rows update
- `removeRawSQLFilter` removes by id
- Chip renders label (when present) or truncated SQL with code icon prefix
- Chip body click triggers `onEdit` callback
- Chip X button triggers removal (separate from edit)
- `getFiltersSQL()` returns complete WHERE clause including SQL filters
- `getRawSQLFilters()` returns only SQL filters
- Undo: add SQL filter → undo → filter removed → redo → filter restored
- `filterEqual()` correctly compares SQL filters (no unnecessary re-renders)
- Session persistence: save with SQL filters → reload → SQL filters restored (not dropped by column validation)
- Serialization round-trip: `serializeFilter(rawSQLFilter)` → `deserializeFilter()` → identical filter

### Task 8.9: SQL Filter Expression Editor — UI

A modal dialog with a CodeMirror SQL editor for creating and editing complex SQL filter conditions, plus filter bar modifications to make the feature accessible. Reuses the expression editor infrastructure from Task 8.6.4 (CodeMirror, theme, autocomplete).

**Use case:** Power users in the downstream DQ app need to compose complex WHERE conditions (OR clauses, cross-column predicates) interactively. The modal provides a full SQL editor with schema-aware autocomplete, validation with row-count feedback, and human-readable labeling. Applied filters show as editable chips in the filter bar.

**Background context:** The library already has a CodeMirror 6 expression editor (`src/sql-editor/CodeMirrorExpressionEditor.ts`) with SQL syntax highlighting, schema-aware autocomplete (column names + DuckDB functions from `src/sql-editor/duckdbFunctions.ts`), and automatic light/dark theming via CSS custom properties (`src/sql-editor/theme.ts`). It implements the `ExpressionEditor` interface (`src/derived/ExpressionEditorTypes.ts`) with `getValue()`, `setValue()`, `focus()`, `setError()`, `updateCompletionContext()`, `destroy()`. The `ExpressionEditorFactory` type `(container, context) => ExpressionEditor` enables pluggable editors. The `DerivedColumnModal` (`src/derived/DerivedColumnModal.ts`) is the reference modal pattern — it uses a fixed backdrop, centered dialog, Escape close (with CodeMirror autocomplete check), body scroll lock via `wheel`/`touchmove` handlers, and lazy editor creation. The `FilterBar` (`src/filters/FilterBar.ts`) renders chips in a horizontal bar with auto-show/hide via `max-height` CSS transition and a `--hidden` class. It subscribes to `state.filters` and renders `FilterChip` for each filter. The `FilterChip` (`src/filters/FilterChip.ts`) has `formatFilter()` for human-readable descriptions and an `onRemove` callback on the X button. `TableContainer` (`src/table/TableContainer.ts`) manages all panels with lazy creation and mutual exclusion (only one floating panel open at a time). The `TableContainerOptions` interface accepts `editorFactory?: ExpressionEditorFactory`.

**Prerequisite:** Task 8.8 must be completed first (provides `RawSQLFilter` type, `addRawSQLFilter`, `updateRawSQLFilter`, `removeRawSQLFilter`, `validateSQLFilter`, and clickable chip support).

**Design decisions:**
- Modal (not floating panel) because SQL expressions need space and the editor benefits from a focused context
- Reuses `CodeMirrorExpressionEditor` with a custom placeholder for WHERE conditions
- Filter bar becomes always-visible when data is loaded, showing an "Expression filter" button even when no filters exist
- SQL filter chips in the filter bar are clickable to open the modal in edit mode

#### Files to Create

**`src/filters/SQLFilterModal.ts`** — modal dialog for creating/editing SQL filters:

```typescript
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { ExpressionEditorFactory } from '../derived/ExpressionEditorTypes';

export interface SQLFilterModalOptions {
  classPrefix?: string;
  /** Custom editor factory. If omitted, uses CodeMirrorExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
}

export class SQLFilterModal {
  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: SQLFilterModalOptions
  );

  /** Open the modal in create mode (empty fields) */
  open(): void;

  /** Open the modal in edit mode (pre-populated from existing SQL filter) */
  openForEdit(filterId: string): void;

  /** Close the modal and reset form state */
  close(): void;

  /** Get the root DOM element (backdrop + dialog) for mounting */
  getElement(): HTMLElement;

  /** Whether the modal is currently visible */
  getIsOpen(): boolean;

  /** Clean up resources */
  destroy(): void;
}
```

Modal DOM structure:
```
.dt-sql-filter-modal-backdrop (fixed, inset 0, z-index 1000, display: none)
  .dt-sql-filter-modal (centered, 520px wide, role="dialog", aria-modal="true")
    .dt-sql-filter-modal-header
      span "New Expression Filter" / "Edit Expression Filter"
      button (close X, same pattern as ExportDialog/DerivedColumnModal)
    .dt-sql-filter-modal-body
      .dt-sql-filter-modal-section — Label
        label "Label (optional)"
        input.dt-filter-input placeholder="e.g., Valid age range check"
        .dt-sql-filter-modal-label-hint "A short description shown in the filter chip"
      .dt-sql-filter-modal-section — SQL Expression
        label "SQL WHERE condition"
        [CodeMirror editor via ExpressionEditorFactory or CodeMirrorExpressionEditor]
      .dt-sql-filter-modal-actions
        button.dt-sql-filter-modal-validate "Validate"
        .dt-sql-filter-modal-preview (match count or error, hidden until validated)
    .dt-sql-filter-modal-footer
      button "Cancel" (secondary style)
      button "Apply" / "Update" (primary style, disabled until validated)
```

Behavior:
- `open()` (create mode): show backdrop with `--open` class, lock scroll, reset form fields, create expression editor, focus label input. The "Apply" button is shown.
- `openForEdit(filterId)` (edit mode): find the `RawSQLFilter` by id from `state.filters.get()`. Pre-populate label input and expression editor with existing values. The "Update" button replaces "Apply". Add a danger zone section with "Remove Filter" button (with inline confirmation, same pattern as `DerivedColumnEditPanel`).
- Backdrop click (on backdrop, not dialog) closes modal.
- Escape key closes modal. **Important:** Check for open CodeMirror autocomplete tooltip (`document.querySelector('.cm-tooltip-autocomplete')`) before closing — if autocomplete is open, let Escape close it instead (same pattern as `DerivedColumnModal`).
- Scroll lock: prevent background scroll while modal is open (same `wheel`/`touchmove` handler pattern as `DerivedColumnModal`).

Validation UX:
- "Validate" button calls `actions.validateSQLFilter(sql)`.
- On success: show "N rows match" in green text in the preview area. Set internal `validated = true`.
- On failure: show DuckDB error message in red text. Call `editor.setError(errorMessage)`. Set `validated = false`.
- Any keystroke in the expression editor resets `validated = false` and disables Apply/Update (same pattern as derived column Validate → Update flow).

Apply/Update:
- **Apply** (create mode): calls `actions.addRawSQLFilter(sql, label)`. On success, close modal.
- **Update** (edit mode): calls `actions.updateRawSQLFilter(filterId, sql, label)`. On success, close modal.
- Disabled until: SQL is non-empty AND `validated === true`.

Remove (edit mode only):
- "Remove Filter" button → inline confirmation ("Are you sure?" + Confirm + Cancel, same pattern as `DerivedColumnEditPanel`).
- Confirm calls `actions.removeRawSQLFilter(filterId)`, closes modal.

**Expression editor integration:**
- The `CodeMirrorExpressionEditor` constructor gains an optional 4th parameter: `config?: { placeholder?: string }`. Default placeholder remains "Enter SQL expression, e.g. price * quantity". The `SQLFilterModal` passes `{ placeholder: 'Enter SQL WHERE condition, e.g. age > 18 AND status = \'active\'' }`.
- Completion context comes from `actions.getCompletionContext()` — column names with types and DuckDB functions (same as derived column editor).
- If a custom `editorFactory` is provided via options, it's used instead (factory signature unchanged — placeholder customization is a `CodeMirrorExpressionEditor`-specific enhancement, not a factory contract change).

#### Files to Modify

**`src/sql-editor/CodeMirrorExpressionEditor.ts`** — add optional config parameter:

In the constructor, accept `config?: { placeholder?: string }` as a 4th parameter. Use `config?.placeholder ?? 'Enter SQL expression, e.g. price * quantity'` in the CodeMirror `placeholder()` extension. This is backward-compatible — existing callers don't pass the 4th argument.

**`src/filters/FilterBar.ts`** — add always-visible mode and expression filter button:

Add to `FilterBarOptions`:
```typescript
/** When true, the filter bar is always visible (shows expression filter button even with no filters). Default: false. */
alwaysShow?: boolean;
/** Callback when the "Expression filter" button is clicked */
onAddSQLFilter?: () => void;
/** Callback when a SQL filter chip is clicked for editing */
onEditSQLFilter?: (filterId: string) => void;
```

In `createElement()`, add an "Expression filter" button after the chips container, before "Clear all":
```typescript
// Expression filter button
this.addSQLFilterBtn = document.createElement('button');
this.addSQLFilterBtn.className = `${prefix}-filter-add-sql-btn`;
this.addSQLFilterBtn.type = 'button';
this.addSQLFilterBtn.innerHTML = `<svg ...>...</svg> Expression`; // Small <> code icon + text
this.addSQLFilterBtn.title = 'Add expression filter (SQL WHERE condition)';
this.addSQLFilterBtn.addEventListener('click', () => this.options.onAddSQLFilter?.());
this.element.appendChild(this.addSQLFilterBtn);
```

The button uses a compact style: small code icon (`<>` or `{ }`) + "Expression" text, matching the existing button styles.

In `update()` (the method that shows/hides the bar based on filter count):
```typescript
private update(): void {
  const filters = this.state.filters.get();
  const hasFilters = filters.length > 0;
  
  if (this.options.alwaysShow) {
    // Never hide the bar, but adjust content visibility
    this.element.classList.remove(`${this.prefix}-filter-bar--hidden`);
    
    // Hide gutter label and clear-all when no filters
    this.gutterLabel.style.display = hasFilters ? '' : 'none';
    this.clearAllBtn.style.display = hasFilters && filters.length >= 2 ? '' : 'none';
  } else {
    // Existing behavior: hide bar when no filters
    this.element.classList.toggle(`${this.prefix}-filter-bar--hidden`, !hasFilters);
    // ... existing clear-all logic
  }
  
  // Render chips (existing logic)
  this.renderChips(filters);
}
```

In `renderChips()`, when creating chips for `raw-sql` type filters, pass the `onEdit` callback:
```typescript
if (filter.type === 'raw-sql') {
  chip = new FilterChip(filter, () => this.handleRemove(filter), {
    classPrefix: this.prefix,
    onEdit: () => this.options.onEditSQLFilter?.(filter.id),
  });
} else {
  chip = new FilterChip(filter, () => this.handleRemove(filter), {
    classPrefix: this.prefix,
  });
}
```

**`src/table/TableContainer.ts`** — manage the SQL filter modal:

Add to `TableContainerOptions`:
```typescript
/** Show "Expression filter" button in the filter bar for SQL WHERE conditions. Default: true. */
showExpressionFilter?: boolean;
```

Add private property:
```typescript
private sqlFilterModal: SQLFilterModal | null = null;
```

When creating `FilterBar` (in constructor or render), pass the new options:
```typescript
alwaysShow: this.resolvedOptions.showExpressionFilter !== false,
onAddSQLFilter: () => this.openSQLFilterModal(),
onEditSQLFilter: (id) => this.openSQLFilterModalForEdit(id),
```

Add private methods:
```typescript
private openSQLFilterModal(): void {
  // Close any open floating panels (mutual exclusion)
  if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
  if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();

  // Lazily create modal, append to document.body
  if (!this.sqlFilterModal) {
    this.sqlFilterModal = new SQLFilterModal(this.state, this.actions, {
      classPrefix: this.resolvedOptions.classPrefix,
      editorFactory: this.resolvedOptions.editorFactory,
    });
    document.body.appendChild(this.sqlFilterModal.getElement());
  }

  this.sqlFilterModal.open();
}

private openSQLFilterModalForEdit(filterId: string): void {
  // Same as above but calls openForEdit
  // ... ensure modal created ...
  this.sqlFilterModal.openForEdit(filterId);
}
```

Destroy modal in `destroy()`.

**`src/styles/data-table.css`** — add SQL filter modal and button styles:

Expression filter button in the filter bar:
```css
/* Expression filter button in filter bar */
.dt-filter-add-sql-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  font-size: var(--dt-font-size-xs);
  border: 1px dashed var(--dt-border);
  border-radius: var(--dt-radius-sm);
  background: transparent;
  color: var(--dt-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--dt-transition), color var(--dt-transition), background var(--dt-transition);
}
.dt-filter-add-sql-btn:hover {
  border-color: var(--dt-primary);
  color: var(--dt-primary);
  background: var(--dt-primary-light);
}
.dt-filter-add-sql-btn svg {
  width: 14px;
  height: 14px;
}
```

SQL filter modal (same visual pattern as DerivedColumnModal/ExportDialog):
```css
/* SQL Filter Modal */
.dt-sql-filter-modal-backdrop { /* same pattern as .dt-derived-modal-backdrop */ }
.dt-sql-filter-modal-backdrop--open { display: flex; align-items: center; justify-content: center; }
.dt-sql-filter-modal {
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.dt-sql-filter-modal-header { /* same pattern as .dt-derived-modal-header */ }
.dt-sql-filter-modal-body { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.dt-sql-filter-modal-section label {
  display: block;
  font-size: var(--dt-font-size-sm);
  color: var(--dt-text-secondary);
  margin-bottom: 0.25rem;
}
.dt-sql-filter-modal-label-hint { font-size: 11px; color: var(--dt-text-tertiary); margin-top: 0.25rem; }
.dt-sql-filter-modal-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.dt-sql-filter-modal-preview { font-size: var(--dt-font-size-sm); }
.dt-sql-filter-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--dt-border);
}
/* Validate and Apply/Update buttons reuse existing patterns (.dt-derived-edit-validate, .dt-derived-edit-update) */

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .dt-sql-filter-modal-backdrop { background: rgba(0, 0, 0, 0.6); }
  .dt-sql-filter-modal { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); }
}
```

**Verification:**
- Click "Expression" button in filter bar → modal opens centered with "New Expression Filter" title
- Modal shows label input and CodeMirror SQL editor with WHERE-specific placeholder
- Type a valid SQL condition (e.g., `age > 18 AND sex = 'male'`), click Validate → "N rows match" in green
- Type invalid SQL, click Validate → DuckDB error message in red
- Click Apply → modal closes, filter chip appears in filter bar with label or truncated SQL
- Chip shows code icon prefix and "SQL" as the column label
- Click chip body → modal re-opens in edit mode with pre-populated fields
- Click chip X → filter removed
- Edit mode: change SQL, re-validate, click Update → filter updated, table rows refresh
- Edit mode: "Remove Filter" → confirm → filter removed, modal closes
- Press Escape → modal closes (unless CodeMirror autocomplete is open)
- Click backdrop → modal closes
- Filter bar with no filters (alwaysShow): only "Expression" button visible, no gutter label or "Clear all"
- Filter bar with filters: label + chips + "Expression" button + "Clear all" all visible
- Dark mode: modal and button render correctly
- Column header histograms/value counts update when SQL filter is applied (filtered data shown)
- Undo after applying SQL filter → filter removed, table/visualizations restore previous state
- CodeMirror autocomplete shows column names and DuckDB functions (same as derived column editor)

### Task 8.10: Filter Presets — Core Logic and UI

Filter presets allow saving named sets of filters for reuse. The JSON export format serves as a **handoff format** for downstream applications (e.g., the DQ rules app). This task combines the original Tasks 8.9 (core) and 8.10 (UI) into a single task.

**Background context:** Filter serialization uses `serializeFilter()`/`deserializeFilter()` from `src/persistence/serialization.ts`. The `SerializedFilter` union type in `src/persistence/types.ts` includes all filter types (including `RawSQLFilter` added in Task 8.8). Date values in filters are wrapped as `{ __date__: isoString }` for JSON round-trip fidelity (but `RawSQLFilter` has no Dates — it's pure strings). The `FilterPanel` (`src/filters/FilterPanel.ts`) is the reference floating panel pattern — positioned relative to an anchor element via `getBoundingClientRect()`, 320px wide, outside-click/Escape close, lazy creation. The `FilterBar` (`src/filters/FilterBar.ts`) already has an "Expression" button from Task 8.9 and uses `alwaysShow` mode. The `Signal` reactive pattern from `src/core/Signal.ts` is used for the preset list. `StateActions` (`src/core/Actions.ts`) provides `addFilter()`, `removeFilter()`, `clearFilters()`, and `addRawSQLFilter()` for applying preset filters. `TableContainer` manages all panels with mutual exclusion.

**Prerequisite:** Tasks 8.8 and 8.9 must be completed first (8.8 provides RawSQLFilter serialization; 8.9 provides the filter bar modifications).

#### Files to Create

**`src/filters/FilterPresetTypes.ts`**:

```typescript
import type { SerializedFilter } from '../persistence/types';
import type { SortColumn } from '../core/types';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: SerializedFilter[];   // same serialization as persistence (includes raw-sql)
  sortColumns?: SortColumn[];    // optionally capture sort state
  createdAt: number;             // timestamp
  updatedAt: number;             // timestamp
}

export interface FilterPresetCollection {
  version: number;
  presets: FilterPreset[];
}
```

**`src/filters/FilterPresets.ts`** — `FilterPresetManager` class:

```typescript
export class FilterPresetManager {
  presets: Signal<FilterPreset[]>;

  save(name: string, filters: Filter[], description?: string): FilterPreset;
  load(id: string, actions: StateActions): void;   // clears existing, then applies preset filters
  delete(id: string): void;
  rename(id: string, newName: string): void;
  update(id: string, filters: Filter[]): void;     // update preset with current filters
  exportToJSON(): string;                           // FilterPresetCollection JSON
  importFromJSON(json: string): { imported: number; errors: string[] };
  getPresets(): FilterPreset[];
}
```

All filter types serialize correctly including `RawSQLFilter` (uses the same `serializeFilter`/`deserializeFilter` from `src/persistence/serialization.ts`).

**`src/filters/FilterPresetPanel.ts`** — dropdown panel for managing presets:

```typescript
export interface FilterPresetPanelOptions {
  classPrefix?: string;
}

export class FilterPresetPanel {
  constructor(
    private presetManager: FilterPresetManager,
    private state: TableState,
    private actions: StateActions,
    options?: FilterPresetPanelOptions
  );

  /** Toggle panel visibility */
  toggle(anchorElement: HTMLElement): void;

  /** Get the root DOM element */
  getElement(): HTMLElement;

  /** Whether panel is currently visible */
  getIsOpen(): boolean;

  /** Close the panel */
  close(): void;

  /** Clean up */
  destroy(): void;
}
```

Panel DOM structure (floating panel, same pattern as FilterPanel):
```
.dt-filter-preset-panel (position: absolute, z-index: 22, width: 320px)
  .dt-filter-preset-header
    span "Filter Presets"
    button (close X)
  .dt-filter-preset-body
    .dt-filter-preset-save-section
      input (preset name)
      textarea (optional description, 2 rows)
      button "Save Current Filters" (disabled when no active filters)
    .dt-filter-preset-divider
    .dt-filter-preset-list (scrollable, max-height: 240px)
      [for each preset:]
        .dt-filter-preset-item
          .dt-filter-preset-item-name (preset name)
          .dt-filter-preset-item-meta ("3 filters | Apr 11, 2026")
          .dt-filter-preset-item-actions
            button "Load"
            button "Delete"
    .dt-filter-preset-divider
    .dt-filter-preset-io
      button "Export All" (downloads .json)
      button "Import" (file input trigger)
      input[type=file] (hidden, accepts .json)
```

#### Files to Modify

**`src/filters/FilterBar.ts`** — add "Presets" button (bookmark icon) next to "Clear all":

```typescript
// Presets button (only shown when FilterPresetManager is provided)
if (this.options.presetManager) {
  this.presetsBtn = document.createElement('button');
  this.presetsBtn.className = `${prefix}-filter-presets-btn`;
  this.presetsBtn.innerHTML = `<svg ...>bookmark icon</svg> Presets`;
  this.presetsBtn.addEventListener('click', () => this.options.onPresetsClick?.());
  this.element.appendChild(this.presetsBtn);
}
```

Add to `FilterBarOptions`:
```typescript
presetManager?: FilterPresetManager;
onPresetsClick?: () => void;
```

**`src/table/TableContainer.ts`** — manage the preset panel:

Add optional `presetManager` to `TableContainerOptions`. When provided, pass it to FilterBar and lazily create `FilterPresetPanel`. Wire `onPresetsClick` to toggle the preset panel (mutual exclusion with other panels).

**`src/styles/data-table.css`** — preset panel and button styles following existing `.dt-filter-panel` patterns.

**`src/index.ts`** — export `FilterPresetManager`, `FilterPreset`, `FilterPresetCollection`, `FilterPresetPanel`.

**Verification:**
- Save disabled when no active filters
- Save with name → preset appears in list with filter count and date
- Load preset → clears existing filters, applies preset's filters (including raw SQL filters)
- Delete with confirmation
- Export All → downloads `.json` file with `FilterPresetCollection` format
- Import → adds presets from file (validates format, reports errors for malformed entries)
- Preset containing `RawSQLFilter` → exports correctly → imports correctly → loads correctly
- JSON format includes full filter type information (discriminated union `type` field preserved)
- Presets panel opens/closes correctly (outside click, Escape)
- Presets panel positioned below anchor button (same as FilterPanel pattern)
- Multiple presets can be saved and loaded sequentially

---

## Phase 9: Polish & Optimization

**Goal:** Performance optimization, accessibility, and keyboard navigation.

### Task 9.1: Query Caching

Create `src/data/QueryCache.ts`.

LRU cache with configurable max entries (default 100) and TTL (default 30s). Integrate into `WorkerBridge.query()` — check cache before sending to worker.

Invalidation triggers: filter change, sort change, new data load, derived column add/edit/remove.

**Verification:**
- Cache hit returns fast
- TTL expiry works
- LRU eviction works
- Invalidation clears entries

### Task 9.2: Keyboard Navigation

Modify `src/table/TableContainer.ts` and `src/table/TableBody.ts`.

Track focused cell `{ row, col }`. Arrow keys move focus. Tab moves to next cell. Home/End for first/last column. Ctrl+Home/End for first/last row. PageUp/PageDown scroll by viewport height. Scroll to row when focus leaves viewport. `.dt-cell--focused` with blue outline.

**Verification:**
- Arrow key navigation works
- Scroll-into-view on focus move

### Task 9.3: ARIA Labels and Accessibility

Modify table components for screen reader support:
- Table: `aria-rowcount`, `aria-colcount`
- Headers: `aria-colindex`, improved `aria-label` with sort/filter state
- Rows: `aria-rowindex` (absolute index)
- Cells: `aria-colindex`
- Selected rows: `aria-selected="true"`
- Add `aria-live="polite"` region announcing filter changes (e.g., "3 filters active, showing 1,234 of 5,000 rows")

**Verification:**
- Lighthouse accessibility audit
- Screen reader testing

### Task 9.4: Responsive Behavior (Nice-to-have)

CSS `@container` queries or `ResizeObserver` for narrow widths. Reduce column widths, collapse chip descriptions, hide secondary action buttons at small sizes.

**Verification:**
- Visual testing at various widths

### Task 9.5: Performance Testing

Manual benchmarks: 1M row load, scroll FPS, filter apply latency, export speed, 50-column visualization render. Identify and fix bottlenecks. Target: <100ms filter apply, 60fps scroll, <2s for 1M row load.

**Verification:**
- All performance targets met
- No memory leaks detected

---

## Task Dependency Graph

```
Phase 7 (Persistence):
  7.5 SessionStore → 7.6 Serialization → 7.7 AutoSave
                                        → 7.8 Session Restore

Phase 8 (Advanced):
  8.1 UndoManager → 8.2 Action Integration → 8.3 Keyboard Shortcuts
  8.4 Types/State/Manager → 8.5 Undo/Persistence (parallel with 8.6)
                           → 8.6 UI/Editor/Modal/CodeMirror (parallel with 8.5)
                               (8.6.1→8.6.2→8.6.3→8.6.4 CodeMirror→8.6.5 Exports)
                                                   → 8.7 Integration Fixes
  8.8 Raw SQL Filter (Type/API/Persistence) → 8.9 SQL Filter Editor UI → 8.10 Filter Presets (Core + UI)

Phase 9 (Polish):
  9.1 Query Caching    (independent)
  9.2 Keyboard Nav     (independent)
  9.3 ARIA             (after 9.2)
  9.4 Responsive       (independent, nice-to-have)
  9.5 Performance      (after all features)
```

**Recommended execution order:**
1. **7.5 → 7.6 → 7.7 → 7.8** (Persistence foundation — auto-save captures all future state additions)
2. **8.1 → 8.2 → 8.3** (Undo/redo — all subsequent features are undoable from the start)
3. **8.4 → (8.5 + 8.6 in parallel) → 8.7** (Derived columns — full virtual layer with expression + vector modes, undo/redo, CodeMirror 6 SQL editor with schema-aware autocomplete)
4. **8.8** (Raw SQL Filter — type system, API, persistence, undo/redo, chip rendering)
5. **8.9** (SQL Filter Expression Editor UI — modal with CodeMirror, filter bar always-visible mode)
6. **8.10** (Filter Presets — core logic + UI combined, serializes all filter types including raw SQL)
7. **9.1 → 9.2 → 9.3 → 9.4 → 9.5** (Polish)

---

## What Changed from Original Plan

| Original Task | Status | Rationale |
|---|---|---|
| 8.1–8.3 Undo/Redo | **Kept** | Essential for EDA workflow |
| 8.4–8.5 Filter Presets | **Kept, moved to 8.9–8.10** | Reordered after raw SQL filters so presets can serialize them |
| 8.6–8.7 Derived Columns | **Kept, expanded to 8.4–8.7** | Virtual layer with two modes (SQL expression + pre-computed vector), DuckDB VIEW mechanism, async undo/redo, visual differentiation, edit/rename/delete |
| **New: CodeMirror 6 SQL Editor** | **Added as Subtask 8.6.4** | Replaces plain textarea with CodeMirror 6 — SQL syntax highlighting, schema-aware column autocomplete, DuckDB function completion, automatic light/dark theming via CSS custom properties |
| 8.8–8.9 SQL Editor (original) | **Removed, then partially reinstated** | Original SQL editor removed as out of scope; later reinstated as SQL filter expression editor (8.9) for DQ use case |
| **New: Raw SQL Filter API** | **Added as 8.8, enhanced** | `RawSQLFilter` type with synthetic column keys, `addRawSQLFilter`/`updateRawSQLFilter`/`removeRawSQLFilter` API, `validateSQLFilter` with match count, `getFiltersSQL` convenience method. Critical fixes for undo/redo (`filterEqual`) and session restore (column validation bypass for synthetic keys). Clickable chip with `onEdit` |
| **New: SQL Filter Expression Editor UI** | **Added as 8.9** | Modal with CodeMirror SQL editor for composing complex WHERE conditions. Filter bar always-visible mode with "Expression" button. SQL filter chips clickable to edit. Supports downstream DQ rule creation |
| 8.4–8.5 Filter Presets (original) | **Kept as 8.10, combined core + UI** | Original 8.9 (preset core) + 8.10 (preset UI) combined into single task 8.10. Adjusted to serialize `RawSQLFilter` |
| 9.1 Query Caching | **Kept** | |
| 9.2 Query Batching | **Removed** | Over-engineering; DuckDB handles query execution efficiently |
| 9.3 Keyboard Nav | **Kept as 9.2** | |
| 9.4 ARIA Labels | **Kept as 9.3** | |
| 9.5 Dark Mode | **Removed** | Already implemented via CSS `@media (prefers-color-scheme: dark)` |
| 9.6 Responsive | **Kept as 9.4, downgraded** | Nice-to-have |
| 9.7 Performance Testing | **Kept as 9.5** | |
| 9.8 Integration Testing | **Merged into 9.5** | Combined with performance testing |

---

## Testing Strategy

### Unit Test Coverage Targets

| Module | Target Coverage |
|--------|-----------------|
| Core (types, events, signals) | 95% |
| Data (loaders, schema) | 90% |
| Filters (incl. raw SQL) | 95% |
| SQL Generation | 95% |
| Persistence | 90% |
| Derived Columns | 90% |
| Visualizations | 80% |
| UI Components | 70% |

### Test File Organization

```
tests/
├── unit/
│   ├── core/
│   │   ├── EventEmitter.test.ts
│   │   ├── Signal.test.ts
│   │   ├── State.test.ts
│   │   └── UndoManager.test.ts
│   ├── data/
│   │   ├── SchemaDetector.test.ts
│   │   ├── TypeInference.test.ts
│   │   ├── QueryCache.test.ts
│   │   └── loaders/
│   ├── filters/
│   │   ├── FilterSQL.test.ts
│   │   ├── FilterTypes.test.ts
│   │   ├── RawSQLFilter.test.ts
│   │   └── FilterPresets.test.ts
│   ├── derived/
│   │   ├── DerivedColumnManager.test.ts
│   │   └── DerivedColumnTypes.test.ts
│   ├── persistence/
│   │   ├── SessionStore.test.ts
│   │   └── serialization.test.ts
│   └── visualizations/
│       ├── HistogramData.test.ts
│       └── ValueCountsData.test.ts
├── integration/
│   ├── DataLoading.test.ts
│   ├── Filtering.test.ts
│   └── Export.test.ts
└── fixtures/
    ├── small.csv
    ├── types.csv
    └── large.parquet
```

---

## Definition of Done

Each task is complete when:

1. ✅ Code written and compiles without errors
2. ✅ Unit tests written and passing
3. ✅ Integration with existing code verified
4. ✅ No regressions in existing tests
5. ✅ Code reviewed (self-review checklist)
6. ✅ Committed with descriptive message

### Self-Review Checklist

- [ ] Types are correct and comprehensive
- [ ] Error cases handled gracefully
- [ ] No console.log statements left in
- [ ] Memory leaks prevented (event listeners cleaned up)
- [ ] Accessibility considered
- [ ] Performance acceptable

---

## Risk Mitigation

### High-Risk Areas

1. **DuckDB WASM Integration**
   - Risk: API changes, bundle size issues
   - Mitigation: Pin version, lazy load WASM

2. **Large File Handling**
   - Risk: Memory exhaustion, browser crashes
   - Mitigation: Streaming, memory monitoring, user warnings

3. **Canvas Visualization Performance**
   - Risk: Slow rendering on complex data
   - Mitigation: Debouncing, simplification at small sizes

4. **Cross-Browser Compatibility**
   - Risk: Web Worker, IndexedDB variations
   - Mitigation: Feature detection, fallbacks

5. **Raw SQL Filter Injection**
   - Risk: Malicious or malformed SQL in raw filters
   - Mitigation: DuckDB validation (EXPLAIN) before application; runs entirely client-side (no server exposure); wrap in parentheses

6. **Derived Column View Consistency**
   - Risk: View becomes stale or references invalid expressions
   - Mitigation: Recreate view on every change; validate expressions before adding

### Fallback Strategies

- If DuckDB WASM fails: Fall back to in-memory JavaScript processing for small files
- If IndexedDB fails: Fall back to localStorage for small state
- If Web Worker fails: Run DuckDB on main thread (with warnings)

---

## Appendix: Quick Reference

### Key Dependencies

```json
{
  "dependencies": {
    "@duckdb/duckdb-wasm": "^1.28.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### SQL Patterns

```sql
-- Histogram
SELECT 
  FLOOR(column / bin_width) * bin_width as bin_start,
  COUNT(*) as count
FROM table
WHERE [filters]
GROUP BY 1
ORDER BY 1;

-- Value counts
SELECT column, COUNT(*) as count
FROM table
WHERE [filters]
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;

-- Null count
SELECT COUNT(*) FILTER (WHERE column IS NULL) as null_count
FROM table;

-- Derived column view
CREATE OR REPLACE VIEW __dt_view__ AS
SELECT *, (expr1) AS "derived_col1", (expr2) AS "derived_col2"
FROM base_table;

-- Raw SQL filter validation
EXPLAIN SELECT * FROM table WHERE (user_provided_sql);
```

### Event Reference

```typescript
// Lifecycle
'loading:start' | 'loading:progress' | 'loading:complete' | 'loading:error'

// Data
'schema:detected' | 'schema:enhanced'

// Filtering
'filter:add' | 'filter:remove' | 'filter:clear' | 'filter:change'

// Interaction
'sort:change' | 'selection:change' | 'hover:cell' | 'hover:bar'

// Columns
'column:hide' | 'column:show' | 'column:reorder' | 'column:resize'

// Derived columns
'derived:add' | 'derived:update' | 'derived:remove'

// State
'state:save' | 'state:restore' | 'undo' | 'redo'
```

---

## Getting Started (Current)

To continue implementation from Task 8.8:

1. Ensure all existing tests pass: `npm test`
2. Proceed to Task 8.8 (Raw SQL Filter — Type, SQL, API, and Persistence)
3. Complete each task in order per the dependency graph: 8.8 → 8.9 → 8.10
4. Commit after each successful task
5. If stuck, break down the task further

**Remember:** Each task should be independently verifiable. Don't move to the next task until the current one is complete and tested.
