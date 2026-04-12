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

## Phases 0–8: Completed Foundation (through Task 8.10)

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

### Phase 8: Advanced Features (Tasks 8.1–8.10 Completed)

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

**Raw SQL Filter — Type, API, and Persistence (Task 8.8):** A `RawSQLFilter` type added to the `Filter` discriminated union enables cross-column, disjunctive WHERE conditions that cannot be expressed via the per-column filter UI. Each raw SQL filter gets a synthetic column key (`__raw_sql_<id>__` with `crypto.randomUUID()`) so multiple SQL filters coexist within the column-keyed filter architecture. `filterToSQL()` wraps the user SQL in parentheses. Raw SQL filters are global in crossfilter — never excluded by `excludeColumn` since synthetic keys never match real columns. `FilterChip` renders SQL filters with a code icon prefix, "SQL" column label, and truncated SQL (40 chars) or user-provided label; the chip body is clickable via an `onEdit` callback for inline editing. `StateActions` exposes `addRawSQLFilter(sql, label?)` (returns id), `updateRawSQLFilter(id, sql, label?)`, `removeRawSQLFilter(id)`, `getRawSQLFilters()`, `validateSQLFilter(sql, signal?)` (returns `{valid, matchCount?, error?}`), and `getFiltersSQL()` (complete WHERE clause string). `UndoManager.filterEqual()` handles the `raw-sql` case comparing `sql`, `id`, and `label`. Persistence works unchanged — `serializeFilter`/`deserializeFilter` in `SessionStore.ts` pass through without Date wrapping; column validation in `restoreStateFromSnapshot()` and `deserializeStateSnapshot()` bypasses `validColumns.has()` for `raw-sql` type filters. `RawSQLFilter` added to `SerializedFilter` union and re-exported from `core/types.ts` and `index.ts`.

**SQL Filter Expression Editor — UI (Task 8.9):** `SQLFilterModal` is a 520px centered modal with backdrop supporting two modes: create (empty fields, "Apply" button) and edit (pre-populated from existing filter, "Update" button, inline delete confirmation). Contains a label input and a CodeMirror SQL editor with WHERE-specific placeholder (`"Enter WHERE condition, e.g. age > 18 AND status = 'active'"`). Validate button runs async `validateSQLFilter()` with row count feedback, AbortSignal cancellation, and stale result prevention via version tracking; Apply/Update disabled until validated, and any keystroke resets validation. Escape closes unless CodeMirror autocomplete is open; backdrop click closes; scroll lock applied. `CodeMirrorExpressionEditor` gained an optional 4th `config?: { placeholder?: string }` parameter (backward-compatible). `FilterBar` added an `alwaysShow` mode (bar visible even with no active filters), an "Expression" button with code icon, and SQL filter chips pass `onEdit` for click-to-edit. `TableContainer` lazily creates the `SQLFilterModal`, adds `showExpressionFilter` option (default `true`), and exposes `openSQLFilterModal()`/`openSQLFilterModalForEdit()` with mutual exclusion against all other panels.

**Filter Presets — Core Logic and UI (Task 8.10):** `FilterPreset` interface (id, name, description?, filters as `SerializedFilter[]`, sortColumns?, createdAt, updatedAt) and `FilterPresetCollection` (version + presets array) define the data model and JSON handoff format for downstream apps. `FilterPresetManager` maintains a reactive Signal-based preset list with `save()` (serializes via `serializeFilter()` from `SessionStore.ts`), `load()` (deserializes and calls `actions.loadFilterPreset()` for atomic undo via `suppressUndoCapture`), `delete()`, `rename()`, `update()`, `exportToJSON()` (returns `FilterPresetCollection` JSON string), `importFromJSON()` (comprehensive validation with filter type whitelist and per-type field checks, new UUIDs for collision avoidance, returns `{imported, errors[]}`), and `loadPresets()` for session restore. `FilterPresetPanel` is a 320px floating panel anchored below a "Presets" button with save section (name + description + "Save Current Filters" disabled when no filters), scrollable preset list (max 240px, items with name/meta/description, Load + Delete with inline confirmation), and Import/Export section ("Export All" downloads `.json`, "Import" validates with status feedback auto-hiding after 4s). Reactive updates from `presetManager.presets` and `state.filters` signals; outside click and Escape close; viewport clamping. `FilterBar` shows a "Presets" button with bookmark icon when a `presetManager` is provided. `AutoSave` subscribes to `presetManager.presets`, includes presets in session snapshots via `snapshotFromState()`, and restores them via `presetManager.loadPresets()` in `restoreStateFromSnapshot()`.

**Key files (Tasks 8.8–8.10):**
- `src/filters/FilterTypes.ts` — `RawSQLFilter` interface added to `Filter` discriminated union; re-exported from `core/types.ts` and `index.ts`
- `src/filters/FilterSQL.ts` — `filterToSQL()` raw-sql case (parenthesized SQL); `filtersToWhereClause()` never excludes raw SQL filters by column
- `src/filters/CrossfilterQuery.ts` — Documented that synthetic keys naturally never match real columns in crossfilter exclusion
- `src/filters/FilterChip.ts` — SQL filter chip rendering (code icon, "SQL" label, truncated SQL, `onEdit` callback for clickable chips)
- `src/filters/FilterBar.ts` — `alwaysShow` mode, "Expression" button with code icon, "Presets" button with bookmark icon, SQL filter chip `onEdit` wiring
- `src/filters/SQLFilterModal.ts` — Modal for create/edit SQL filters: CodeMirror editor, async validation with match count, stale result prevention, scroll lock
- `src/filters/FilterPresetTypes.ts` — `FilterPreset`, `FilterPresetCollection` interfaces
- `src/filters/FilterPresets.ts` — `FilterPresetManager`: reactive Signal-based preset CRUD, `exportToJSON()`/`importFromJSON()` with comprehensive validation
- `src/filters/FilterPresetPanel.ts` — Floating panel: save/load/delete presets, import/export JSON, inline delete confirmation, viewport clamping
- `src/core/Actions.ts` — `addRawSQLFilter()`, `updateRawSQLFilter()`, `removeRawSQLFilter()`, `getRawSQLFilters()`, `validateSQLFilter()`, `getFiltersSQL()`, `loadFilterPreset()`
- `src/core/UndoManager.ts` — `filterEqual()` raw-sql case comparing sql, id, label
- `src/sql-editor/CodeMirrorExpressionEditor.ts` — Added optional `config?: { placeholder?: string }` parameter
- `src/table/TableContainer.ts` — Lazy `SQLFilterModal` and `FilterPresetPanel` creation, mutual exclusion, `showExpressionFilter` and `presetManager` options
- `src/persistence/SessionStore.ts` — `serializeFilter()`/`deserializeFilter()` pass through raw-sql unchanged
- `src/persistence/serialization.ts` — Column validation bypass for `raw-sql` filters in `restoreStateFromSnapshot()` and `deserializeStateSnapshot()`
- `src/persistence/AutoSave.ts` — Subscribes to `presetManager.presets` signal; presets in session snapshots
- `src/styles/data-table.css` — SQL filter modal, filter bar always-show, expression/presets buttons, preset panel, import/export styling

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
4. **8.8** (Raw SQL Filter — type system, API, persistence, undo/redo, chip rendering) ✅
5. **8.9** (SQL Filter Expression Editor UI — modal with CodeMirror, filter bar always-visible mode) ✅
6. **8.10** (Filter Presets — core logic + UI combined, serializes all filter types including raw SQL) ✅
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
| **New: Raw SQL Filter API** | **Added as 8.8, completed** | `RawSQLFilter` type with synthetic column keys, `addRawSQLFilter`/`updateRawSQLFilter`/`removeRawSQLFilter` API, `validateSQLFilter` with match count, `getFiltersSQL` convenience method. Critical fixes for undo/redo (`filterEqual`) and session restore (column validation bypass for synthetic keys). Clickable chip with `onEdit` |
| **New: SQL Filter Expression Editor UI** | **Added as 8.9, completed** | Modal with CodeMirror SQL editor for composing complex WHERE conditions. Filter bar always-visible mode with "Expression" button. SQL filter chips clickable to edit. Supports downstream DQ rule creation |
| 8.4–8.5 Filter Presets (original) | **Kept as 8.10, completed** | Original 8.9 (preset core) + 8.10 (preset UI) combined into single task 8.10. Serializes all filter types including `RawSQLFilter` |
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
