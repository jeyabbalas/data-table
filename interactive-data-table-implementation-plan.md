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
- `src/table/TableContainer.ts` — Main container. DOM: `.dt-root > .dt-header-area > (.dt-header-scroll > .dt-header-row) + .dt-scrollbar-gutter`, then `.dt-filter-bar`, then `.dt-body-scroll > .dt-body`. Manages column headers, filter bar, table body, column reorder, scroll sync, resize observer. Subscribes to `schema`, `visibleColumns`, `columnWidths`, `sortColumns`.
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
  columns: 'all' | 'visible' | string[];
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
    // Column selection
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

### Task 7.5: Implement IndexedDB Storage

Create `src/persistence/Storage.ts`:

```typescript
export class StorageManager {
  private db: IDBDatabase | null = null;
  private dbName = 'datatable-sessions';

  async initialize(): Promise<void>;
  
  async saveSession(key: string, state: SerializedState): Promise<void>;
  async loadSession(key: string): Promise<SerializedState | null>;
  async deleteSession(key: string): Promise<void>;
  async listSessions(): Promise<SessionInfo[]>;
}
```

**Verification:**
- Can save state
- Can load state
- Can delete state

### Task 7.6: Implement State Serialization

Create `src/persistence/Serialization.ts`:

```typescript
export interface SerializedState {
  version: number;
  schema: ColumnSchema[];
  filters: Filter[];
  sort: SortColumn[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
  pinnedColumns: string[];
  presets: SavedPreset[];
  derivedColumns: DerivedColumn[];
  timestamp: number;
}

export function serializeState(state: TableState): SerializedState;
export function deserializeState(data: SerializedState): Partial<TableState>;
```

**Verification:**
- Serialization round-trips correctly
- Version migration works

### Task 7.7: Implement Auto-Save

Create `src/persistence/AutoSave.ts`:

```typescript
export class AutoSaveManager {
  private saveTimer: number | null = null;
  private isDirty = false;

  constructor(
    private state: TableState,
    private storage: StorageManager,
    private options: { interval: number; key: string }
  ) {
    this.subscribeToChanges();
  }

  private subscribeToChanges(): void;
  private scheduleSave(): void;
  async saveNow(): Promise<void>;
}
```

**Verification:**
- Changes trigger dirty flag
- Save occurs after interval
- Manual save works

### Task 7.8: Implement Session Restore

Create `src/persistence/SessionRestore.ts`:

```typescript
export class SessionRestoreManager {
  constructor(
    private storage: StorageManager,
    private actions: StateActions
  ) {}

  async checkForSession(key: string): Promise<boolean>;
  async restoreSession(key: string): Promise<void>;
  showRestorePrompt(): Promise<'restore' | 'discard'>;
}
```

**Verification:**
- Detects previous session
- Restore works correctly
- User can choose to discard

---

## Phase 8: Advanced Features

**Goal:** Add undo/redo, presets, derived columns, and SQL editor.

### Task 8.1: Implement Undo/Redo Stack

Create `src/history/UndoStack.ts`:

```typescript
export interface HistoryEntry {
  type: string;
  description: string;
  undo: () => void;
  redo: () => void;
  timestamp: number;
}

export class UndoStack {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize: number;

  push(entry: HistoryEntry): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}
```

**Verification:**
- Push/undo/redo work
- Max size limits stack
- Clear empties both stacks

### Task 8.2: Integrate Undo/Redo with Actions

Update `StateActions.ts`:

```typescript
addFilter(filter: Filter): void {
  const previous = this.state.filters.get();
  this.state.filters.set([...previous, filter]);
  
  this.history.push({
    type: 'filter:add',
    description: `Added filter on ${filter.column}`,
    undo: () => this.state.filters.set(previous),
    redo: () => this.state.filters.set([...previous, filter]),
    timestamp: Date.now()
  });
}
```

**Verification:**
- Filter add is undoable
- Sort change is undoable
- Column operations undoable

### Task 8.3: Implement Undo/Redo UI

Create `src/history/HistoryUI.ts`:

```typescript
export class HistoryUI {
  constructor(
    private container: HTMLElement,
    private history: UndoStack
  ) {}

  renderButtons(): HTMLElement;
  renderHistoryPanel(): HTMLElement;
}
```

Add keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z).

**Verification:**
- Buttons work
- Keyboard shortcuts work
- History panel shows entries

### Task 8.4: Implement Filter Presets

Create `src/presets/PresetManager.ts`:

```typescript
export interface Preset {
  id: string;
  name: string;
  filters: Filter[];
  sort: SortColumn[];
  createdAt: number;
}

export class PresetManager {
  constructor(private state: TableState) {}

  save(name: string): Preset;
  load(id: string): void;
  delete(id: string): void;
  list(): Preset[];
  export(): string;
  import(data: string): void;
}
```

**Verification:**
- Save/load/delete work
- Export/import work

### Task 8.5: Implement Preset UI

Create `src/presets/PresetUI.ts`:

```typescript
export class PresetUI {
  constructor(
    private container: HTMLElement,
    private presetManager: PresetManager
  ) {}

  renderPresetList(): HTMLElement;
  renderSaveDialog(): HTMLElement;
}
```

**Verification:**
- Preset list displays
- Save dialog works
- Quick-apply works

### Task 8.6: Implement Derived Columns

Create `src/derived/DerivedColumn.ts`:

```typescript
export interface DerivedColumnDef {
  name: string;
  expression: string;
  type: DataType; // Inferred or specified
}

export class DerivedColumnManager {
  constructor(private bridge: WorkerBridge) {}

  async validate(expression: string): Promise<{ valid: boolean; error?: string; type?: DataType }>;
  async add(def: DerivedColumnDef): Promise<void>;
  remove(name: string): void;
  list(): DerivedColumnDef[];
}
```

**Verification:**
- Expression validation works
- Column type inferred
- Invalid expressions rejected

### Task 8.7: Implement Derived Column UI

Create `src/derived/DerivedColumnUI.ts`:

```typescript
export class DerivedColumnDialog {
  constructor(private manager: DerivedColumnManager) {}

  show(): void {
    // Expression editor
    // Validation feedback
    // Preview of values
    // Save/cancel
  }
}
```

**Verification:**
- Editor with syntax highlighting
- Live validation
- Preview shows computed values

### Task 8.8: Implement SQL Editor (Optional Feature)

Create `src/sql-editor/SQLEditor.ts`:

```typescript
export class SQLEditor {
  private editor: CodeMirror.Editor;
  
  constructor(
    private container: HTMLElement,
    private bridge: WorkerBridge,
    private schema: ColumnSchema[]
  ) {}

  initialize(): void {
    // CodeMirror setup
    // Auto-completion
    // Syntax highlighting
  }

  async execute(): Promise<QueryResult>;
  getSQL(): string;
  setSQL(sql: string): void;
}
```

**Verification:**
- Editor renders
- Syntax highlighting works
- Auto-completion works

### Task 8.9: Implement Query Results Display

Create `src/sql-editor/QueryResults.ts`:

```typescript
export class QueryResults {
  constructor(private container: HTMLElement) {}

  show(results: QueryResult): void;
  showError(error: Error): void;
  clear(): void;
}
```

**Verification:**
- Results display in table
- Errors display clearly
- Can export results

---

## Phase 9: Polish & Optimization

**Goal:** Performance optimization, accessibility, and visual polish.

### Task 9.1: Implement Query Caching

Create `src/performance/QueryCache.ts`:

```typescript
export class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number;

  get(sql: string): unknown[] | null;
  set(sql: string, results: unknown[]): void;
  invalidate(pattern?: string): void;
  clear(): void;
}
```

**Verification:**
- Cache hits return quickly
- TTL expiration works
- LRU eviction works

### Task 9.2: Implement Query Batching

Create `src/performance/QueryBatcher.ts`:

```typescript
export class QueryBatcher {
  private pending: PendingQuery[] = [];
  private batchTimer: number | null = null;
  private batchWindow: number;

  queue<T>(sql: string): Promise<T[]>;
  private flush(): void;
}
```

**Verification:**
- Multiple queries batched
- Results returned correctly

### Task 9.3: Implement Keyboard Navigation

Create `src/accessibility/KeyboardNav.ts`:

```typescript
export class KeyboardNavigation {
  private focusedCell: { row: number; col: number } | null = null;

  constructor(private table: TableContainer) {
    this.attachListeners();
  }

  private attachListeners(): void;
  private handleKeyDown(event: KeyboardEvent): void;
  private moveFocus(direction: 'up' | 'down' | 'left' | 'right'): void;
}
```

**Verification:**
- Arrow keys navigate cells
- Home/End work
- Enter activates

### Task 9.4: Implement ARIA Labels

Update all components:

```typescript
// Example in ColumnHeader
render(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'columnheader');
  el.setAttribute('aria-label', `${this.column.name}, ${this.column.type}`);
  el.setAttribute('aria-sort', this.getSortState());
  // ...
}
```

**Verification:**
- Screen reader announces correctly
- All interactive elements labeled

### Task 9.5: Implement Dark Mode

Create `src/themes/DarkMode.ts`:

```typescript
export const lightTheme = {
  primary: '#2563eb',
  primaryHover: '#60a5fa',
  secondary: '#f59e0b',
  background: '#ffffff',
  text: '#111827',
  // ...
};

export const darkTheme = {
  primary: '#60a5fa',
  primaryHover: '#93c5fd',
  secondary: '#fbbf24',
  background: '#1f2937',
  text: '#f9fafb',
  // ...
};

export function applyTheme(theme: 'light' | 'dark' | 'auto'): void;
```

**Verification:**
- Light mode looks correct
- Dark mode looks correct
- Auto detects system preference

### Task 9.6: Implement Responsive Behavior

Create `src/responsive/Responsive.ts`:

```typescript
export class ResponsiveManager {
  private breakpoint: 'mobile' | 'tablet' | 'desktop';

  constructor(private table: TableContainer) {
    this.observeSize();
  }

  private observeSize(): void;
  private adaptLayout(): void;
}
```

**Verification:**
- Table adapts to narrow screens
- Touch targets appropriate size
- Visualizations simplify on mobile

### Task 9.7: Performance Testing & Optimization

Create performance test suite:

```typescript
// tests/performance/
describe('Performance', () => {
  test('loads 100MB CSV in under 30s', async () => { ... });
  test('filters 1M rows in under 500ms', async () => { ... });
  test('scroll maintains 60fps', async () => { ... });
  test('memory stays under 500MB for 1M rows', async () => { ... });
});
```

**Verification:**
- All performance targets met
- No memory leaks detected

### Task 9.8: Final Integration Testing

Create integration test suite:

```typescript
// tests/integration/
describe('Full Workflow', () => {
  test('load → filter → export', async () => { ... });
  test('save → reload → restore session', async () => { ... });
  test('derived column → filter → undo', async () => { ... });
});
```

**Verification:**
- All workflows complete successfully
- No regressions

---

## Testing Strategy

### Unit Test Coverage Targets

| Module | Target Coverage |
|--------|-----------------|
| Core (types, events, signals) | 95% |
| Data (loaders, schema) | 90% |
| Filters | 95% |
| SQL Generation | 95% |
| Visualizations | 80% |
| UI Components | 70% |

### Test File Organization

```
tests/
├── unit/
│   ├── core/
│   │   ├── EventEmitter.test.ts
│   │   ├── Signal.test.ts
│   │   └── State.test.ts
│   ├── data/
│   │   ├── SchemaDetector.test.ts
│   │   ├── TypeInference.test.ts
│   │   └── loaders/
│   ├── filters/
│   │   ├── FilterSQL.test.ts
│   │   └── FilterTypes.test.ts
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
  },
  "optionalDependencies": {
    "codemirror": "^6.0.0"
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

// State
'state:save' | 'state:restore' | 'undo' | 'redo'
```

---

## Getting Started

To begin implementation:

1. Complete Phase 0 (Project Setup)
2. Run `npm test` to verify setup
3. Proceed to Phase 1, Task 1.1
4. Complete each task in order
5. Commit after each successful task
6. If stuck, break down the task further

**Remember:** Each task should be independently verifiable. Don't move to the next task until the current one is complete and tested.
