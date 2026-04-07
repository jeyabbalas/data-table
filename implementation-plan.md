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

### Task 8.4: Derived Columns — Types, State, DuckDB Manager, and Actions

Derived columns are a **virtual, mutable layer** over the immutable source data table for EDA/DQ. Two modes of derived column creation are supported:

1. **SQL expression columns**: A DuckDB SQL expression referencing existing columns (e.g., `price * quantity`). DuckDB evaluates the expression.
2. **Pre-computed vector columns**: JavaScript provides a typed array of values (e.g., `[0.1, 0.5, 0.3, ...]`). Values are stored in a DuckDB helper table.

Both modes ultimately live in a single DuckDB VIEW that all existing query paths read transparently.

**Core mechanism:** When derived columns exist, `DerivedColumnManager` creates a DuckDB VIEW (`__dt_view_<baseTableName>__`) that includes all base columns plus derived columns. `state.tableName` is switched to the VIEW name. All existing query code (`TableBody.buildRowQuery()`, `ExportQuery.buildSelectQuery()`, visualization data fetchers in `HistogramData.ts`/`ValueCounts.ts`, stats queries) already reads `state.tableName.get()` and passes it through `quoteIdentifier()` — they will automatically query the VIEW with **no changes needed** in those files.

#### Files to Create

**`src/derived/types.ts`**:

```typescript
import type { DataType } from '../core/types';

/** Discriminant for derived column kind */
export type DerivedColumnKind = 'expression' | 'vector';

/** Supported types for pre-computed vector data */
export type VectorDataType = 'integer' | 'float' | 'string' | 'boolean';

/** SQL expression column — DuckDB evaluates the expression */
export interface ExpressionColumnDef {
  kind: 'expression';
  name: string;           // column alias (must be unique across all columns)
  expression: string;     // DuckDB SQL expression, e.g. "price * quantity"
}

/** Pre-computed vector column — values provided by JavaScript */
export interface VectorColumnDef {
  kind: 'vector';
  name: string;           // column alias (must be unique across all columns)
  vectorType: VectorDataType;
  values: number[] | string[] | boolean[];
}

/** Union of both derived column kinds */
export type DerivedColumnDef = ExpressionColumnDef | VectorColumnDef;

/** Runtime metadata after adding a column — extends the def with detected DuckDB info */
export interface DerivedColumnInfo {
  def: DerivedColumnDef;
  detectedType: DataType;
  detectedOriginalType: string; // DuckDB type string, e.g. "DOUBLE", "VARCHAR"
}

/**
 * Completion context exposed for expression editor autocompletion.
 * Downstream apps can use this with CodeMirror or similar editors.
 */
export interface CompletionContext {
  columns: Array<{ name: string; type: string; isDerived: boolean }>;
  /** DuckDB function names (optional, can be populated lazily) */
  functions?: string[];
}
```

**`src/derived/DerivedColumnManager.ts`** — handles all DuckDB operations for derived columns:

```typescript
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnSchema, DataType } from '../core/types';
import type { DerivedColumnDef, DerivedColumnInfo, VectorColumnDef, CompletionContext } from './types';
import { quoteIdentifier } from '../filters/FilterSQL';
import { mapDuckDBType } from '../data/SchemaDetector';

export class DerivedColumnManager {
  /** Current derived columns in order */
  private columns: DerivedColumnInfo[] = [];
  /** VIEW name used when derived columns exist */
  private readonly viewName: string;

  constructor(
    private bridge: WorkerBridge,
    private baseTableName: string
  ) {
    this.viewName = `__dt_view_${baseTableName}__`;
  }

  // --- Public API ---

  /** Returns VIEW name if derived columns exist, base table name otherwise */
  getEffectiveTableName(): string;

  /** Returns current derived column info list */
  getColumns(): DerivedColumnInfo[];

  /**
   * Add a derived column. Validates expression (or creates helper table for vectors),
   * detects type via DuckDB, recreates VIEW, returns ColumnSchema with isDerived: true.
   */
  async addColumn(def: DerivedColumnDef): Promise<ColumnSchema>;

  /**
   * Update a derived column's expression/name/values.
   * Validates, recreates VIEW (and helper table if vector). Returns updated ColumnSchema.
   */
  async updateColumn(oldName: string, def: DerivedColumnDef): Promise<ColumnSchema>;

  /**
   * Remove a derived column. Drops helper table if vector.
   * Recreates VIEW without column, or drops VIEW entirely if last derived column.
   */
  async removeColumn(name: string): Promise<void>;

  /**
   * Validate an expression without adding it. For UI preview/validation button.
   * Returns { valid, type?, originalType?, error? }
   */
  async validateExpression(expression: string, alias?: string): Promise<{
    valid: boolean;
    type?: DataType;
    originalType?: string;
    error?: string;
  }>;

  /**
   * Build completion context for editor autocompletion.
   * Lists all base + derived column names with types.
   */
  getCompletionContext(baseSchema: ColumnSchema[]): CompletionContext;

  /**
   * Recreate all derived columns from saved definitions (for session restore / undo).
   * Creates helper tables for vectors, then creates VIEW. Returns ColumnSchema[] in order.
   * Throws on first failure.
   */
  async restoreColumns(defs: DerivedColumnDef[]): Promise<ColumnSchema[]>;

  /** Clean up: drop VIEW, drop all helper tables */
  async destroy(): Promise<void>;

  // --- Private implementation ---

  /** Validate expression: SELECT (<expr>) AS "<alias>" FROM "<base>" LIMIT 0 */
  private async validateExpressionSQL(expression: string, alias: string): Promise<void>;

  /** Detect type: SELECT typeof((<expr>)) AS t FROM "<base>" LIMIT 1, then mapDuckDBType() */
  private async detectType(expression: string): Promise<{ type: DataType; originalType: string }>;

  /** Create helper table __dt_vec_<name>__ with (__rowid__ BIGINT, "<col>" <TYPE>) and INSERT values in batches of 1000 */
  private async createVectorHelperTable(def: VectorColumnDef): Promise<void>;

  /** DROP TABLE IF EXISTS for a vector column's helper table */
  private async dropVectorHelperTable(name: string): Promise<void>;

  /** Helper table name for a given column: __dt_vec_<sanitizedName>__ */
  private helperTableName(columnName: string): string;

  /** Map VectorDataType to DuckDB type string */
  private vectorTypeToDuckDBType(vt: VectorDataType): string;

  /**
   * Recreate the VIEW from current columns list.
   * Expression columns contribute `(<expr>) AS "<name>"` in the SELECT list.
   * Vector columns contribute a LEFT JOIN with the helper table and `h<n>."<name>"` in the SELECT list.
   */
  private async recreateView(): Promise<void>;

  /** DROP VIEW IF EXISTS */
  private async dropView(): Promise<void>;
}
```

**VIEW SQL pattern** — the `recreateView()` method builds SQL like:

```sql
CREATE OR REPLACE VIEW "__dt_view_table_1__" AS
  SELECT t.*,
    (price * quantity) AS "total",         -- expression column (inline in SELECT)
    h1."score"                             -- vector column (from helper table JOIN)
  FROM "table_1" t
    LEFT JOIN "__dt_vec_score__" h1 ON t.rowid = h1.__rowid__
```

**Vector helper tables**: Each vector column gets its own helper table `__dt_vec_<sanitizedName>__` with columns `(__rowid__ BIGINT, "<colName>" <TYPE>)`. The `createVectorHelperTable()` method: (1) drops existing table, (2) creates table with schema, (3) inserts values in batches of 1000 rows using `INSERT INTO ... VALUES (0, val0), (1, val1), ...`. String values must be SQL-escaped. The VIEW JOINs on DuckDB's implicit `rowid` pseudo-column for positional alignment — this is safe because the source data table is immutable.

**Validation**: `SELECT (<expr>) AS "__test__" FROM "<baseTable>" LIMIT 0` — if DuckDB throws, the error message is returned to the UI.

**Type detection**: `SELECT typeof((<expr>)) AS t FROM "<baseTable>" LIMIT 1` — result mapped through `mapDuckDBType()` from `src/data/SchemaDetector.ts`.

#### Files to Modify

**`src/core/types.ts`** — extend `ColumnSchema`:

```typescript
export interface ColumnSchema {
  name: string;
  type: DataType;
  nullable: boolean;
  originalType: string;
  isDerived?: boolean;      // true for derived columns (expression or vector)
  expression?: string;      // SQL expression (expression columns only, not set for vectors)
}
```

**`src/core/State.ts`** — add two signals to `TableState` interface:

```typescript
/** Derived column definitions (expression + vector), ordered */
derivedColumns: Signal<DerivedColumnDef[]>;
/** Original table name before VIEW was created (null when no derived columns exist yet) */
baseTableName: Signal<string | null>;
```

Add to `createTableState()`: `derivedColumns: createSignal<DerivedColumnDef[]>([])` and `baseTableName: createSignal<string | null>(null)`.

Add to `resetTableState()`: `state.derivedColumns.set([])` and `state.baseTableName.set(null)`.

**`src/core/Actions.ts`** — store `bridge` as a property (currently only passed to `new DataLoader(bridge)`, but derived column operations need direct access). Add `private derivedManager: DerivedColumnManager | null = null`.

Add these public methods:

```typescript
/**
 * Add a derived column (expression or vector).
 * 1. Validates name uniqueness against state.schema.get()
 * 2. Delegates to DerivedColumnManager (validates expression / creates helper table, recreates VIEW)
 * 3. Updates state signals: derivedColumns, schema (append), visibleColumns (append), columnOrder (append), columnWidths (set default)
 * 4. Switches state.tableName to VIEW name
 * Calls captureForUndo() before mutating state.
 */
async addDerivedColumn(def: DerivedColumnDef): Promise<{ success: boolean; error?: string }>;

/**
 * Update a derived column's expression, name, or values.
 * 1. Validates new name uniqueness (excluding self if renaming)
 * 2. Delegates to DerivedColumnManager
 * 3. If renamed: updates all references in filters, sortColumns, visibleColumns, columnOrder, columnWidths, pinnedColumns, hiddenColumnInfo
 * 4. If type changed: removes stale filters for that column and triggers onFilterRemoveCallback
 * 5. Updates schema and derivedColumns signals
 * Calls captureForUndo() before mutating state.
 */
async updateDerivedColumn(
  oldName: string,
  def: DerivedColumnDef
): Promise<{ success: boolean; error?: string }>;

/**
 * Remove a derived column.
 * 1. Cleans up: removes filters referencing this column, removes from sortColumns,
 *    removes from pinnedColumns, removes from hiddenColumnInfo
 * 2. Removes from derivedColumns, schema, visibleColumns, columnOrder, columnWidths
 * 3. Delegates to DerivedColumnManager (drops helper table if vector, recreates/drops VIEW)
 * 4. If last derived column: reverts state.tableName to state.baseTableName
 * Calls captureForUndo() before mutating state. Triggers onFilterRemoveCallback if filters were removed.
 */
async removeDerivedColumn(name: string): Promise<void>;

/**
 * Validate an expression without adding it. For UI preview.
 * Returns { valid, type?, originalType?, error? }
 */
async validateExpression(expression: string): Promise<{
  valid: boolean;
  type?: DataType;
  originalType?: string;
  error?: string;
}>;

/**
 * Get completion context for expression editor autocompletion.
 * Returns column names with types and isDerived flag.
 */
getCompletionContext(): CompletionContext;
```

Modify `loadData()` — after loading data, initialize derived column state:
- `this.state.baseTableName.set(result.tableName)` — store original table name
- `this.state.derivedColumns.set([])` — reset derived columns
- `this.derivedManager = null` — reset manager for new data

The `ensureDerivedManager()` private method lazily creates `new DerivedColumnManager(this.bridge, baseTableName)`.

**Verification:**
- Add expression column → VIEW SQL correct, schema updated, tableName switched to VIEW
- Add vector column → helper table created with correct values, VIEW JOINs correctly
- Query through VIEW returns correct results for both column types
- Validation errors returned for bad SQL expressions
- Name conflict rejected (against both source and existing derived columns)
- Rename updates all state references (filters, sorts, pins, etc.)
- Delete cleans up filters/sorts/pins for deleted column
- Delete last derived column → VIEW dropped, tableName reverts to base table
- Type change on edit → stale filters removed for that column

### Task 8.5: Derived Columns — Undo/Redo and Persistence

Extends the undo/redo system to support derived column operations and updates persistence to include derived column definitions (including vector values).

**Background context:** The current undo system is **synchronous**. `StateSnapshot` (in `src/core/UndoManager.ts`) captures signal values. `captureSnapshot()` and `applySnapshot()` are sync functions. `StateActions.undo()` returns `boolean`. But derived column operations require async DuckDB VIEW recreation when restoring a snapshot with different derived columns. This task makes undo/redo **partially async**.

**Design strategy:** Keep `applySnapshot()` synchronous for signal-level state (fast UI update). Add an async `reconcileDerivedColumns()` step that the caller (`undo()`/`redo()` in Actions) invokes after `applySnapshot()` when derived columns differ from the pre-undo state.

#### Files to Modify

**`src/core/UndoManager.ts`** — extend `StateSnapshot`:

```typescript
export interface StateSnapshot {
  filters: Filter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Map<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Map<string, HiddenColumnInfo>;
  derivedColumns: DerivedColumnDef[];    // NEW — deep copy of definitions
  baseTableName: string | null;          // NEW — original table name
}
```

Update `captureSnapshot()` to deep-copy `derivedColumns` (including vector `values` arrays):
```typescript
derivedColumns: state.derivedColumns.get().map(d => {
  if (d.kind === 'vector') return { ...d, values: [...d.values] };
  return { ...d };
}),
baseTableName: state.baseTableName.get(),
```

Update `applySnapshot()` to restore `derivedColumns` and `baseTableName` signals synchronously. **Important:** `applySnapshot()` does NOT set `state.tableName` — that is set by the caller after async VIEW reconciliation. This prevents queries from firing against a non-existent VIEW.

Add a helper function:
```typescript
/** Shallow equality check for derived column lists (by name, kind, expression/values.length) */
export function derivedColumnsEqual(a: DerivedColumnDef[], b: DerivedColumnDef[]): boolean;
```

**`src/core/Actions.ts`** — change `undo()` and `redo()` from sync to async:

```typescript
async undo(): Promise<boolean> {
  if (!this.undoManager?.canUndo) return false;
  this.suppressUndoCapture = true;
  try {
    const prevDerived = this.state.derivedColumns.get();
    const current = captureSnapshot(this.state);
    const snapshot = this.undoManager.undo(current);
    if (!snapshot) return false;

    applySnapshot(this.state, snapshot);  // sync: signals updated immediately
    // ... notify removed filters ...

    if (!derivedColumnsEqual(prevDerived, snapshot.derivedColumns)) {
      await this.reconcileDerivedColumns(snapshot);  // async: DuckDB VIEW recreation
    } else {
      // tableName unchanged, set it based on current derived state
      this.state.tableName.set(
        snapshot.derivedColumns.length > 0
          ? this.ensureDerivedManager().getEffectiveTableName()
          : snapshot.baseTableName
      );
    }
    return true;
  } finally {
    this.suppressUndoCapture = false;
  }
}
// redo() follows the same pattern
```

Add private `reconcileDerivedColumns()`:
```typescript
/**
 * Reconcile DuckDB VIEW state after undo/redo changes derived columns.
 * 1. Destroys existing DerivedColumnManager (drops VIEW + helper tables)
 * 2. If snapshot has no derived columns: reverts tableName to baseTableName
 * 3. Otherwise: creates new manager, calls restoreColumns(), updates schema, sets tableName to VIEW
 */
private async reconcileDerivedColumns(snapshot: StateSnapshot): Promise<void>;
```

**Backward compatibility:** Existing callers of `undo()` and `redo()` — the keyboard handler in `TableContainer.ts` and button handler in `demo/main.ts` — do not use the return value, so changing from `boolean` to `Promise<boolean>` is safe (returning a Promise where the caller expects void is a no-op).

**`src/persistence/types.ts`**:
- Replace the stub `DerivedColumnDef` with a re-export: `export type { DerivedColumnDef } from '../derived/types';`
- Also export `ExpressionColumnDef`, `VectorColumnDef` from `../derived/types`
- Add `derivedColumns` and `baseTableName` fields to `SerializedStateSnapshot`
- Bump `SNAPSHOT_VERSION` to `2`

**`src/persistence/serialization.ts`**:
- Update `snapshotFromState()` to include `derivedColumns` with full vector values (the user confirmed vectors should be persisted)
- Update `serializeStateSnapshot()` / `deserializeStateSnapshot()` to handle `derivedColumns` and `baseTableName`
- Update `restoreStateFromSnapshot()` to set `derivedColumns` and `baseTableName` signals

**`src/core/Actions.ts`** — update `loadData()` session restore flow:

After `restoreStateFromSnapshot()`, if `snapshot.derivedColumns.length > 0`:
1. Create `DerivedColumnManager` via `ensureDerivedManager()`
2. Call `manager.restoreColumns(this.state.derivedColumns.get())` to recreate VIEW + helper tables
3. Append restored `ColumnSchema[]` (with `isDerived: true`) to `state.schema`
4. Switch `state.tableName` to `manager.getEffectiveTableName()`
5. On failure: log error, clear `derivedColumns`, stay on base table (graceful degradation)

**`src/persistence/AutoSave.ts`**:
- Add `this.state.derivedColumns` to the list of signals that trigger auto-save

**Verification:**
- Undo/redo with no derived columns remains fast (no DuckDB call — `derivedColumnsEqual` short-circuits)
- Add expression column → undo → column removed, VIEW dropped, tableName reverts to base
- Add expression column → undo → redo → column re-added, VIEW recreated
- Add vector column → undo → helper table dropped → redo → helper table recreated
- Sequence: add col A, add col B, undo twice, redo once → correct intermediate states
- Session persistence round-trip with expression column: expression restored, VIEW recreated on reload
- Session persistence round-trip with vector column: values array stored in IndexedDB and restored
- Undo stack itself persists: page reload → undo/redo history includes derived column operations

### Task 8.6: Derived Columns — UI

Visual differentiation and interactive management for derived columns, split into four incremental subtasks. **Design principles:** (1) The action panel (pin, hide, filter, sort, drag-handle) is **identical** for all columns — derived columns can be hidden, pinned, filtered, and sorted just like source columns. (2) A clickable **f(x) icon** before the column name opens a floating edit panel for modifying existing derived columns. (3) A full-height **"+" button strip** at the table's right edge opens a modal for creating new derived columns. (4) **Cell tinting** covers the entire cell including padding.

Dependency chain: **8.6.1 → 8.6.2 → 8.6.3 → 8.6.4**. Each subtask produces independently testable results.

#### Subtask 8.6.1: Visual Markers and Cell Tinting

CSS and minimal DOM changes to make derived columns visually distinct. No new interactions. Produces immediate testable results.

**Background context:** The codebase uses vanilla DOM (no framework). UI components follow a `constructor → createElement() → attachEventListeners → subscribeToState → destroy()` lifecycle. CSS classes use the `dt-` prefix (configurable via `classPrefix`). State changes use signals from `src/core/Signal.ts`. The `ColumnSchema` interface (in `src/core/types.ts`) has `isDerived?: boolean` set to `true` for derived columns (added in Task 8.4). Cell rendering happens in `TableBody.updateRowContent()` which iterates over columns and applies styles per cell.

**Files to modify:**

**`src/table/ColumnHeader.ts`** — add derived column visual markers:

In `createElement()` (lines 99-232), after creating `nameRow` and `nameEl` (around line 126-130), check `this.column.isDerived`:
- If true:
  - Add `${this.classPrefix}-col-header--derived` class to the root `el` element
  - Create a `<button>` element with class `${prefix}-derived-icon-btn`, containing an f(x) SVG inside a circle. Insert it into `nameRow` **BEFORE** `nameEl`.
  - Set `nameEl.style.fontStyle = 'italic'`
  - Store reference as `this.derivedIconBtn: HTMLElement | null` as a class property (the click handler will be added in Subtask 8.6.2)
- If false: no changes (existing behavior)

The f(x) icon SVG:
```html
<button class="${prefix}-derived-icon-btn" type="button" aria-label="Edit derived column" title="Edit derived column">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <text x="4" y="16.5" font-size="12" font-style="italic" font-family="Georgia, serif" fill="currentColor">f</text>
    <text x="11" y="14" font-size="8" font-family="Georgia, serif" fill="currentColor">(x)</text>
  </svg>
</button>
```

The button is **non-interactive in this subtask** — no click handler yet. It will be wired in Subtask 8.6.2.

**The action panel is NOT modified.** Pin, hide, filter, sort, and drag-handle buttons remain identical for all columns including derived ones.

**`src/table/TableBody.ts`** — add derived cell tinting:

In `updateRowContent()` (around line 569-621), **after** the pinned cell styling logic (after line ~617) and before `this.cellRenderer.render()`, check the column's `isDerived` flag:

```typescript
// Apply derived cell styling (after pinned logic so both classes can coexist)
if (colSchema?.isDerived) {
  cellEl.classList.add(`${this.classPrefix}-cell--derived`);
} else {
  cellEl.classList.remove(`${this.classPrefix}-cell--derived`);
}
```

The `colSchema` is already available from `schemaMap.get(colName)` on line ~597.

**`src/styles/data-table.css`** — add derived column visual styles after the column action panel section (after ~line 649):

```css
/* === Derived Column Visual Identity === */

/* Header tint */
.dt-col-header--derived {
  background: color-mix(in srgb, var(--dt-primary-light) 40%, var(--dt-bg-secondary));
}

/* f(x) icon button in column name row */
.dt-derived-icon-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 4px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: var(--dt-primary);
  transition: background var(--dt-transition), color var(--dt-transition);
}
.dt-derived-icon-btn:hover {
  background: var(--dt-primary-light);
  color: var(--dt-primary-hover);
}

/* Derived column cell tinting — background-color on the cell element
   covers the entire cell including 0.75rem padding, since CSS padding
   is inside the element's background painting area. */
.dt-cell--derived {
  background-color: color-mix(in srgb, var(--dt-primary-light) 20%, var(--dt-bg));
}
/* Hover state */
.dt-row:hover .dt-cell--derived,
.dt-row--hover .dt-cell--derived {
  background-color: color-mix(in srgb, var(--dt-primary-light) 15%, var(--dt-bg-secondary));
}
/* Selected state */
.dt-row--selected .dt-cell--derived {
  background-color: color-mix(in srgb, var(--dt-primary-light) 50%, var(--dt-primary-light));
}
.dt-row--selected:hover .dt-cell--derived,
.dt-row--selected.dt-row--hover .dt-cell--derived {
  background-color: var(--dt-primary-lighter);
}
/* Derived + pinned combined */
.dt-cell--derived.dt-cell--pinned {
  background-color: color-mix(in srgb, var(--dt-primary-light) 20%, var(--dt-bg));
}
.dt-row:hover .dt-cell--derived.dt-cell--pinned,
.dt-row--hover .dt-cell--derived.dt-cell--pinned {
  background-color: color-mix(in srgb, var(--dt-primary-light) 15%, var(--dt-bg-secondary));
}
```

Note: `color-mix()` with existing CSS custom properties (`--dt-primary-light` is `#eff6ff` in light mode, `#1e3a5f` in dark mode) handles dark mode tints automatically without separate `@media (prefers-color-scheme: dark)` rules.

**Unit tests** (create `tests/derived/DerivedColumnVisuals.test.ts`):
- ColumnHeader with `isDerived: true` in schema adds `.dt-col-header--derived` class to root element
- ColumnHeader with `isDerived: true` creates a `.dt-derived-icon-btn` element in the name row, before the column name
- ColumnHeader with `isDerived: true` sets `fontStyle: 'italic'` on the column name element
- ColumnHeader with `isDerived: false` does NOT add `.dt-col-header--derived` or `.dt-derived-icon-btn`
- Action panel contains identical buttons (pin, hide, filter, sort, drag) for both `isDerived: true` and `isDerived: false` columns
- TableBody `updateRowContent()` adds `.dt-cell--derived` class to cells of columns with `isDerived: true`
- TableBody `updateRowContent()` does NOT add `.dt-cell--derived` to cells of non-derived columns
- `.dt-cell--derived` and `.dt-cell--pinned` can coexist on the same cell element

**Manual UI tests** (demo at `http://localhost:4173/data-table/`):
- Load a CSV file, add a derived expression column via the demo sidebar form (e.g., name: "total", expression: "price * quantity")
- Verify derived column header has a subtle blue tint background, italic column name, and f(x) icon before the name
- Verify body cells in the derived column have a subtle blue tint covering the FULL cell width (no white strips at the left/right padding edges)
- Verify the action panel on the derived column shows pin, hide, filter, sort, drag-handle — identical to source columns
- Pin the derived column → tint persists on the sticky header and sticky body cells
- Hover over rows → derived cells show appropriate hover tint (slightly different from non-derived hover)
- Select rows → derived cells show appropriate selection tint
- Switch to dark mode (macOS System Settings → Appearance → Dark) → verify tints adapt to the dark palette
- Hide the derived column → chip appears in hidden gutter; restore it → f(x) icon, italic name, and tints return

#### Subtask 8.6.2: ExpressionEditor Extension Point and Derived Column Edit Panel

Create the editor extension point interface, default textarea editor, and a floating edit panel for modifying existing derived columns. Wire the f(x) icon click to open the panel.

**Background context:** The `FilterPanel` in `src/filters/FilterPanel.ts` is the reference pattern for the floating edit panel. It uses absolute positioning below an anchor element (4px gap), 320px fixed width, lazy creation (one instance per table managed by `TableContainer`), and close handlers for outside click (mousedown), Escape key, and close button. Fields are preserved on close for quick re-open but destroyed when switching columns. The derived edit panel follows this same pattern but at 360px width.

The `ExpressionEditor` interface allows downstream apps to plug in CodeMirror, Monaco, or other editors instead of the built-in textarea. The factory pattern means `TableContainer` passes an optional `editorFactory` to the edit panel (and later the create modal), which falls back to `DefaultExpressionEditor` when not provided.

**Existing API** (implemented in Task 8.4, `src/core/Actions.ts`):
- `actions.validateExpression(expr)` → `Promise<{ valid: boolean; type?: DataType; originalType?: string; error?: string }>`
- `actions.updateDerivedColumn(oldName, def)` → `Promise<{ success: boolean; error?: string }>`
- `actions.removeDerivedColumn(name)` → `Promise<void>`
- `actions.getCompletionContext(schema)` → `CompletionContext` (column names, types, isDerived flags)
- `state.derivedColumns: Signal<DerivedColumnDef[]>` — current derived column definitions
- `state.schema: Signal<ColumnSchema[]>` — full schema including `isDerived?: boolean` and `expression?: string` fields

**Files to create:**

**`src/derived/ExpressionEditorTypes.ts`** — extension point interface for downstream editors:

```typescript
import type { CompletionContext } from './types';

/**
 * Interface that custom expression editors must implement.
 * The library provides a default textarea editor (DefaultExpressionEditor).
 * Downstream apps can replace it with CodeMirror, Monaco, etc.
 */
export interface ExpressionEditor {
  /** The root DOM element to mount in the panel/modal */
  readonly element: HTMLElement;
  /** Get current editor content */
  getValue(): string;
  /** Set editor content (for editing existing columns) */
  setValue(value: string): void;
  /** Focus the editor */
  focus(): void;
  /** Display an error message inline (null clears the error) */
  setError(error: string | null): void;
  /** Update completion context when schema changes */
  updateCompletionContext(context: CompletionContext): void;
  /** Clean up resources */
  destroy(): void;
}

/**
 * Factory function for creating expression editors.
 * Downstream apps provide this to use CodeMirror or similar.
 * If not provided, DefaultExpressionEditor is used.
 */
export type ExpressionEditorFactory = (
  container: HTMLElement,
  context: CompletionContext
) => ExpressionEditor;
```

**`src/derived/DefaultExpressionEditor.ts`** — built-in textarea editor implementing `ExpressionEditor`:

- Root element: a `<div>` containing the textarea, error div, and hints div
- Monospace `<textarea>` with class `${prefix}-expr-editor-input`, placeholder "Enter SQL expression, e.g. price * quantity", 4 rows height
- Error display `<div>` below textarea with class `${prefix}-expr-editor-error` (red text, hidden when no error via `display: none`)
- Column hints `<div>` with class `${prefix}-expr-editor-context` showing "Available columns: col1 (integer), col2 (string), ..."
- `getValue()`: returns `textarea.value`
- `setValue(value)`: sets `textarea.value = value`
- `focus()`: calls `textarea.focus()`
- `setError(msg)`: if msg is non-null, add `${prefix}-expr-editor-input--error` class to textarea and show error div with text; if null, remove class and hide error div
- `updateCompletionContext(ctx)`: rebuild the hints div text from `ctx.columns`
- `destroy()`: remove root element from parent if attached
- CSS font: `font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 13px;`

**`src/derived/DerivedColumnEditPanel.ts`** — floating panel for editing existing derived columns:

```typescript
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { ExpressionEditorFactory } from './ExpressionEditorTypes';

export interface DerivedColumnEditPanelOptions {
  classPrefix?: string;
  /** Custom editor factory. If omitted, uses DefaultExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
}

export class DerivedColumnEditPanel {
  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: DerivedColumnEditPanelOptions
  );

  /** Open the panel for a specific column, positioned below the anchor element */
  open(columnName: string, anchorElement: HTMLElement): void;

  /** Close the panel */
  close(): void;

  /** Toggle: open if closed or showing different column; close if showing same column */
  toggle(columnName: string, anchorElement: HTMLElement): void;

  /** Get the root DOM element for mounting into the table's root container */
  getElement(): HTMLElement;

  /** Whether the panel is currently visible */
  getIsOpen(): boolean;

  /** The column currently being edited, or null */
  getCurrentColumn(): string | null;

  /** Clean up resources */
  destroy(): void;
}
```

Panel DOM structure:
```
.dt-derived-edit-panel (position: absolute, z-index: 22, width: 360px, display: none)
  .dt-derived-edit-header
    .dt-derived-edit-title ("Edit: <columnName>")
    button.dt-derived-edit-close (X icon, same pattern as .dt-filter-panel-close)
  .dt-derived-edit-body
    .dt-derived-edit-section  — Name
      label "Column name"
      input.dt-filter-input (reuse existing input style class)
      .dt-derived-edit-name-error (red text, hidden by default)
    .dt-derived-edit-section  — Expression (only shown for expression columns)
      label "SQL Expression"
      [ExpressionEditor element — created by editorFactory or DefaultExpressionEditor]
    .dt-derived-edit-section  — Vector info (only shown for vector columns)
      <read-only text: "Vector column (float), 1000 values">
    .dt-derived-edit-actions
      button.dt-derived-edit-validate "Validate" (only for expression columns)
      .dt-derived-edit-type-preview ("Type: float" or error message, hidden until validated)
      button.dt-derived-edit-update "Update" (disabled until valid)
    .dt-derived-edit-divider (thin hr)
    .dt-derived-edit-danger-zone
      button.dt-derived-edit-delete "Delete Column"
      .dt-derived-edit-delete-confirm (hidden by default):
        span "Are you sure?"
        button "Confirm" (red/danger style)
        button "Cancel"
```

Positioning logic (same as `FilterPanel.position()` in `src/filters/FilterPanel.ts`):
- Get the root table element's `getBoundingClientRect()`
- Get the anchor element's (f(x) button) `getBoundingClientRect()`
- Position the panel with `left` relative to root, `top` = anchor bottom - root top + 4px gap
- Clamp right edge to prevent overflow beyond the root element's width

Behavior:
- `open()`: Find the column's `DerivedColumnDef` from `state.derivedColumns.get()` and `ColumnSchema` from `state.schema.get()`. Pre-populate name input and expression editor (or show read-only vector info). Position below anchor. Show panel (`display: block`). Register close handlers.
- Name input validates uniqueness in real-time: check `state.schema.get()` for any column with the same name, excluding the currently-edited column. Show/hide `name-error` div accordingly.
- "Validate" button calls `actions.validateExpression(expression)`. On success, show "Type: \<type\>" in the preview area. On failure, show the DuckDB error message (and call `editor.setError(msg)`).
- "Update" button is **disabled** until all conditions met: (a) name is non-empty, (b) name is unique (no validation error), (c) for expression columns, the expression has been validated successfully since the last edit to the expression. Any input/keystroke in the expression editor resets the "validated" flag, requiring re-validation before update.
- "Update" click: calls `actions.updateDerivedColumn(oldName, { kind: 'expression', name, expression })`. On success, close panel. On failure, show error in the type preview area.
- "Delete Column" click: hides the delete button and shows `delete-confirm` div with "Are you sure?" text plus [Confirm] and [Cancel] buttons.
  - "Confirm" calls `actions.removeDerivedColumn(name)`, closes panel.
  - "Cancel" hides the confirm div and re-shows the delete button.
- **Vector columns**: The expression editor section is hidden. The vector info section shows read-only text like "Vector column (float), 1000 values". Only rename and delete are available. The "Validate" button is hidden. The "Update" button enables when name is valid (for rename-only updates).
- Close handlers: outside click (mousedown on document, checking if target is outside panel), Escape key, close button click. Same pattern as `FilterPanel` (lines 230-264 in `src/filters/FilterPanel.ts`).
- When switching to a different column: destroy the current expression editor, recreate for the new column.

**Files to modify:**

**`src/table/ColumnHeader.ts`** — wire f(x) icon click:

Add to `ColumnHeaderOptions` interface:
```typescript
onDerivedIconClick?: (columnName: string, buttonElement: HTMLElement) => void;
```

In `attachEventListeners()` (around line 241), add: if `this.derivedIconBtn` exists (set in Subtask 8.6.1), add a click listener that calls `this.options.onDerivedIconClick?.(this.column.name, this.derivedIconBtn!)`.

**`src/table/TableContainer.ts`** — manage the edit panel:

Add to `TableContainerOptions`:
```typescript
/** Custom expression editor factory for derived column panel/modal */
editorFactory?: ExpressionEditorFactory;
```

Add private property `derivedEditPanel: DerivedColumnEditPanel | null = null`.

Add private method `ensureDerivedEditPanel()` that lazily creates the panel (passing `editorFactory` from options), appends its element to `this.element` (the `.dt-root`), and returns it.

Add private method `handleDerivedIconClick(columnName: string, anchorEl: HTMLElement)` that:
1. If `this.filterPanel` is open, close it (mutual exclusion — only one floating panel at a time)
2. Call `this.ensureDerivedEditPanel().toggle(columnName, anchorEl)`

In the existing `handleFilterClick()` method (around line 795-807): add a check — if `this.derivedEditPanel?.getIsOpen()`, close it before opening/toggling the filter panel.

When creating `ColumnHeader` instances in `render()` (around line 634-657), pass the new callback:
```typescript
onDerivedIconClick: (name, el) => this.handleDerivedIconClick(name, el),
```

Destroy the panel in `destroy()`.

**`src/styles/data-table.css`** — add edit panel and expression editor styles:

```css
/* === Derived Column Edit Panel === */

/* Panel container (same visual pattern as .dt-filter-panel) */
.dt-derived-edit-panel {
  display: none;
  position: absolute;
  z-index: 22;
  width: 360px;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  flex-direction: column;
}

/* Header (same pattern as .dt-filter-panel-header) */
.dt-derived-edit-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--dt-border);
}
.dt-derived-edit-title {
  font-weight: 600;
  font-size: var(--dt-font-size-sm);
  color: var(--dt-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dt-derived-edit-close {
  /* Same pattern as .dt-filter-panel-close */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--dt-radius-sm);
  color: var(--dt-text-secondary);
  cursor: pointer;
}
.dt-derived-edit-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--dt-text);
}

/* Body */
.dt-derived-edit-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.dt-derived-edit-section label {
  display: block;
  font-size: var(--dt-font-size-xs);
  color: var(--dt-text-secondary);
  margin-bottom: 0.25rem;
}
.dt-derived-edit-name-error {
  color: #ef4444;
  font-size: var(--dt-font-size-xs);
  margin-top: 0.25rem;
  display: none;
}

/* Actions row */
.dt-derived-edit-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.dt-derived-edit-validate {
  padding: 0.25rem 0.75rem;
  font-size: var(--dt-font-size-sm);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius-sm);
  background: var(--dt-bg);
  color: var(--dt-text);
  cursor: pointer;
}
.dt-derived-edit-validate:hover {
  border-color: var(--dt-primary);
  color: var(--dt-primary);
}
.dt-derived-edit-type-preview {
  font-size: var(--dt-font-size-xs);
  color: var(--dt-text-secondary);
}
.dt-derived-edit-update {
  padding: 0.25rem 0.75rem;
  font-size: var(--dt-font-size-sm);
  border: 1px solid var(--dt-primary);
  border-radius: var(--dt-radius-sm);
  background: var(--dt-primary);
  color: #fff;
  cursor: pointer;
  margin-left: auto;
}
.dt-derived-edit-update:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Danger zone */
.dt-derived-edit-divider {
  border: none;
  border-top: 1px solid var(--dt-border);
  margin: 0;
}
.dt-derived-edit-delete {
  padding: 0.25rem 0.75rem;
  font-size: var(--dt-font-size-sm);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius-sm);
  background: var(--dt-bg);
  color: var(--dt-text-secondary);
  cursor: pointer;
}
.dt-derived-edit-delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}
.dt-derived-edit-delete-confirm {
  display: none;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--dt-font-size-sm);
}
.dt-derived-edit-delete-confirm span {
  color: var(--dt-text-secondary);
}
.dt-derived-edit-delete-confirm-btn {
  padding: 0.25rem 0.5rem;
  font-size: var(--dt-font-size-xs);
  border-radius: var(--dt-radius-sm);
  cursor: pointer;
  border: 1px solid;
}

/* Expression editor */
.dt-expr-editor-input {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius-sm);
  padding: 0.5rem;
  background: var(--dt-bg);
  color: var(--dt-text);
}
.dt-expr-editor-input--error {
  border-color: #ef4444;
}
.dt-expr-editor-error {
  color: #ef4444;
  font-size: var(--dt-font-size-xs);
  margin-top: 0.25rem;
  display: none;
}
.dt-expr-editor-context {
  color: var(--dt-text-secondary);
  font-size: 11px;
  margin-top: 0.5rem;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .dt-derived-edit-panel {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .dt-derived-edit-close:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}
```

**Unit tests:**

`tests/derived/DefaultExpressionEditor.test.ts`:
- Creates a root element containing a textarea
- `getValue()` / `setValue()` round-trip correctly
- `setError(msg)` adds error class to textarea and shows error div; `setError(null)` removes them
- `updateCompletionContext()` updates the hints text with column names and types
- `focus()` focuses the textarea element
- `destroy()` removes the element from its parent

`tests/derived/DerivedColumnEditPanel.test.ts`:
- Panel starts with `getIsOpen() === false` and `display: none`
- `open(columnName, anchor)` makes panel visible and positions it below anchor
- `toggle()` opens if closed, closes if same column, switches if different column
- Pre-populates name input with existing column name
- Pre-populates expression editor with existing expression (for expression columns)
- Shows read-only info for vector columns (no expression editor)
- Name validation: entering a name that matches another column shows error, clears on unique name
- Validate button calls `actions.validateExpression()` and displays result
- Update button disabled until name valid + expression validated
- Update button calls `actions.updateDerivedColumn()` with correct arguments
- Delete button click shows inline confirmation ("Are you sure?" + Confirm + Cancel)
- Confirm calls `actions.removeDerivedColumn()` and closes panel
- Cancel hides confirmation and re-shows delete button
- Close on Escape key
- Close on outside click (mousedown)
- Close button click closes panel

**Manual UI tests** (demo at `http://localhost:4173/data-table/`):
- Click the f(x) icon on a derived expression column → edit panel opens below it
- Panel shows the current column name and SQL expression pre-populated
- Edit the expression text, click "Validate" → see inferred type (e.g., "Type: float") or DuckDB error message
- Click "Update" → column updates with new expression, panel closes, table body shows new data
- Click "Delete Column" → "Are you sure?" appears with Confirm and Cancel buttons
- Click "Confirm" → column is removed from the table
- Click "Delete Column" then "Cancel" → confirmation hides, nothing happens
- Open the filter panel on any column, then click f(x) on a derived column → filter panel closes, edit panel opens
- Open the edit panel, click the filter button on another column → edit panel closes, filter panel opens
- Open the edit panel, press Escape → panel closes
- Open the edit panel, click anywhere outside the panel → panel closes

#### Subtask 8.6.3: New Column Modal and "+" Add Column Button

Create a modal dialog for creating new derived columns and a full-height "+" button strip at the table's right edge.

**Background context:** The `ExportDialog` in `src/export/ExportDialog.ts` is the reference modal pattern. It uses a fixed backdrop (`position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.4)`) with a centered dialog inside. Backdrop click (but not dialog click) closes the modal. Escape key closes. Body scroll is locked while open (`document.body.style.overflow = 'hidden'`). The dialog has `role="dialog"` and `aria-modal="true"`.

The "+" button is positioned absolutely within `.dt-root` (which already has `position: relative` as the table's positioning context). It sits at `right: var(--dt-scrollbar-width)` — just to the left of the body's vertical scrollbar — spanning the full height of the table from header through body.

**Existing API** (implemented in Task 8.4):
- `actions.addDerivedColumn(def)` → `Promise<{ success: boolean; error?: string }>` — creates a new derived column, updates schema, VIEW, and state signals
- `actions.validateExpression(expr)` → validation result
- `state.totalRows.get()` → row count (needed for vector value count validation)
- `state.schema.get()` → column list (needed for name uniqueness check)

**Files to create:**

**`src/derived/DerivedColumnModal.ts`** — modal dialog for creating new derived columns:

```typescript
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { ExpressionEditorFactory } from './ExpressionEditorTypes';

export interface DerivedColumnModalOptions {
  classPrefix?: string;
  /** Custom editor factory (e.g., CodeMirror). If omitted, uses DefaultExpressionEditor. */
  editorFactory?: ExpressionEditorFactory;
}

export class DerivedColumnModal {
  constructor(
    private state: TableState,
    private actions: StateActions,
    options?: DerivedColumnModalOptions
  );

  /** Open the modal for creating a new column (always create mode, never edit) */
  open(): void;

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
.dt-derived-modal-backdrop (fixed, inset 0, z-index 1000, display: none)
  .dt-derived-modal (centered, 480px wide, role="dialog", aria-modal="true")
    .dt-derived-modal-header
      span "New Derived Column"
      button (close X, same pattern as ExportDialog close)
    .dt-derived-modal-body
      .dt-derived-modal-section  — Name
        label "Column name"
        input.dt-filter-input
        .dt-derived-modal-name-error (red, hidden)
      .dt-derived-modal-section  — Mode
        fieldset with two radio buttons: "Expression" (default) / "Vector"
      .dt-derived-modal-section  — Expression (shown when mode=expression)
        label "SQL Expression"
        [ExpressionEditor element — created by editorFactory or DefaultExpressionEditor]
        div: button "Validate" + .dt-derived-modal-type-preview (type or error)
      .dt-derived-modal-section  — Vector (shown when mode=vector, hidden by default)
        label "Type"
        select: integer, float, string, boolean
        label "Values (one per line)"
        textarea (monospace, 8 rows)
        .dt-derived-modal-vector-info ("Expected: <totalRows> values, one per line")
        .dt-derived-modal-vector-error (count mismatch error, hidden)
    .dt-derived-modal-footer
      button "Cancel" (secondary style, like .dt-export-copy-btn)
      button "Create" (primary style, like .dt-export-btn, disabled until valid)
```

Behavior:
- `open()`: show backdrop with `--open` class (`display: flex; align-items: center; justify-content: center`), lock `document.body.style.overflow = 'hidden'`, reset form fields, focus name input.
- `close()`: hide backdrop (remove `--open` class), restore body overflow, destroy expression editor if created, reset all fields and validation state.
- Backdrop click (check `event.target === backdrop`, not dialog) closes modal.
- Escape key closes modal.
- Name uniqueness validated in real-time against `state.schema.get()`.
- **Expression mode:**
  - "Validate" calls `actions.validateExpression(expression)`. On success, show "Type: \<type\>" in preview area (green text). On failure, show error (red text) and call `editor.setError(msg)`.
  - "Create" disabled until: name is non-empty AND name is unique AND expression has been validated successfully since last keystroke.
- **Vector mode:**
  - Type selector: `integer`, `float`, `string`, `boolean` dropdown.
  - Textarea for values, one per line. Info text shows "Expected: N values" from `state.totalRows.get()`.
  - Validates value count matches `state.totalRows.get()` on every textarea input. Shows error if mismatched.
  - "Create" disabled until: name is non-empty AND name is unique AND value count matches.
- "Create" click: builds `DerivedColumnDef` from form state, calls `actions.addDerivedColumn(def)`. On success, closes modal. On failure, shows error message in the modal body.
- Mode radio buttons toggle visibility of expression vs. vector sections. Expression is the default.

**`src/derived/AddColumnButton.ts`** — the thin vertical "+" button strip:

```typescript
export interface AddColumnButtonOptions {
  classPrefix?: string;
  onClick?: () => void;
}

export class AddColumnButton {
  constructor(options?: AddColumnButtonOptions);

  /** Get the button element for mounting */
  getElement(): HTMLElement;

  /** Clean up */
  destroy(): void;
}
```

DOM: A single `<button>` element:
```html
<button class="${prefix}-add-column-btn" type="button" aria-label="Add derived column" title="Add derived column">
  <span class="${prefix}-add-column-icon">+</span>
</button>
```

On click: calls `options.onClick?.()`.

**Files to modify:**

**`src/table/TableContainer.ts`** — add the "+" button and modal:

Add to `TableContainerOptions`:
```typescript
/** Show "+" add column button at right edge (default: true) */
showAddColumnButton?: boolean;
```

Add private properties:
```typescript
private derivedModal: DerivedColumnModal | null = null;
private addColumnButton: AddColumnButton | null = null;
```

In constructor, after assembling the DOM (after `this.element.appendChild(this.bodyScroll)` on line ~138):
- If `showAddColumnButton !== false` (default true): create `new AddColumnButton({ classPrefix, onClick: () => this.openDerivedModal() })`, append its element to `this.element` (`.dt-root`).

Add private method `openDerivedModal()`:
- Lazily create `DerivedColumnModal` (pass `state`, `actions`, `{ classPrefix, editorFactory }` from options), append its element to `document.body` (not `.dt-root` — fixed-position modals should be body children to avoid stacking context issues).
- Call `modal.open()`.

Destroy modal and button in `destroy()`.

**`src/styles/data-table.css`** — add "+" button and modal styles:

```css
/* === Add Column Button (+) === */

.dt-add-column-btn {
  position: absolute;
  top: 0;
  right: var(--dt-scrollbar-width);
  bottom: 0;
  width: 28px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-left: 1px dashed var(--dt-border);
  background: transparent;
  color: var(--dt-text-tertiary);
  cursor: pointer;
  transition: background var(--dt-transition), color var(--dt-transition), border-color var(--dt-transition);
}
.dt-add-column-btn:hover {
  background: var(--dt-bg-secondary);
  color: var(--dt-primary);
  border-left-color: var(--dt-primary);
}
.dt-add-column-btn:focus {
  outline: 2px solid var(--dt-primary);
  outline-offset: -2px;
}
.dt-add-column-icon {
  font-size: 1.25rem;
  font-weight: 300;
  line-height: 1;
}

/* === Derived Column Modal === */

/* Backdrop (same pattern as .dt-export-backdrop) */
.dt-derived-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: none;
}
.dt-derived-modal-backdrop--open {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Dialog (same pattern as .dt-export-dialog) */
.dt-derived-modal {
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.dt-derived-modal-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--dt-border);
}
.dt-derived-modal-header span {
  font-weight: 600;
  font-size: var(--dt-font-size);
  color: var(--dt-text);
  flex: 1;
}
.dt-derived-modal-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.dt-derived-modal-section label {
  display: block;
  font-size: var(--dt-font-size-sm);
  color: var(--dt-text-secondary);
  margin-bottom: 0.25rem;
}
.dt-derived-modal-name-error,
.dt-derived-modal-vector-error {
  color: #ef4444;
  font-size: var(--dt-font-size-xs);
  margin-top: 0.25rem;
  display: none;
}
.dt-derived-modal-vector-info {
  font-size: var(--dt-font-size-xs);
  color: var(--dt-text-secondary);
  margin-top: 0.25rem;
}
.dt-derived-modal-type-preview {
  font-size: var(--dt-font-size-sm);
  margin-top: 0.25rem;
}
.dt-derived-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--dt-border);
}

/* Mode toggle radio buttons */
.dt-derived-modal-mode-toggle {
  display: flex;
  gap: 0.5rem;
}
.dt-derived-modal-mode-toggle label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  font-size: var(--dt-font-size-sm);
  color: var(--dt-text);
}

/* Vector values textarea */
.dt-derived-modal-vector-textarea {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius-sm);
  padding: 0.5rem;
  background: var(--dt-bg);
  color: var(--dt-text);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .dt-derived-modal-backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  .dt-derived-modal {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }
}
```

**Unit tests:**

`tests/derived/DerivedColumnModal.test.ts`:
- Modal starts hidden (`getIsOpen() === false`, backdrop display: none)
- `open()` shows backdrop with `--open` class and locks body scroll
- `close()` hides backdrop and restores body scroll
- Escape key closes modal
- Backdrop click closes modal (but clicking the dialog itself does not)
- Name validation: entering a duplicate name shows error, Create button stays disabled
- Expression mode: Validate calls `actions.validateExpression()` and shows type or error
- Expression mode: Create disabled until name valid + expression validated
- Expression mode: typing in expression after validation resets validated flag, disables Create
- Vector mode: count mismatch shows error
- Vector mode: correct count enables Create
- Create calls `actions.addDerivedColumn()` with correct `DerivedColumnDef`
- Create shows error inline if `addDerivedColumn()` returns `{ success: false, error: '...' }`
- Create closes modal on success
- Mode toggle switches between expression and vector sections

`tests/derived/AddColumnButton.test.ts`:
- Creates a button element with class `.dt-add-column-btn`
- Click fires the `onClick` callback
- Has `aria-label="Add derived column"`

**Manual UI tests** (demo at `http://localhost:4173/data-table/`):
- Verify the "+" button strip is visible at the right edge of the table, left of the scrollbar, spanning from header through body height
- Hover the "+" button → dashed border turns blue, background subtly tints
- Click "+" → modal opens centered with "New Derived Column" title
- Enter a column name and SQL expression (e.g., name: "total", expression: "price * quantity"), click Validate → see "Type: float"
- Click Create → new column appears with f(x) icon, italic name, tinted header and cells
- Try creating with a duplicate name → error appears, Create button disabled
- Switch mode to "Vector" → expression section replaced with type selector and textarea
- Enter wrong number of values → error "Expected N values, got M"
- Enter correct number of values → Create enabled
- Press Escape or click backdrop → modal closes without creating
- Dark mode: modal and "+" button render correctly

#### Subtask 8.6.4: Library Exports, Demo Cleanup, and Edge Cases

Export all new public types and classes, remove the demo sidebar derived columns card (all management now happens via the table's "+" button and f(x) edit panel), and handle edge cases.

**Background context:** The demo app at `demo/main.ts` currently has a sidebar card (`id="derived-columns-card"` in `demo/index.html`, lines 67-82) with text inputs for column name and expression, validate/add buttons, and a rendered list of existing derived columns. This was a temporary development UI that is now superseded by the in-table "+" button (Subtask 8.6.3) and f(x) edit panel (Subtask 8.6.2). The card and all its associated JavaScript should be removed.

**Files to modify:**

**`src/index.ts`** — add exports for all new derived column UI types and classes:
```typescript
// Derived column UI — ExpressionEditor extension point
export type { ExpressionEditor, ExpressionEditorFactory } from './derived/ExpressionEditorTypes';
export { DefaultExpressionEditor } from './derived/DefaultExpressionEditor';

// Derived column UI — Edit panel
export { DerivedColumnEditPanel } from './derived/DerivedColumnEditPanel';
export type { DerivedColumnEditPanelOptions } from './derived/DerivedColumnEditPanel';

// Derived column UI — Create modal
export { DerivedColumnModal } from './derived/DerivedColumnModal';
export type { DerivedColumnModalOptions } from './derived/DerivedColumnModal';

// Derived column UI — Add column button
export { AddColumnButton } from './derived/AddColumnButton';
export type { AddColumnButtonOptions } from './derived/AddColumnButton';
```

**`demo/index.html`** — remove the entire `derived-columns-card` div (lines 67-82, from `<div class="card" id="derived-columns-card"` through the closing `</div>`).

**`demo/main.ts`** — remove all derived column sidebar code:
- Remove DOM element references: `derivedColumnsCard`, `derivedNameInput`, `derivedExprInput`, `validateExprBtn`, `addDerivedBtn`, `derivedValidationMsg`, `derivedColumnsList` (around lines 56-63)
- Remove `updateDerivedColumnsList()` function and all calls to it
- Remove `updateDerivedInputState()` function and all calls to it
- Remove `validateExprBtn` click handler (around line 809)
- Remove `addDerivedBtn` click handler (around line 830)
- Remove `tableState.derivedColumns.subscribe()` handler that called `updateDerivedColumnsList()` (around line 633)
- Remove or simplify the `tableState.tableName.subscribe()` handler that showed/hid the card (around line 636)

**`src/table/TableContainer.ts`** — handle edge cases:

Subscribe to `state.derivedColumns` changes. If the derived edit panel is open and its `getCurrentColumn()` no longer exists in the updated derived columns list, close the panel. This handles the case where undo/redo removes the column being edited:
```typescript
this.state.derivedColumns.subscribe((cols) => {
  if (this.derivedEditPanel?.getIsOpen()) {
    const currentCol = this.derivedEditPanel.getCurrentColumn();
    if (currentCol && !cols.some(c => c.name === currentCol)) {
      this.derivedEditPanel.close();
    }
  }
});
```

When data is reloaded (detected via `state.schema` subscription in the existing `render()` flow), close the edit panel and modal if open.

Ensure the `render()` method does not destroy the add-column button or modal — they are positioned absolutely and are not children of the header row that gets rebuilt.

**Unit tests** (`tests/derived/DerivedColumnIntegration.test.ts`):
- All new types (`ExpressionEditor`, `ExpressionEditorFactory`, `DefaultExpressionEditor`, `DerivedColumnEditPanel`, `DerivedColumnEditPanelOptions`, `DerivedColumnModal`, `DerivedColumnModalOptions`, `AddColumnButton`, `AddColumnButtonOptions`) are exported from `src/index.ts`
- TableContainer with `showAddColumnButton: false` does not create the "+" button
- TableContainer with `editorFactory` option passes it through to the edit panel and modal
- Edit panel closes when the edited column is removed from `state.derivedColumns` (simulating undo)
- Derived column can be reordered via drag-and-drop — f(x) icon and cell tint persist after reorder

**Manual UI tests** (full end-to-end, demo at `http://localhost:4173/data-table/`):
- Verify the sidebar "Derived Columns" card is gone
- Full workflow: load CSV → click "+" → create expression column → see it appear with tint, italic name, f(x) icon → click f(x) → edit expression → validate → update → verify table shows new data → delete via edit panel → verify column gone
- Undo/redo: create a derived column → Ctrl/Cmd+Z → column removed, all visual markers gone → Ctrl/Cmd+Shift+Z → column restored with tint, icon, and panel functionality
- Session persistence: create a derived column → reload page → column is restored with f(x) icon, italic name, header tint, and cell tint
- Dark mode: all new UI elements (f(x) icon, edit panel, modal, "+" button, tints) render correctly
- Pin a derived column → tint persists on sticky header and cells
- Drag-and-drop reorder a derived column → f(x) icon and tint follow the column
- Hide a derived column → chip in hidden gutter → restore → f(x) icon, italic name, and tints return
- Open the edit panel on a derived column → press Ctrl/Cmd+Z to undo that column's creation → edit panel closes gracefully without errors
- Export (CSV/JSON/Parquet) includes derived columns with correct values

### Task 8.7: Derived Columns — Integration Fixes and Verification

Fix integration issues with existing features and verify end-to-end functionality. This task addresses specific bugs that arise from the derived columns implementation in Tasks 8.4-8.6.

**Background context:** Several existing components need fixes to work correctly with derived columns. The issues were identified during architectural review and must be addressed before considering derived columns complete.

#### Fix 1: CrossfilterCoordinator stale tableName

**Problem:** `src/visualizations/CrossfilterCoordinator.ts` receives `tableName: string` as a constructor parameter (line 22: `private tableName: string`) and caches it. When derived columns switch `state.tableName` from the base table to a VIEW name, the coordinator's cached `this.tableName` is stale — its `updateFilteredRowCount()` queries the base table instead of the VIEW, so filters on derived columns fail.

**Fix:** Remove the `tableName` constructor parameter entirely. Instead, read `this.state.tableName.get()` dynamically in `updateFilteredRowCount()`:

```typescript
// Change constructor signature from:
constructor(private state: TableState, private actions: StateActions, private bridge: WorkerBridge, private tableName: string)
// To:
constructor(private state: TableState, private actions: StateActions, private bridge: WorkerBridge)

// In updateFilteredRowCount(), replace `this.tableName` with:
const tableName = this.state.tableName.get();
if (!tableName) return;
```

**Update callers:** `demo/main.ts` creates the coordinator — remove the `tableName` argument from the constructor call (search for `new CrossfilterCoordinator`).

#### Fix 2: Dynamic visualization lifecycle

**Problem:** Visualizations are created once in `demo/main.ts` after data load via `attachVisualizations()`. When a derived column is added, there's no visualization for it. When removed, its visualization is orphaned.

**Fix:** The existing `visibleColumns.subscribe()` handler in `demo/main.ts` already debounces and calls `attachVisualizations()`, which destroys all visualizations and recreates them. This will handle derived column add/remove since those operations update `visibleColumns`.

**Additional subscription needed:** Subscribe to `state.tableName` changes to trigger visualization reattachment. This handles the case where tableName switches from base to VIEW (or back) without `visibleColumns` changing. In `demo/main.ts`:

```typescript
tableState.tableName.subscribe((newName) => {
  if (newName && visualizationsAttached) {
    // Reattach with debounce (same pattern as visibleColumns subscriber)
    scheduleReattach();
  }
});
```

**Update `attachVisualizations()`:** Currently receives `tableName` as a parameter. Change it to read `tableState.tableName.get()` at call time, so it always uses the current effective name (VIEW when derived columns exist).

#### Fix 3: Demo integration

Update `demo/main.ts`:
- Remove `tableName` from `CrossfilterCoordinator` constructor call
- Update `attachVisualizations()` to read tableName from state
- Add `tableName` subscription for visualization reattachment
- Note: The demo sidebar "Derived Columns" card was already removed in Subtask 8.6.4, so no derived column UI updates are needed here

#### Fix 4: Library exports

Update `src/index.ts` to export all new public types and classes:
- From `src/derived/types.ts`: `DerivedColumnDef`, `ExpressionColumnDef`, `VectorColumnDef`, `DerivedColumnKind`, `VectorDataType`, `CompletionContext`, `DerivedColumnInfo`
- From `src/derived/ExpressionEditorTypes.ts`: `ExpressionEditor`, `ExpressionEditorFactory`
- From `src/derived/DefaultExpressionEditor.ts`: `DefaultExpressionEditor`
- From `src/derived/DerivedColumnEditPanel.ts`: `DerivedColumnEditPanel`, `DerivedColumnEditPanelOptions`
- From `src/derived/DerivedColumnModal.ts`: `DerivedColumnModal`, `DerivedColumnModalOptions`
- From `src/derived/AddColumnButton.ts`: `AddColumnButton`, `AddColumnButtonOptions`
- From `src/derived/DerivedColumnManager.ts`: `DerivedColumnManager`

#### Fix 5: Snapshot version bump

In `src/persistence/types.ts`, change `SNAPSHOT_VERSION` from `1` to `2` to indicate the new schema with derived column support. Update `restoreStateFromSnapshot()` in `src/persistence/serialization.ts` to handle version 1 snapshots gracefully (treat missing `derivedColumns` as `[]`).

#### Verification Checklist

Run through each scenario manually in the demo app:

1. **Expression column basics**: Add `price * quantity AS total` → histogram renders for the new column, filter brush works, export (CSV/JSON/Parquet) includes the column
2. **Vector column (numeric)**: Add a numeric vector column → histogram renders
3. **Vector column (string)**: Add a string vector column → value counts bar renders
4. **Edit expression**: Change expression → visualization updates with new data, table body refreshes
5. **Delete derived column**: Delete → filters/sorts for that column cleaned up, visualization removed, table body correct, no console errors
6. **Undo add**: Add column → undo → column disappears, VIEW dropped, tableName reverts to base
7. **Redo add**: After undo → redo → column reappears, VIEW recreated, visualization works
8. **Crossfilter**: Filter on a derived column → other columns show ghost bars correctly. Filter on a source column → derived column visualization updates
9. **Export**: All three formats (CSV, JSON, Parquet) include derived columns with correct values
10. **Persistence**: Add derived columns → reload page → columns restored with visualizations and correct data
11. **Error handling**: Enter invalid SQL expression in modal → DuckDB error displayed, no crash, no column created
12. **Name conflict**: Try to create column with name matching an existing column → prevented with real-time validation error
13. **Vector length mismatch**: Enter fewer/more values than totalRows → error displayed in modal
14. **Mixed undo**: Add derived column, apply filter, sort, undo three times → each step correctly reverses

### Task 8.8: Raw SQL Filter API

A **programmatic API** (not a UI feature) for specifying complex SQL WHERE clauses that the filter panel cannot express (OR clauses, cross-column conditions). This is an escape hatch for rare complex filters, useful for downstream DQ rules validation.

**Use case:** A downstream data quality check app allows users to specify complex SQL conditions (filters) to design data quality check rules. For example, `(sex = 'male' OR age <= 18) AND (parous = TRUE)`, `(height IS NULL) OR (height < 140)`.  

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
  8.4 Types/State/Manager → 8.5 Undo/Persistence (parallel with 8.6)
                           → 8.6 UI/Editor/Modal  (parallel with 8.5)
                                                   → 8.7 Integration Fixes
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
3. **8.4 → (8.5 + 8.6 in parallel) → 8.7** (Derived columns — full virtual layer with expression + vector modes, undo/redo, editor extension point)
4. **8.8** (Raw SQL Filter API — enables complex filters before presets)
5. **8.9 → 8.10** (Filter presets — can serialize all filter types including raw SQL)
6. **9.1 → 9.2 → 9.3 → 9.4 → 9.5** (Polish)

---

## What Changed from Original Plan

| Original Task | Status | Rationale |
|---|---|---|
| 8.1–8.3 Undo/Redo | **Kept** | Essential for EDA workflow |
| 8.4–8.5 Filter Presets | **Kept, moved to 8.9–8.10** | Reordered after raw SQL filters so presets can serialize them |
| 8.6–8.7 Derived Columns | **Kept, expanded to 8.4–8.7** | Virtual layer with two modes (SQL expression + pre-computed vector), DuckDB VIEW mechanism, editor extension point for CodeMirror, async undo/redo, visual differentiation, edit/rename/delete |
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
