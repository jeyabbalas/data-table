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

## Phases 0–6: Completed Foundation

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

---

## Phase 7: Export & Persistence

**Goal:** Enable data export and session persistence.

### Task 7.1: Implement CSV Export

Create `src/export/CSVExporter.ts`:

```typescript
export interface ExportOptions {
  scope: 'all' | 'filtered' | 'selected';
  columns: 'all' | string[];
  includeHeaders: boolean;
  delimiter: string;
  nullValue: string;
}

export async function exportToCSV(
  tableName: string,
  filters: Filter[],
  selectedRows: Set<number>,
  options: ExportOptions,
  bridge: WorkerBridge
): Promise<string> {
  // Build query based on scope
  // Stream results
  // Format as CSV
}
```

**Verification:**
- Export all data
- Export filtered data
- Export selected rows
- Delimiter configurable

### Task 7.2: Implement JSON Export

Create `src/export/JSONExporter.ts`:

```typescript
export async function exportToJSON(
  tableName: string,
  filters: Filter[],
  options: ExportOptions,
  bridge: WorkerBridge
): Promise<string> {
  // Array of objects or NDJSON
}
```

**Verification:**
- JSON array format works
- NDJSON format works

### Task 7.2b: Implement Parquet Export (Completed)

Parquet export leverages DuckDB's native `COPY (query) TO 'file.parquet' (FORMAT PARQUET)` command running entirely in the Web Worker. Unlike CSV/JSON (which build text strings on the main thread), Parquet is a binary columnar format that DuckDB writes to its virtual filesystem, then the buffer is read back and transferred to the main thread.

**Architecture:** ParquetExport builds a SELECT query → sends via `WorkerBridge.exportToBuffer()` → worker wraps in `COPY ... TO`, writes to virtual FS, reads buffer back via `db.copyFileToBuffer()`, cleans up with `db.dropFile()` → returns `Uint8Array` to main thread.

**Key files:**
- `src/export/ParquetExport.ts` — `exportToParquet()` (returns `Uint8Array`), `exportParquetFromState()`, `buildParquetQuery()`. Supports scope (all/filtered/selected). No batching needed — DuckDB handles the entire export.
- `src/export/ExportQuery.ts` — Shared query infrastructure. Added `buildSelectQuery()` (SELECT without LIMIT/OFFSET for COPY wrapping). Also contains `buildBaseQuery`, `buildSelectedRowsQuery`, `fetchAllRows`, `resolveColumns`, `isContiguousRange` shared across all exporters.
- `src/worker/types.ts` — Added `'export'` to `WorkerMessageType`, `ExportPayload` interface
- `src/worker/worker.ts` — Added `'export'` handler: COPY TO → copyFileToBuffer → dropFile → respond with buffer
- `src/data/WorkerBridge.ts` — Added `exportToBuffer(sql, format, signal?)` method

**Verification:**
- Parquet export produces valid Uint8Array
- Scope all/filtered/selected work correctly
- AbortSignal cancellation works

### Task 7.3: Implement Export UI

Create `src/export/ExportDialog.ts`:

```typescript
export class ExportDialog {
  constructor(
    private state: TableState,
    private bridge: WorkerBridge
  ) {}

  show(): void {
    // Format selection
    // Scope selection
    // Options (delimiter, etc.)
    // Export/Download buttons
  }
}
```

**Verification:**
- Dialog displays all options
- Export generates correct file
- Download triggers browser download

### Task 7.4: Implement Clipboard Copy

Create `src/export/Clipboard.ts`:

```typescript
export async function copyToClipboard(
  data: string,
  format: 'text' | 'html'
): Promise<void> {
  // Use Clipboard API
}

export async function copyRowsToClipboard(
  rows: number[],
  state: TableState,
  bridge: WorkerBridge
): Promise<void> {
  // Fetch row data
  // Format as TSV
  // Copy to clipboard
}
```

**Verification:**
- Copy works in supported browsers
- TSV format correct

### Task 7.5: IndexedDB Storage Layer

Create `src/persistence/SessionStore.ts` and `src/persistence/types.ts`.

`SessionSnapshot` interface (in `types.ts`):

```typescript
export interface SessionSnapshot {
  version: number;
  timestamp: number;
  tableName: string | null;
  filters: SerializedFilter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Record<string, HiddenColumnInfo>;
  derivedColumns: DerivedColumnDef[];  // future-proof, starts as []
}
```

`SessionStore` class:
- `open()` — opens IndexedDB `'dt-sessions'` with object store keyed on `tableName`
- `save(snapshot)`, `load(tableName)`, `delete(tableName)`, `list()`
- `close()` — cleanup
- Graceful fallback: returns null if IndexedDB unavailable

Date serialization: Wrap Date instances as `{ __date__: isoString }` for round-trip fidelity in filter values.

**Verification:**
- Unit tests for save/load round-trip, Date serialization, missing key → null, list/delete

### Task 7.6: State Serialization/Deserialization

Create `src/persistence/serialization.ts`.

- `snapshotFromState(state: TableState): SessionSnapshot` — reads signals, converts Maps to plain objects
- `restoreStateFromSnapshot(state: TableState, snapshot: SessionSnapshot): void` — sets signals, validates against current schema (skips columns that no longer exist, drops stale filter references)

**Verification:**
- Round-trip every filter type including Date ranges
- Schema mismatch handling (extra/missing columns)

### Task 7.7: Auto-Save

Create `src/persistence/AutoSave.ts`.

- Subscribes to all relevant state signals (filters, sort, columns, widths, pins, hidden info)
- Debounces saves (default 1000ms) to prevent rapid writes during drag operations
- `enable()` / `disable()` / `destroy()` lifecycle

**Verification:**
- Rapid signal changes → single debounced save

### Task 7.8: Session Restore on Load

Modify `src/core/Actions.ts` — add optional `restoreSession(store)` method.

- After `loadData()`, check `store.load(tableName)`
- If snapshot exists and schema is compatible, restore state
- Filters referencing removed columns are dropped silently
- Expose as optional: `actions.loadData(source, { sessionStore })`

**Verification:**
- Save state → reset → reload same data → verify state restored
- Stale column handling

**Public API additions for Phase 7:** Export `SessionStore`, `SessionSnapshot`, `AutoSave`, `snapshotFromState`, `restoreStateFromSnapshot` from `src/index.ts`.

---

## Phase 8: Advanced Features

**Goal:** Add undo/redo, derived columns (virtual layer), raw SQL filter API, and filter presets with JSON export. No SQL editor — out of scope for a read-only EDA/DQ library.

### Task 8.1: Undo/Redo — State History Stack

Create `src/core/UndoManager.ts`.

```typescript
export class UndoManager {
  private undoStack: StateSnapshot[] = [];
  private redoStack: StateSnapshot[] = [];
  private maxDepth: number;  // default 50

  push(snapshot: StateSnapshot): void;   // captures state before mutation, clears redo
  undo(): StateSnapshot | null;          // pops undo, pushes current to redo
  redo(): StateSnapshot | null;          // pops redo, pushes current to undo
  get canUndo(): boolean;
  get canRedo(): boolean;
  clear(): void;
}
```

`StateSnapshot` is a lightweight subset of `SessionSnapshot`: filters, sort, visibleColumns, columnOrder, columnWidths, pinnedColumns, hiddenColumnInfo. Does NOT include data/schema. Snapshots are cheap — just reading signal values.

**Verification:**
- Push/undo/redo cycle works
- Redo cleared on new push
- Stack depth limit enforced
- Empty stack returns null

### Task 8.2: Undo/Redo — Action Integration

Modify `src/core/Actions.ts`.

- Add optional `UndoManager` to constructor
- Private `captureForUndo()` helper snapshots current state before mutation
- Wrap these methods with undo capture: `addFilter`, `removeFilter`, `clearFilters`, `toggleSort`, `addToSort`, `setSort`, `clearSort`, `hideColumn`, `showColumn`, `showAllColumns`, `setColumnOrder`, `toggleColumnPin`
- Add `undo()` / `redo()` methods to `StateActions`
- `isUndoRedoOperation` flag prevents undo/redo itself from creating new undo points
- Column width changes: capture only on first call of a drag sequence (not every pixel)
- Future-proof: derived column and raw SQL filter operations will also be wrapped

**Verification:**
- Add filter → undo → filter removed. Redo → filter restored
- Multiple ops → undo twice → redo once
- New action after undo clears redo stack

### Task 8.3: Undo/Redo — Keyboard Shortcuts

Modify `src/table/TableContainer.ts`.

- `Ctrl+Z` / `Cmd+Z` → `actions.undo()`
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` → `actions.redo()`
- Only fires when focus is within table container

**Verification:**
- Simulate keydown events, verify undo/redo called

### Task 8.4: Derived Columns — Type System and State

Derived columns are a **virtual layer** over immutable source data. They enable computed expressions for EDA/DQ without modifying the original dataset.

Modify `src/core/types.ts` — extend `ColumnSchema`:

```typescript
export interface ColumnSchema {
  name: string;
  type: DataType;
  nullable: boolean;
  originalType: string;
  isDerived?: boolean;      // true for computed columns
  expression?: string;      // SQL expression (only for derived)
}
```

Create `src/derived/types.ts`:

```typescript
export interface DerivedColumnDef {
  name: string;           // column alias
  expression: string;     // DuckDB SQL expression
  type?: DataType;        // detected after creation
  originalType?: string;  // DuckDB type string
}
```

Modify `src/core/State.ts` — add to `TableState`:
- `derivedColumns: Signal<DerivedColumnDef[]>` (starts as `[]`)
- `baseTableName: Signal<string | null>` (stores original table name when a view is active)

**Verification:**
- Unit tests for state creation with new signals

### Task 8.5: Derived Columns — DuckDB Integration and CRUD

Create `src/derived/DerivedColumnManager.ts`.

**Core approach:** When derived columns exist, create a DuckDB VIEW (`__dt_view__`) that includes all base columns plus derived expressions. Switch `state.tableName` to the view name. All existing query code (`TableBody`, `ExportQuery`, visualization data fetchers, stats) already uses `state.tableName.get()` and will automatically query the view — **no changes needed in those files**.

```typescript
export class DerivedColumnManager {
  constructor(bridge: WorkerBridge, baseTableName: string);

  // Validate → detect type → recreate view → return ColumnSchema with isDerived: true
  async addColumn(def: DerivedColumnDef): Promise<ColumnSchema>;

  // Validate → recreate view with updated expression
  async updateColumn(oldName: string, def: DerivedColumnDef): Promise<ColumnSchema>;

  // Recreate view without column (or drop view if last derived column)
  async removeColumn(name: string): Promise<void>;

  // Returns view name if derived columns exist, base table otherwise
  getEffectiveTableName(): string;
}
```

Validation uses DuckDB: `SELECT (expression) AS "name" FROM base_table LIMIT 0`.
Type detection: `SELECT typeof((expression)) AS t FROM base_table LIMIT 1`.
View creation: `CREATE OR REPLACE VIEW __dt_view__ AS SELECT *, (expr1) AS "col1", (expr2) AS "col2" FROM base_table`.

Modify `src/core/Actions.ts` — add:
- `async addDerivedColumn(name, expression): Promise<{ success: boolean; error?: string }>` — validates name uniqueness against `state.schema.get()`, delegates to manager, updates `derivedColumns` signal, appends to schema/visibleColumns/columnOrder, switches `tableName` to view
- `async updateDerivedColumn(oldName, name, expression): Promise<{ success: boolean; error?: string }>` — validates, recreates view, updates schema
- `async removeDerivedColumn(name): Promise<void>` — with undo capture, removes from all state signals, reverts `tableName` to `baseTableName` if last derived column

**Verification:**
- Add column → view SQL correct, schema updated, tableName switched
- Expression validation errors returned
- Rename without name conflicts
- Delete last derived column → tableName reverts to base table
- Existing queries use view transparently

### Task 8.6: Derived Columns — UI (Visual Differentiation and Controls)

Derived columns have a distinct visual identity: italic names, formula icon, and a subtle tint on the entire column to signal the virtual layer.

Modify `src/table/ColumnHeader.ts`:
- Check `column.isDerived` during render → add `.dt-col-header--derived` class
- **Column name**: Render in italics with a small `f(x)` formula SVG icon prefix
- **Action panel for derived columns**: Replace "hide" button with "delete" button (trash icon, red on hover). Add "edit" button (pencil icon). Keep pin, sort, filter.
- Source columns: cannot be deleted, only hidden (existing behavior unchanged)
- Delete button triggers confirmation modal before calling `actions.removeDerivedColumn()`

Modify `src/table/TableBody.ts`:
- Check `isDerived` per column during cell render → apply `.dt-cell--derived` class

Create `src/derived/DerivedColumnModal.ts`:
- Modal dialog for creating/editing derived columns
- Fields: Name (text input), Expression (monospace textarea)
- "Validate" button: calls DuckDB validation, shows inferred type or error message
- "Save" button: calls `actions.addDerivedColumn()` or `actions.updateDerivedColumn()`
- Name conflict validation with real-time feedback
- Opened from: (1) column header edit button for existing, (2) a "+" button or menu action for new

Modify `src/styles/data-table.css`:

```css
.dt-col-header--derived {
  background: color-mix(in srgb, var(--dt-primary-light) 30%, var(--dt-bg-secondary));
}
.dt-col-header--derived .dt-col-name {
  font-style: italic;
}
.dt-cell--derived {
  background: color-mix(in srgb, var(--dt-primary-light) 15%, var(--dt-bg));
}
/* Dark mode handled automatically via CSS custom properties */
```

**Verification:**
- Derived columns show italic name, formula icon, subtle tint
- Edit modal validates and saves correctly
- Delete shows confirmation modal
- Source columns cannot be deleted

### Task 8.7: Derived Columns — Integration Verification

Verify (and fix if needed) that derived columns work with all existing features:

- **Visualizations**: Derived numeric columns get histograms, derived strings get value counts. `VisualizationFactory.isApplicable()` checks `column.type` — works automatically since derived `ColumnSchema` has a detected type.
- **Crossfilter**: Filters on derived columns use `quoteIdentifier(name)` against the view — works unchanged.
- **Export**: `ExportQuery.buildSelectQuery()` queries the view, includes derived columns in `columnOrder` — works unchanged.
- **Stats**: Stats queries run against view — works unchanged.
- **Expression edit**: When expression changes, trigger schema update → `TableContainer` re-renders → visualizations re-attach.
- **Persistence**: Add derived column definitions to `SessionSnapshot`. On restore, recreate view before restoring other state.
- **Demo integration**: Update `demo/main.ts` with a "New Column" button that opens `DerivedColumnModal`.

**Key files to verify:** `CrossfilterCoordinator.ts`, `VisualizationFactory.ts`, `ExportQuery.ts`, `StatsComputer.ts`, `demo/main.ts`.

**Verification:**
- Add derived column (e.g., `price * quantity AS total`) → histogram renders, filter works, export includes it
- Edit expression → visualization updates
- Persistence round-trip with derived columns

### Task 8.8: Raw SQL Filter API

A **programmatic API** (not a UI feature) for specifying complex SQL WHERE clauses that the filter panel cannot express (OR clauses, cross-column conditions). This is an escape hatch for rare complex filters, useful for downstream DQ rules validation.

**Example use case:** "If the individual is nulliparous, then age at first full-term pregnancy should be 888" → `(nulliparous = TRUE AND age_first_pregnancy != 888) OR (nulliparous = FALSE AND age_first_pregnancy = 888)` — an OR clause across columns that the current UI cannot construct.

Modify `src/filters/FilterTypes.ts` — add to the `Filter` discriminated union:

```typescript
export interface RawSQLFilter {
  type: 'raw-sql';
  column: string;     // Synthetic key: '__raw_sql_0__', '__raw_sql_1__', etc.
  sql: string;        // WHERE clause fragment (no WHERE keyword)
  label?: string;     // Human-readable label for filter chip
  id: string;         // Unique identifier
}

export type Filter = RangeFilter | PointFilter | SetFilter | NotSetFilter
  | NullFilter | PatternFilter | RawSQLFilter;
```

Why synthetic `column` keys: Current architecture keys filters by `column` (one per column via `addFilter`). Raw SQL filters are cross-column, so they use unique synthetic keys (`__raw_sql_${id}__`) to avoid collisions with real columns and to allow multiple raw SQL filters to coexist.

Modify `src/filters/FilterSQL.ts`:
- `filterToSQL()`: add `case 'raw-sql': return '(' + filter.sql + ')';`
- `filtersToWhereClause()`: raw SQL filters are **never excluded** by `excludeColumn` (they are global conditions):
  ```typescript
  const applicableFilters = excludeColumn
    ? filters.filter(f => f.type === 'raw-sql' || f.column !== excludeColumn)
    : filters;
  ```

Modify `src/filters/CrossfilterQuery.ts`:
- `splitCrossfilterFilters()`: raw SQL filters appear in both background and foreground arrays (global conditions)

Modify `src/filters/FilterChip.ts`:
- Add chip rendering for `raw-sql` type: shows label or truncated SQL

Modify `src/core/Actions.ts` — add:

```typescript
async addRawSQLFilter(
  sql: string,
  label?: string
): Promise<{ success: boolean; error?: string; filterId?: string }> {
  // 1. Validate: bridge.query(`EXPLAIN SELECT * FROM ${tableName} WHERE (${sql})`)
  // 2. If valid: create RawSQLFilter with unique id, add to filters
  // 3. Return validation result with filterId
}

removeRawSQLFilter(id: string): void {
  // Remove filter matching synthetic column key __raw_sql_${id}__
}
```

Modify `src/core/types.ts` — re-export `RawSQLFilter`.

**Verification:**
- Valid SQL → success with filterId
- Invalid SQL → error message returned
- Applied raw SQL filter → WHERE clause includes it
- Crossfilter: raw SQL filter not excluded when computing per-column background data
- Multiple raw SQL filters coexist
- Chip renders label or truncated SQL
- Removal by id works
- Export respects raw SQL filters

### Task 8.9: Filter Presets — Core Logic

Filter presets allow saving named sets of filters for reuse. The JSON export format serves as the **handoff format** for the downstream DQ rules application.

Create `src/filters/FilterPresetTypes.ts`:

```typescript
export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: SerializedFilter[];   // same serialization as persistence
  sortColumns?: SortColumn[];    // optionally capture sort state
  createdAt: number;
  updatedAt: number;
}

export interface FilterPresetCollection {
  version: number;
  presets: FilterPreset[];
}
```

Create `src/filters/FilterPresets.ts` — `FilterPresetManager` class:

```typescript
export class FilterPresetManager {
  presets: Signal<FilterPreset[]>;

  save(name: string, filters: Filter[], description?: string): FilterPreset;
  load(id: string, actions: StateActions): void;   // clears then applies
  delete(id: string): void;
  rename(id: string, newName: string): void;
  exportToJSON(): string;                           // FilterPresetCollection JSON
  importFromJSON(json: string): { imported: number; errors: string[] };
  getPresets(): FilterPreset[];
}
```

Raw SQL filters, structured filters (range, set, pattern, etc.) — all serialized with full type information. Date serialization uses the same `{ __date__: isoString }` wrapper as persistence.

**Verification:**
- Save → load round-trip (filters correctly applied)
- JSON export/import round-trip
- Import with invalid JSON → error handling
- Preset containing raw SQL filters exports correctly

### Task 8.10: Filter Presets — UI

Create `src/filters/FilterPresetPanel.ts`.

Modify `src/filters/FilterBar.ts` — add "Presets" button (bookmark icon) next to "Clear all".

`FilterPresetPanel` (dropdown panel, same pattern as `FilterPanel`):
- **Save section**: name input + "Save current filters" button (disabled when no active filters)
- **Preset list**: scrollable list with name, filter count badge, "Load" / "Delete" buttons
- **Import/Export**: "Export all" button (downloads `.json` file), "Import" button (file input)
- Closes on outside click / Escape

Modify `src/styles/data-table.css` — preset panel styles following existing `.dt-filter-panel` patterns.

**Verification:**
- Panel opens/closes correctly
- Save disabled with no active filters
- Save → preset appears in list
- Load → filters applied
- Delete with confirmation
- Export downloads JSON file
- Import adds presets

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
  8.4 Derived Types → 8.5 DuckDB Integration → 8.6 Derived UI → 8.7 Integration
  8.8 Raw SQL Filter API → 8.9 Filter Presets → 8.10 Preset UI

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
3. **8.4 → 8.5 → 8.6 → 8.7** (Derived columns — full virtual layer)
4. **8.8** (Raw SQL Filter API — enables complex filters before presets)
5. **8.9 → 8.10** (Filter presets — can serialize all filter types including raw SQL)
6. **9.1 → 9.2 → 9.3 → 9.4 → 9.5** (Polish)

---

## What Changed from Original Plan

| Original Task | Status | Rationale |
|---|---|---|
| 8.1–8.3 Undo/Redo | **Kept** | Essential for EDA workflow |
| 8.4–8.5 Filter Presets | **Kept, moved to 8.9–8.10** | Reordered after raw SQL filters so presets can serialize them |
| 8.6–8.7 Derived Columns | **Kept, expanded to 8.4–8.7** | Virtual layer with visual differentiation, edit/rename/delete |
| 8.8–8.9 SQL Editor | **Removed** | Out of scope for read-only EDA tool |
| **New: Raw SQL Filter API** | **Added as 8.8** | Programmatic escape hatch for complex cross-column filters (OR clauses) |
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

To continue implementation from Task 7.5:

1. Ensure all existing tests pass: `npm test`
2. Proceed to Task 7.5 (IndexedDB Storage Layer)
3. Complete each task in order per the dependency graph
4. Commit after each successful task
5. If stuck, break down the task further

**Remember:** Each task should be independently verifiable. Don't move to the next task until the current one is complete and tested.
