# Interactive Data Table Library - Implementation Plan

## Executive Summary

This document provides a phased implementation plan for developing a client-side TypeScript library that enables users to build browser-based interactive, explorable data tables embedded within their own web applications. The library uses DuckDB WASM for in-browser analytics, enabling complete privacy with no server-side processing.

**Estimated Total Effort:** 8 major phases, ~60-80 discrete tasks

**Key Architecture Decisions:**
- TypeScript for type safety and better tooling
- DuckDB WASM for analytical queries (runs in Web Worker)
- Canvas-based visualizations for performance
- Signal/observable pattern for reactive state
- Plugin architecture for extensibility

---

## Pre-Implementation Checklist

Before starting any phase, ensure you understand:
1. Read this entire document first
2. Each task should be completable in a single session
3. Write tests for each task before moving to the next
4. Commit after each successful task
5. If a task is too large, break it down further

---

## Phase 0: Project Setup & Foundation

**Goal:** Establish project structure, tooling, and build configuration.

### Task 0.1: Initialize Project Structure
```
interactive-data-table/
├── src/
│   ├── core/           # State, events, types
│   ├── data/           # DuckDB, loaders, schema
│   ├── worker/         # Web Worker code
│   ├── table/          # Table rendering
│   ├── visualizations/ # Column visualizations
│   ├── filters/        # Filter system
│   ├── export/         # Export functionality
│   ├── persistence/    # IndexedDB storage
│   ├── sql-editor/     # Optional SQL editor
│   ├── plugins/        # Plugin system
│   └── index.ts        # Main entry point
├── tests/
├── examples/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

**Actions:**
1. Create directory structure
2. Initialize `package.json` with name `@jeyabbalas/data-table` (or similar)
3. Add TypeScript configuration (`tsconfig.json`)
4. Add Vite for bundling (`vite.config.ts`)
5. Configure for library output (ESM + UMD)
6. Add `.gitignore`

**Verification:** `npm run build` produces output without errors

### Task 0.2: Install Core Dependencies

```bash
npm install duckdb-wasm
npm install -D typescript vite vitest @types/node
```

**Verification:** All packages install without conflicts

### Task 0.3: Configure Testing Infrastructure

**Actions:**
1. Configure Vitest for unit tests
2. Add test script to `package.json`
3. Create first placeholder test
4. Configure coverage reporting

**Verification:** `npm test` runs successfully

### Task 0.4: Create Type Foundation

Create `src/core/types.ts` with fundamental types:

```typescript
// Column data types
export type DataType = 
  | 'integer' | 'float' | 'decimal'
  | 'string' | 'boolean'
  | 'date' | 'timestamp' | 'time' | 'interval';

// Column metadata
export interface ColumnSchema {
  name: string;
  type: DataType;
  nullable: boolean;
  originalType: string; // DuckDB type
}

// Filter types
export type FilterType = 'range' | 'point' | 'set' | 'null' | 'not-null' | 'pattern';

export interface Filter {
  column: string;
  type: FilterType;
  value: unknown;
}

// Configuration
export interface DataTableOptions {
  container?: HTMLElement;
  headless?: boolean;
  // ... (add incrementally)
}
```

**Verification:** Types compile without errors, can be imported

### Task 0.5: Create Event Emitter Base Class

Create `src/core/EventEmitter.ts`:

```typescript
export class EventEmitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Function>>();

  on<K extends keyof Events>(event: K, callback: (data: Events[K]) => void): () => void;
  off<K extends keyof Events>(event: K, callback: (data: Events[K]) => void): void;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
  once<K extends keyof Events>(event: K, callback: (data: Events[K]) => void): () => void;
}
```

**Verification:** Write unit tests for all methods

---

## Phase 1: Core Data Infrastructure

**Goal:** Establish DuckDB integration with Web Worker communication.

### Task 1.1: Create Web Worker Shell

Create `src/worker/worker.ts`:

```typescript
// Web Worker entry point
// Will handle all DuckDB operations

interface WorkerMessage {
  id: string;
  type: 'init' | 'query' | 'load' | 'cancel';
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  type: 'result' | 'error' | 'progress';
  payload: unknown;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  // Route to handlers
};
```

**Verification:** Worker loads without errors in browser

### Task 1.2: Initialize DuckDB in Worker

Create `src/worker/duckdb.ts`:

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initializeDuckDB(): Promise<void> {
  // Load DuckDB WASM bundle
  // Initialize database
  // Create connection
}

export async function executeQuery(sql: string): Promise<unknown[]> {
  // Execute and return results
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  // Return active connection
}
```

**Verification:** 
- Can initialize DuckDB
- Can execute `SELECT 1` and get result

### Task 1.3: Create Worker Communication Bridge

Create `src/data/WorkerBridge.ts`:

```typescript
export class WorkerBridge {
  private worker: Worker;
  private pendingRequests = new Map<string, { resolve: Function; reject: Function }>();
  private messageId = 0;

  constructor() {
    this.worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
  }

  async initialize(): Promise<void>;
  async query<T>(sql: string, signal?: AbortSignal): Promise<T[]>;
  async loadData(source: ArrayBuffer | string, options: LoadOptions): Promise<void>;
  terminate(): void;
}
```

**Verification:**
- Can send message to worker and receive response
- AbortController cancels pending request
- Write unit tests with mock worker

### Task 1.4: Create Progress Reporting System

Create `src/core/Progress.ts`:

```typescript
export interface ProgressInfo {
  stage: 'reading' | 'parsing' | 'indexing' | 'analyzing';
  percent: number;
  loaded?: number;
  total?: number;
  estimatedRemaining?: number;
  cancelable: boolean;
}

export type ProgressCallback = (info: ProgressInfo) => void;
```

Add progress reporting to WorkerBridge.

**Verification:** Progress events fire during simulated long operation

### Task 1.5: Implement CSV Loader in Worker

Create `src/worker/loaders/csv.ts`:

```typescript
export async function loadCSV(
  data: string | ArrayBuffer,
  options: CSVLoadOptions,
  onProgress: ProgressCallback
): Promise<string> {
  // Parse CSV
  // Detect delimiter if auto
  // Stream large files in chunks
  // Create DuckDB table
  // Return table name
}
```

**Verification:**
- Load small CSV (<1MB)
- Load large CSV (>10MB) with progress
- Automatic delimiter detection works
- Handle various quote/escape styles

### Task 1.6: Implement JSON Loader in Worker

Create `src/worker/loaders/json.ts`:

```typescript
export async function loadJSON(
  data: string | ArrayBuffer,
  options: JSONLoadOptions,
  onProgress: ProgressCallback
): Promise<string>;
```

**Verification:**
- Load array of objects JSON
- Load newline-delimited JSON
- Handle nested objects (flatten or error gracefully)

### Task 1.7: Implement Parquet Loader in Worker

Create `src/worker/loaders/parquet.ts`:

```typescript
export async function loadParquet(
  data: ArrayBuffer,
  options: ParquetLoadOptions,
  onProgress: ProgressCallback
): Promise<string>;
```

**Verification:**
- Load Parquet file
- Schema correctly detected
- Large Parquet files work

### Task 1.8: Create Unified Data Loader

Create `src/data/DataLoader.ts`:

```typescript
export class DataLoader {
  constructor(private bridge: WorkerBridge) {}

  async load(
    source: File | string | ArrayBuffer,
    options?: LoadOptions
  ): Promise<LoadResult> {
    // Detect format from extension/mime/content
    // Route to appropriate loader
    // Handle progress and cancellation
  }

  detectFormat(source: File | string | ArrayBuffer): DataFormat;
}
```

**Verification:**
- Auto-detect format works
- File upload works
- URL fetch works (mock for tests)
- Progress reported correctly

---

## Phase 2: Schema Detection & State Management

**Goal:** Detect column types and establish reactive state system.

### Task 2.1: Basic Schema Detection

Create `src/data/SchemaDetector.ts`:

```typescript
export async function detectSchema(
  tableName: string,
  conn: DuckDBConnection
): Promise<ColumnSchema[]> {
  // Query DuckDB for column info
  // Map DuckDB types to our DataType
  // Detect nullability
}
```

**Verification:**
- Correctly identifies INTEGER, VARCHAR, TIMESTAMP, etc.
- Maps all DuckDB types to our simplified types

### Task 2.2: Smart Type Detection for Strings

Create `src/data/TypeInference.ts`:

```typescript
export interface TypeInferenceResult {
  suggestedType: DataType;
  confidence: number;
  pattern?: string;
}

export async function inferStringColumnType(
  tableName: string,
  columnName: string,
  conn: DuckDBConnection,
  sampleSize?: number
): Promise<TypeInferenceResult> {
  // Sample values
  // Test patterns (ISO dates, numbers, booleans)
  // Return suggestion with confidence
}
```

**Verification:**
- Detects ISO timestamps in string columns
- Detects numeric strings
- Detects boolean strings ("true", "false", "yes", "no")

### Task 2.3: Pattern Detection

Create `src/data/PatternDetector.ts`:

```typescript
export type DetectedPattern = 
  | 'email' | 'url' | 'phone' | 'uuid' | 'ip' | 'identifier' | null;

export function detectPattern(values: string[]): DetectedPattern {
  // Test regex patterns
  // Return most likely pattern
}
```

**Verification:**
- Detects email addresses
- Detects URLs
- Detects UUIDs (in VARCHAR columns)
- Returns null for generic strings

**Note:** Pattern detection only runs on VARCHAR/STRING columns. If DuckDB already detects a column as UUID type (common with JSON data containing UUID-formatted strings), pattern detection is unnecessary - the type system already knows it's a UUID. The "Pattern" column in the demo will show "-" for such columns, which is correct behavior.

### Task 2.4: Create Signal/Observable System

Create `src/core/Signal.ts`:

```typescript
export interface Signal<T> {
  get(): T;
  set(value: T): void;
  subscribe(callback: (value: T) => void): () => void;
}

export function createSignal<T>(initial: T): Signal<T>;

export interface Computed<T> {
  get(): T;
  subscribe(callback: (value: T) => void): () => void;
}

export function computed<T>(fn: () => T, deps: Signal<unknown>[]): Computed<T>;
```

**Verification:**
- Signal updates notify subscribers
- Computed values recompute on dependency change
- Unsubscribe works correctly

### Task 2.5: Create Core State Store

Create `src/core/State.ts`:

```typescript
export interface TableState {
  // Data
  tableName: Signal<string | null>;
  schema: Signal<ColumnSchema[]>;
  totalRows: Signal<number>;
  
  // Filters
  filters: Signal<Filter[]>;
  filteredRows: Computed<number>;
  
  // Sorting
  sortColumns: Signal<SortColumn[]>;
  
  // Columns
  visibleColumns: Signal<string[]>;
  columnOrder: Signal<string[]>;
  columnWidths: Signal<Map<string, number>>;
  pinnedColumns: Signal<string[]>;
  
  // Selection
  selectedRows: Signal<Set<number>>;
  
  // UI
  hoveredRow: Signal<number | null>;
  hoveredColumn: Signal<string | null>;
}

export function createTableState(): TableState;
```

**Verification:**
- All signals work correctly
- Computed values update appropriately

### Task 2.6: Create State Actions

Create `src/core/Actions.ts`:

```typescript
export class StateActions {
  constructor(private state: TableState, private bridge: WorkerBridge) {}

  async loadData(source: File | string, options?: LoadOptions): Promise<void>;
  
  addFilter(filter: Filter): void;
  removeFilter(column: string): void;
  clearFilters(): void;
  
  setSort(columns: SortColumn[]): void;
  toggleSort(column: string): void;
  
  hideColumn(column: string): void;
  showColumn(column: string): void;
  setColumnOrder(columns: string[]): void;
  
  selectRow(index: number, mode: 'replace' | 'toggle' | 'range'): void;
  clearSelection(): void;
}
```

**Verification:**
- Each action updates state correctly
- State changes propagate to subscribers

---

## Phase 3: Basic Table Rendering

**Goal:** Render a virtualized, interactive table.

### Task 3.1: Create Table Container Component

Create `src/table/TableContainer.ts`:

```typescript
export class TableContainer {
  private element: HTMLElement;
  private headerRow: HTMLElement;
  private bodyContainer: HTMLElement;
  
  constructor(container: HTMLElement, state: TableState) {
    // Create DOM structure
    // Set up resize observer
  }

  render(): void;
  destroy(): void;
}
```

**Verification:**
- Container renders with correct structure
- Resize observer fires on size change

### Task 3.2: Create Column Header Component

Create `src/table/ColumnHeader.ts`:

```typescript
export class ColumnHeader {
  private element: HTMLElement;
  
  constructor(
    private column: ColumnSchema,
    private state: TableState,
    private actions: StateActions
  ) {}

  render(): HTMLElement {
    // Column name
    // Type label
    // Stats line (placeholder)
    // Visualization container (placeholder)
    // Sort indicator
  }

  update(): void;
  destroy(): void;
}
```

**Verification:**
- Header renders with all sections
- Click triggers sort
- Shift+click adds to multi-sort

### Task 3.3: Implement Virtual Scrolling

Create `src/table/VirtualScroller.ts`:

```typescript
export class VirtualScroller {
  private scrollContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private visibleRange: { start: number; end: number };
  private rowHeight: number;
  private buffer: number;

  constructor(options: VirtualScrollerOptions) {}

  setTotalRows(count: number): void;
  getVisibleRange(): { start: number; end: number };
  scrollToRow(index: number): void;
  onScroll(callback: (range: { start: number; end: number }) => void): () => void;
}
```

**Verification:**
- Scroll container has correct total height
- Visible range updates on scroll
- Buffer rows render above/below viewport

### Task 3.4: Create Table Body Renderer

Create `src/table/TableBody.ts`:

```typescript
export class TableBody {
  private virtualScroller: VirtualScroller;
  private rowCache = new Map<number, HTMLElement>();
  
  constructor(
    private container: HTMLElement,
    private state: TableState,
    private bridge: WorkerBridge
  ) {}

  async render(): Promise<void>;
  private async fetchRows(start: number, end: number): Promise<Row[]>;
  private renderRow(index: number, data: Row): HTMLElement;
  private recycleRow(element: HTMLElement): void;
}
```

**Verification:**
- Renders visible rows only
- Scroll performance is smooth (60fps)
- Row data fetched lazily

### Task 3.5: Implement Cell Rendering

Create `src/table/Cell.ts`:

```typescript
export class CellRenderer {
  render(value: unknown, type: DataType, options?: CellOptions): HTMLElement {
    // Format based on type
    // Handle null display
    // Handle truncation
  }

  formatValue(value: unknown, type: DataType): string;
}
```

**Verification:**
- Numbers format with locale
- Dates format correctly
- Nulls display distinctively
- Long values truncate with ellipsis

### Task 3.6: Implement Row Hover and Selection

Update `TableBody.ts`:

```typescript
// Add to TableBody
private handleRowHover(index: number): void;
private handleRowClick(index: number, event: MouseEvent): void;
private renderSelectionState(): void;
```

**Verification:**
- Hover highlights row
- Click selects row
- Ctrl+click toggles selection
- Shift+click selects range

### Task 3.7: Implement Sorting UI

Update sorting interaction:

```typescript
// In ColumnHeader
private handleSortClick(event: MouseEvent): void {
  if (event.shiftKey) {
    this.actions.addToSort(this.column.name);
  } else {
    this.actions.toggleSort(this.column.name);
  }
}
```

**Verification:**
- Single click cycles: none → asc → desc → none
- Shift+click adds to multi-sort
- Sort badges show order (1, 2, 3...)
- Data re-fetches with new sort

### Task 3.8: Implement Column Resizing

Create `src/table/ColumnResizer.ts`:

```typescript
export class ColumnResizer {
  constructor(
    private header: HTMLElement,
    private onResize: (width: number) => void
  ) {}

  attachHandles(): void;
  detach(): void;
}
```

**Verification:**
- Drag handle appears on column border
- Dragging resizes column
- Min/max width constraints work

### Task 3.9: Implement Column Reordering

Create `src/table/ColumnReorder.ts`:

```typescript
export class ColumnReorder {
  constructor(
    private headers: HTMLElement[],
    private onReorder: (newOrder: string[]) => void
  ) {}

  enableDragDrop(): void;
  disable(): void;
}
```

**Verification:**
- Can drag column header
- Drop indicator shows position
- Column order updates on drop

---

## Phase 4: Column Visualizations

**Goal:** Add interactive mini-visualizations to column headers.

### Task 4.1: Create Visualization Base Class

Create `src/visualizations/BaseVisualization.ts`:

```typescript
export abstract class BaseVisualization {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected width: number;
  protected height: number;
  
  constructor(protected container: HTMLElement, protected column: ColumnSchema) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
  }

  abstract fetchData(): Promise<void>;
  abstract render(): void;
  abstract handleMouseMove(x: number, y: number): void;
  abstract handleClick(x: number, y: number): void;
  
  protected setupInteraction(): void;
  destroy(): void;
}
```

**Verification:** Base class instantiates, canvas renders

### Task 4.2: Implement Histogram Data Fetching

Create `src/visualizations/histogram/HistogramData.ts`:

```typescript
export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface HistogramData {
  bins: HistogramBin[];
  nullCount: number;
  min: number;
  max: number;
  total: number;
}

export async function fetchHistogramData(
  tableName: string,
  column: string,
  numBins: number,
  filters: Filter[],
  bridge: WorkerBridge
): Promise<HistogramData> {
  // Generate SQL for histogram
  // Execute query
  // Return structured data
}

export function calculateOptimalBins(
  min: number,
  max: number,
  count: number,
  iqr: number
): number {
  // Freedman-Diaconis rule
  // Fallback to Sturges
  // Clamp to 5-100
}
```

**Verification:**
- Bins calculated correctly
- SQL generation is correct
- Null count accurate

### Task 4.3: Implement Histogram Rendering

Create `src/visualizations/histogram/Histogram.ts`:

```typescript
export class Histogram extends BaseVisualization {
  private data: HistogramData | null = null;
  private backgroundData: HistogramData | null = null; // Unfiltered
  private hoveredBin: number | null = null;
  private brushRange: [number, number] | null = null;
  
  async fetchData(): Promise<void>;
  render(): void {
    // Clear canvas
    // Draw background bars (unfiltered)
    // Draw foreground bars (filtered)
    // Draw null bar
    // Draw axis labels
    // Draw brush selection
  }
  
  private drawBar(bin: HistogramBin, color: string, opacity: number): void;
  private drawNullBar(): void;
  private drawAxisLabels(): void;
  private drawBrushSelection(): void;
}
```

**Verification:**
- Histogram renders with correct proportions
- Colors match spec (blue bars, amber null)
- Axis labels show min/max

### Task 4.4: Implement Histogram Interaction

Add to `Histogram.ts`:

```typescript
handleMouseMove(x: number, y: number): void {
  // Determine which bin is hovered
  // Update hoveredBin
  // Update stats display
  // Re-render with highlight
}

handleClick(x: number, y: number): void {
  // If null bar clicked, filter to null
  // Otherwise, handled by brush
}

private handleBrushStart(x: number): void;
private handleBrushMove(x: number): void;
private handleBrushEnd(): void;
```

**Verification:**
- Hover highlights bar
- Stats update on hover
- Brush creates range filter
- Click null bar creates null filter

### Task 4.5: Implement Date Histogram

Create `src/visualizations/histogram/DateHistogram.ts`:

```typescript
export class DateHistogram extends BaseVisualization {
  private interval: TimeInterval;
  
  private detectInterval(min: Date, max: Date): TimeInterval {
    // Based on range, pick: seconds, minutes, hours, days, weeks, months, quarters, years
  }
  
  async fetchData(): Promise<void> {
    // Use DATE_TRUNC for binning
  }
  
  render(): void {
    // Similar to numeric histogram
    // Date-aware axis labels
  }
}
```

**Verification:**
- Auto-selects appropriate interval
- Bins dates correctly
- Labels format dates appropriately

### Task 4.6: Implement Value Counts Visualization

Create `src/visualizations/valuecounts/ValueCounts.ts`:

```typescript
export interface CategoryData {
  value: string;
  count: number;
  isUnique: boolean; // Part of "N unique values" aggregation
}

export interface ValueCountsData {
  categories: CategoryData[];
  uniqueCount: number; // Values appearing only once
  nullCount: number;
  total: number;
}

export class ValueCounts extends BaseVisualization {
  private data: ValueCountsData | null = null;
  private hoveredSegment: number | null = null;
  
  async fetchData(): Promise<void> {
    // Query top N categories
    // Count unique values
    // Count nulls
  }
  
  render(): void {
    // Draw stacked horizontal bar
    // Color segments by category
    // Labels inside when space permits
    // Null segment in amber
  }
}
```

**Verification:**
- Shows top 10 categories
- Aggregates low-frequency values
- Null segment displays correctly

### Task 4.7: Implement Value Counts Interaction

Add to `ValueCounts.ts`:

```typescript
handleMouseMove(x: number, y: number): void {
  // Determine which segment is hovered
  // Show tooltip with category, count, percentage
}

handleClick(x: number, y: number): void {
  // Create point filter for clicked category
  // Or set filter for clicked segment
}
```

**Verification:**
- Hover shows segment details
- Click creates appropriate filter

### Task 4.8: Implement Visualization Factory

Create `src/visualizations/VisualizationFactory.ts`:

```typescript
export class VisualizationFactory {
  private static registry = new Map<string, VisualizationConstructor>();

  static register(type: string, config: VisualizationConfig): void;
  
  static create(column: ColumnSchema, container: HTMLElement): BaseVisualization {
    // Determine appropriate visualization
    // For numeric: Histogram
    // For date/timestamp: DateHistogram
    // For string/boolean: ValueCounts
    // For time: TimeHistogram
  }
  
  static isApplicable(type: string, column: ColumnSchema): boolean;
}
```

File: BaseVisualization.ts

Problem: Window listeners for mouseup and keydown are attached per-visualization instance. If visualizations are created/destroyed rapidly (e.g., during column reorder), listeners accumulate. Leads to performance degradation over time. 

Fix: Use event delegation or a shared listener manager.

**Verification:**
- Correct visualization type selected per column type
- Plugin registration works

### Task 4.9: Crossfilter Integration (6 sub-tasks)

Implements the own-filter exclusion crossfilter pattern across all visualizations.

#### Sub-task 4.9.1: Add `updateFilters()` to BaseVisualization ✅
- Added `isFilterUpdate` flag and `updateFilters()` method
- `isDestroyed()` accessor (already existed)

#### Sub-task 4.9.2: Histogram dual-fetch + ghost bars ✅
- Exported `fetchColumnStats()`, `fetchDiscreteValues()` from HistogramData.ts
- Added `fetchHistogramBins()` and `fetchDiscreteBins()` for aligned bin queries
- Histogram.ts: dual-fetch (background excludes own filter, foreground includes all)
- "Glass partially full" rendering: faded background bars with bright foreground overdraw

#### Sub-task 4.9.3: DateHistogram + TimeHistogram crossfilter ✅
- Exported stats/interval functions from DateHistogramData.ts and TimeHistogramData.ts
- Added `fetchDateHistogramBins()`, `fetchDateNumericBins()`, `fetchTimeHistogramBins()`, `fetchTimeNumericBins()`
- Same dual-fetch + ghost bar pattern as Histogram

#### Sub-task 4.9.4: ValueCounts ghost segments ✅
- Horizontal "glass partially full": bright left portion (foreground), faded right remainder
- Category matching by value name between background and foreground
- Background determines segment widths; foreground determines fill proportion

#### Sub-task 4.9.5: CrossfilterCoordinator ✅
- New `src/visualizations/CrossfilterCoordinator.ts`
- Subscribes to `state.filters`, calls `updateFilters()` on all registered visualizations
- Routes `onFilterChange` callbacks through `StateActions`
- Updates `filteredRows` count after each filter change

#### Sub-task 4.9.6: Demo wiring + stats display ✅
- Demo routes all `onFilterChange` through coordinator
- Stats lines show "Filtered: X / Total: Y" when filters are active
- Table info bar shows active filter count
- Coordinator registered/unregistered on visualization create/destroy

**Verification:**
- Brush a numeric histogram → all other columns show ghost bars, stats show filtered count
- Click a ValueCounts segment → all histograms show crossfilter ghost bars
- Press Escape → filter removed, all visualizations revert, stats show total
- Multiple filters on different columns → all visualizations reflect compound filter
- Column reorder → crossfilter state preserved

---

## Phase 5: Filtering System

**Goal:** Implement formal filter UI, filter panels, and connect filters to table body rows.
**Note:** The crossfilter data flow, background rendering, and coordination are already in place from Task 4.9.
Phase 5 should focus on: formal `src/filters/` module structure, filter chip UI, filter bar component, and connecting filters to the table body's row queries.

### Task 5.1: Create Filter Types

Create `src/filters/FilterTypes.ts`:

```typescript
export interface RangeFilter {
  type: 'range';
  column: string;
  min: number | Date;
  max: number | Date;
}

export interface PointFilter {
  type: 'point';
  column: string;
  value: unknown;
}

export interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
}

export interface NullFilter {
  type: 'null' | 'not-null';
  column: string;
}

export interface PatternFilter {
  type: 'pattern';
  column: string;
  pattern: string;
  mode: 'contains' | 'starts' | 'ends' | 'regex';
}

export type Filter = RangeFilter | PointFilter | SetFilter | NullFilter | PatternFilter;
```

**Verification:** All filter types defined correctly

### Task 5.2: Implement SQL Generation from Filters

Create `src/filters/FilterSQL.ts`:

```typescript
export function filterToSQL(filter: Filter): string {
  switch (filter.type) {
    case 'range':
      return `"${filter.column}" BETWEEN ${formatValue(filter.min)} AND ${formatValue(filter.max)}`;
    case 'point':
      return `"${filter.column}" = ${formatValue(filter.value)}`;
    case 'set':
      return `"${filter.column}" IN (${filter.values.map(formatValue).join(', ')})`;
    case 'null':
      return `"${filter.column}" IS NULL`;
    case 'not-null':
      return `"${filter.column}" IS NOT NULL`;
    case 'pattern':
      return generatePatternSQL(filter);
  }
}

export function filtersToWhereClause(filters: Filter[]): string {
  // Group by column (OR within column)
  // AND across columns
}

export function formatValue(value: unknown): string {
  // SQL-safe formatting
}
```

**Verification:**
- Each filter type generates correct SQL
- Combination logic correct
- Values properly escaped

### Task 5.3: Implement Filter State Management

Update `src/core/State.ts`:

```typescript
// Add to TableState
filters: Signal<Filter[]>;
filtersByColumn: Computed<Map<string, Filter[]>>;

// In StateActions
addFilter(filter: Filter): void {
  const current = this.state.filters.get();
  // Check for duplicate
  this.state.filters.set([...current, filter]);
}

removeFilter(column: string, type?: FilterType): void {
  // Remove matching filters
}

clearFilters(): void {
  this.state.filters.set([]);
}
```

**Verification:**
- Adding filter updates state
- Multiple filters per column allowed
- Clear removes all filters

### Task 5.4: Implement Crossfilter Data Fetching

Create `src/filters/CrossfilterQuery.ts`:

```typescript
export async function fetchCrossfilterData(
  tableName: string,
  targetColumn: string,
  allFilters: Filter[],
  bridge: WorkerBridge
): Promise<VisualizationData> {
  // For crossfilter: exclude filters on targetColumn
  const otherFilters = allFilters.filter(f => f.column !== targetColumn);
  const whereClause = filtersToWhereClause(otherFilters);
  
  // Fetch data for visualization with other filters applied
}
```

**Verification:**
- Each column's viz excludes its own filters
- All other filters applied

### Task 5.5: Implement Filter UI Components

Create `src/filters/FilterChip.ts`:

```typescript
export class FilterChip {
  constructor(
    private filter: Filter,
    private onRemove: () => void
  ) {}

  render(): HTMLElement {
    // Chip with filter description
    // X button to remove
  }
  
  private formatFilterDescription(filter: Filter): string;
}
```

Create `src/filters/FilterBar.ts`:

```typescript
export class FilterBar {
  constructor(
    private container: HTMLElement,
    private state: TableState,
    private actions: StateActions
  ) {}

  render(): void {
    // Show all active filter chips
    // "Clear all" button
  }
}
```

**Verification:**
- Filter chips display correctly
- Remove button works
- Clear all works

### Task 5.6: Connect Visualizations to Filtering

Update visualizations to create filters:

```typescript
// In Histogram
private handleBrushEnd(): void {
  if (this.brushRange) {
    const [min, max] = this.brushRange;
    this.onFilterChange({
      type: 'range',
      column: this.column.name,
      min,
      max
    });
  }
}

// In ValueCounts
handleClick(x: number, y: number): void {
  const segment = this.getSegmentAt(x);
  if (segment) {
    this.onFilterChange({
      type: 'point',
      column: this.column.name,
      value: segment.value
    });
  }
}
```

**Verification:**
- Brush on histogram creates range filter
- Click on category creates point filter
- Escape clears brush

### Task 5.7: Implement Crossfilter Visual Update

Update visualization rendering:

```typescript
// In Histogram
render(): void {
  // Draw background (unfiltered data) at reduced opacity
  this.drawBars(this.backgroundData, '#2563eb', 0.2);
  
  // Draw foreground (filtered data) at full opacity
  this.drawBars(this.data, '#2563eb', 1.0);
}

async fetchData(): Promise<void> {
  // Fetch with crossfilter (exclude own filters)
  this.data = await fetchCrossfilterData(...);
  
  // Fetch background (no filters)
  this.backgroundData = await fetchHistogramData(/* no filters */);
  
  this.render();
}
```

**Verification:**
- Background shows full distribution
- Foreground shows filtered distribution
- Visual difference is clear

### Task 5.8: Implement Filter Indicators on Headers

Add a subtle top accent bar to column headers that have active filters. Uses an inset
`box-shadow` (no layout shift, no new DOM elements) to render a 3px blue line at the
top of the header cell—visible at a glance without competing with the sort badge.

Update `data-table.css` — add `box-shadow` to the `.dt-col-header` transition and a
new `.dt-col-header--filtered` modifier:

```css
.dt-col-header--filtered {
  box-shadow: inset 0 3px 0 0 var(--dt-primary);
}
```

Update `ColumnHeader.ts` — subscribe to `state.filtersByColumn` and toggle the class:

```typescript
private updateFilterIndicator(): void {
  const hasFilter = this.state.filtersByColumn.get().has(this.column.name);
  this.element.classList.toggle(
    `${this.classPrefix}-col-header--filtered`,
    hasFilter
  );
}
```

**Verification:**
- Blue accent bar appears at the top of a column header when it has an active filter
- Accent bar disappears when filter is removed

---

## Phase 6: Column Stats Panel and Column Header Actions

**Goal:** This phase covers two areas: (1) the already-completed column stats panel that shows rich data summaries in column headers, and (2) a new column header action panel providing pin, hide, sort, and filter controls directly in each column header.

**Architecture overview:** Each column header (`src/table/ColumnHeader.ts`) renders a vertical stack of elements: name row, type label, stats, and visualization. This phase adds a new action panel row between the name row and the type label. The action panel contains four icon buttons (pin, hide, sort, filter) styled gray by default and blue when active — matching the existing sort button's color scheme (`--dt-arrow-default` for gray, `--dt-primary` for blue). The buttons are spaced generously (`gap: 0.5rem` minimum) so users do not accidentally click the wrong one.

---

### Task 6.1: Column Stats Panel (Completed)

**Status:** Fully implemented.

**Summary:** Replaced the simple "N rows" stats line with a rich two-line stats panel answering three questions at a glance: How much data is there? What does it look like? Is there anything wrong with it?

Line 1 shows universal count and data quality (e.g., "892 / 1,234 rows · 3 null"). Line 2 shows type-specific distribution (e.g., "min 0 · med 42 · max 1.23e+6" for numerics, "12 unique" for strings, "67% true" for booleans, date ranges for temporals). Stats flow through visualization callbacks (`onDefaultStatsChange`) rather than independent queries, keeping them synchronized with visualizations and filter updates.

Key files:
- `src/statistics/ColumnStatsTypes.ts` — Discriminated union: `NumericColumnStats`, `CategoricalColumnStats`, `TemporalColumnStats`, `TimeColumnStats`, `IntervalColumnStats`
- `src/statistics/StatsFormatters.ts` — `formatDefaultStats()` produces two-line HTML with compact number formatting
- `src/statistics/StatsComputer.ts` — `fetchIntervalStats()` for columns without visualizations
- `src/visualizations/BaseVisualization.ts` — `onDefaultStatsChange` callback option
- Each visualization (`Histogram.ts`, `DateHistogram.ts`, `TimeHistogram.ts`, `ValueCounts.ts`) emits typed stats from `fetchData()`
- `demo/main.ts` — Wires stats callbacks, stores `currentDefaultStats` per column, restores rich stats after hover
- `src/styles/data-table.css` — `.dt-stats-line1`, `.dt-stats-line2` classes

No action required. All files are in place and working.

---

### Task 6.2: Column Header Action Panel and Pin Columns

**Goal:** Add a row of action icon buttons to each column header and implement column pinning (freeze panes like Excel). This task introduces the action panel DOM structure with all four icon buttons, but only the pin button is wired up. The hide and filter buttons are DOM placeholders for Tasks 6.3 and 6.5. The sort button stays in the name row for now (Task 6.4 will relocate it).

#### 6.2.1: Action Panel DOM and CSS

**Files to modify:**
- `src/table/ColumnHeader.ts` — Add action panel element creation in `createElement()` (currently lines 82–158)
- `src/styles/data-table.css` — Add styles for the action panel and icon buttons

**What to build:**

In `ColumnHeader.createElement()`, after creating `nameRow` and before creating `typeEl`, create a new `div.dt-col-action-panel` containing three `button` elements. (The sort button stays in the name row until Task 6.4.)

The resulting column header DOM structure becomes:
```
.dt-col-header
├── .dt-col-name-row
│   ├── .dt-col-name
│   ├── .dt-col-sort-btn          ← stays here until Task 6.4
│   └── .dt-col-drag-handle
├── .dt-col-action-panel          ← NEW
│   ├── .dt-col-action-btn.dt-col-pin-btn
│   ├── .dt-col-action-btn.dt-col-hide-btn    (placeholder, no handler yet)
│   └── .dt-col-action-btn.dt-col-filter-btn  (placeholder, no handler yet)
├── .dt-col-type
├── .dt-col-stats
└── .dt-col-viz
```

**CSS for the action panel — follow existing sort button patterns:**

The action panel is a flex row. Each button follows the same visual pattern as `.dt-col-sort-btn` and `.dt-col-drag-handle`: transparent background, subtle hover highlight, `border: none`, `cursor: pointer`. Key design requirement: **space the buttons generously** (`gap: 0.5rem` or more) so users do not accidentally click the wrong one.

Color behavior (same as existing sort arrows):
- Default: icon colored `var(--dt-arrow-default)` (gray, `#d1d5db`)
- Hover: icon colored `var(--dt-arrow-hover)` (medium gray, `#9ca3af`)
- Active state (e.g., column is pinned): icon colored `var(--dt-primary)` (blue, `#2563eb`)

Use `fill: currentColor` or `stroke: currentColor` in the SVGs so the CSS `color` property controls icon color.

**SVG icons** — use minimalistic, elegant designs at `viewBox="0 0 16 16"`:
- **Pin (thumbtack):** A thumbtack shape — pin head as a small filled circle or rectangle at top, needle/shaft extending down. Should be recognizable at 14×14px.
- **Hide (eye with slash):** An eye shape with a diagonal slash through it. Common "visibility off" icon pattern.
- **Filter (cone/funnel):** A funnel/cone shape — wide at top, narrow at bottom. Standard filter iconography.

Keep strokes at 1.5–2px for consistency. All three icons should feel like they belong to the same icon family.

#### 6.2.2: Pin Button Behavior

**Files to modify:**
- `src/table/ColumnHeader.ts` — Add click handler and state subscription for pin button
- `src/core/Actions.ts` — Enhance `toggleColumnPin()` (currently line 230) to also reorder columns

**Existing infrastructure:**
- `state.pinnedColumns: Signal<string[]>` already exists in `src/core/State.ts` (line 43)
- `actions.toggleColumnPin(column)` already exists in `src/core/Actions.ts` (line 230) — it adds/removes from the `pinnedColumns` array

**What to build in ColumnHeader:**
- Store a reference to the pin button element (similar to `this.sortButton`)
- Add a click handler that calls `this.actions.toggleColumnPin(this.column.name)`
- Subscribe to `state.pinnedColumns` and toggle a `dt-col-action-btn--active` class on the pin button based on whether this column is in the pinned set
- Clean up the listener and subscription in `destroy()`

**What to enhance in Actions.toggleColumnPin():**

Currently `toggleColumnPin()` only adds/removes from the `pinnedColumns` array. Enhance it so that when a column is pinned, it also moves in `visibleColumns` (and `columnOrder`) to the end of the pinned group. When unpinned, it moves to the first position after the remaining pinned columns.

Logic:
- **Pinning:** Remove the column from its current position in `visibleColumns`. Insert it after the last currently-pinned column. Update `columnOrder` similarly. The first pinned column becomes column 1, the second becomes column 2, etc.
- **Unpinning:** Remove the column from the pinned group. Insert it as the first unpinned column (immediately after the last remaining pinned column). This is the most intuitive position — the user sees it slide just to the right of the frozen section.

Call `setColumnOrder()` to persist the reordering (it also reorders `visibleColumns` to match).

#### 6.2.3: Sticky Positioning for Pinned Columns (Freeze Panes)

**Files to modify:**
- `src/table/TableContainer.ts` — Apply sticky positioning after render and on pin state changes
- `src/table/TableBody.ts` — Apply sticky positioning to body cells in pinned columns
- `src/styles/data-table.css` — Sticky column styles

**What to build:**

The freeze-pane effect requires `position: sticky` with computed `left` values on both header cells and body cells for pinned columns. This is what makes pinned columns stay in place while the user scrolls horizontally.

**In TableContainer:**
- Subscribe to `state.pinnedColumns` changes
- After render (and in `updateColumnWidths()`), compute sticky styles for pinned columns:
  - Iterate through pinned columns in order
  - For each pinned column at index `i`, compute cumulative left offset = sum of widths of all preceding pinned columns
  - Set on the header element: `position: sticky`, `left: {cumulativeLeft}px`, `z-index: {10 + pinnedCount - i}` (leftmost pinned column gets highest z-index so it visually overlaps rightward ones during scroll)
  - For unpinned columns, clear these inline styles

**In TableBody** (wherever cells are created in `updateRowContent()` or equivalent):
- Apply the same sticky positioning logic to body cells for pinned columns
- Body cells need opaque backgrounds (`var(--dt-bg)`) to prevent scrolling content from showing through
- A helper method like `getPinnedColumnStyles()` could be shared between header and body

**CSS additions:**
```css
.dt-col-header--pinned,
.dt-cell--pinned {
  position: sticky;
  z-index: 2; /* base z-index, overridden by inline style for stacking order */
}

/* Ensure opaque backgrounds so scrolling content doesn't show through */
.dt-col-header--pinned {
  background: var(--dt-bg-secondary);
}
.dt-cell--pinned {
  background: var(--dt-bg);
}

/* Shadow on the right edge of the last pinned column to indicate freeze boundary */
.dt-col-header--pinned-last,
.dt-cell--pinned-last {
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
}
```

The `--pinned-last` class goes on the rightmost pinned column's header and cells. Update this class when the pinned set changes.

#### 6.2.4: Pin/Unpin Animation

When a column is pinned or unpinned, add a smooth CSS animation so the column visually slides to its new position rather than jumping. This makes it intuitive to the user what the pin button does.

**Recommended approach — FLIP animation:**
1. Before reordering, capture `getBoundingClientRect()` of all column headers (**F**irst position)
2. Execute the reorder (which triggers re-render)
3. After re-render, capture new positions (**L**ast position)
4. Compute the delta and apply `transform: translateX(delta)` immediately (**I**nvert)
5. In the next frame, remove the transform with a CSS transition to animate to the final position (**P**lay)

This can be implemented in `TableContainer.render()` or as a separate utility. If the FLIP approach is too complex, a simpler alternative: apply `transition: transform 0.3s ease` to column headers and use `order` CSS property changes. The implementer should use their judgment — the functional behavior (columns reorder correctly, sticky positioning works) is more important than the animation. If animation complexity threatens the task, skip it and let columns reorder instantly.

**Verification:**
- Action panel appears below the name row in every column header with three icon buttons (pin, hide, filter) plus the existing sort button in the name row
- Pin button is gray by default, blue when the column is pinned
- Clicking pin moves the column to the left of the table (after existing pinned columns)
- Pinned columns stay fixed during horizontal scroll (freeze pane behavior)
- Multiple columns can be pinned; they accumulate at the left in order
- Unpinning moves the column to the first unpinned position
- Body cells for pinned columns also stay fixed during horizontal scroll
- The last pinned column has a subtle right shadow separating it from scrollable content
- Hide and filter buttons appear in the panel but have no behavior yet
- Dark mode: icon colors and shadow render correctly

---

### Task 6.3: Hide/Unhide Columns with Hidden Columns Gutter

**Goal:** Activate the hide button in the action panel and add a "hidden columns" gutter at the bottom of the table for restoring hidden columns. Also add labels to distinguish the filter bar from the hidden columns gutter.

**Existing infrastructure:**
- `actions.hideColumn(column)` — `src/core/Actions.ts` line 183 — removes from `visibleColumns`
- `actions.showColumn(column)` — `src/core/Actions.ts` line 195 — inserts back based on `columnOrder` position
- `visibleColumns` signal changes trigger `TableContainer.render()` — column headers are recreated
- FilterBar pattern (`src/filters/FilterBar.ts`) — collapse/expand gutter with chip elements — use as template

#### 6.3.1: Hide Button Behavior

**Files to modify:**
- `src/table/ColumnHeader.ts` — Activate the `.dt-col-hide-btn` created in Task 6.2

**What to build:**
- Add a click handler on `.dt-col-hide-btn` that calls `this.actions.hideColumn(this.column.name)`
- The column immediately disappears from `visibleColumns`, triggering a full re-render via the existing `TableContainer` subscription
- **Edge case:** Do not allow hiding the last visible column. If `visibleColumns.length <= 1`, either disable the button (add `disabled` attribute, gray it out) or silently ignore the click.
- No active/inactive toggle needed — hiding is a one-shot action; the button disappears with the column

#### 6.3.2: Neighbor-Tracking Restore Logic

**Files to modify:**
- `src/core/Actions.ts` — Enhance `hideColumn()` and `showColumn()` with neighbor tracking
- `src/core/State.ts` — Add a new signal to track hidden column metadata

**What to build:**

The current `showColumn()` inserts based on `columnOrder` position. This works well when columns haven't been reordered, but breaks down when the user has reordered columns after hiding. Replace it with neighbor-aware restore logic.

**New state signal** — add to `TableState` in `src/core/State.ts`:
```typescript
/** Metadata for hidden columns — tracks neighbors at hide time for intelligent restore */
hiddenColumnInfo: Signal<Map<string, HiddenColumnInfo>>;
```

Where:
```typescript
interface HiddenColumnInfo {
  column: string;
  leftNeighbor: string | null;   // visible column to the left at the moment of hiding
  rightNeighbor: string | null;  // visible column to the right at the moment of hiding
}
```

Initialize as `createSignal<Map<string, HiddenColumnInfo>>(new Map())` in `createTableState()`. Reset in `resetTableState()`.

**Enhanced `hideColumn()`:**
Before removing the column from `visibleColumns`, record its current left and right visible neighbors in the `hiddenColumnInfo` map.

**Enhanced `showColumn()` restore logic:**
1. Look up `HiddenColumnInfo` for the column
2. Get current `visibleColumns` array
3. Find the positions of `leftNeighbor` and `rightNeighbor` in `visibleColumns`
4. **Both neighbors still adjacent:** Insert between them
5. **Both neighbors visible but not adjacent** (columns have been reordered between them): Place next to whichever neighbor is closest to the column's original relative position. Use `columnOrder` as the reference for "original" position — check which neighbor the column was closer to in `columnOrder` and insert next to that one.
6. **One neighbor visible, other hidden:** Insert next to the visible one (after the left neighbor, or before the right neighbor)
7. **Both neighbors hidden:** Walk outward from the column's position in `columnOrder` to find the nearest visible column and insert next to it
8. **Fallback** (extensive reordering makes all heuristics fail, or no neighbors recorded): Append at end of `visibleColumns`
9. After restoring, remove the entry from `hiddenColumnInfo`

This is essentially how the DOM works with `insertBefore` — you're restoring relative position, not absolute index.

#### 6.3.3: Hidden Columns Gutter

**Files to create:**
- `src/table/HiddenColumnsGutter.ts` (new file)

**Files to modify:**
- `src/table/TableContainer.ts` — Instantiate and insert the gutter
- `src/styles/data-table.css` — Gutter styles

**What to build:**

Create a `HiddenColumnsGutter` class following the exact same pattern as `FilterBar` (`src/filters/FilterBar.ts`):
- Constructor takes `state`, `actions`, and options
- Subscribes to hidden column changes (either subscribe to `hiddenColumnInfo` or compute hidden columns by diffing `columnOrder` vs `visibleColumns`)
- Creates a DOM element: `div.dt-hidden-gutter`
- Contains a label ("Hidden columns"), chip elements for each hidden column, and a "Show all" button (visible when 2+ columns hidden)
- Each chip shows the column name and a restore icon button (an eye icon without the slash — the inverse of the hide icon — or a simple "+" icon)
- Clicking a chip's restore button calls `this.actions.showColumn(columnName)`
- "Show all" calls `showColumn()` for every hidden column
- Uses `max-height: 0` with CSS transition to collapse when no columns are hidden (same expand/collapse pattern as `.dt-filter-bar--hidden`)
- Has a `destroy()` method that unsubscribes and removes from DOM

**DOM placement in TableContainer:**

In `TableContainer`'s constructor, after appending `bodyScroll` to the root, append the hidden columns gutter. The final DOM structure:
```
.dt-root
├── .dt-header-area         (existing)
├── .dt-filter-bar           (existing, between header and body)
├── .dt-body-scroll          (existing)
└── .dt-hidden-gutter        (NEW, at very bottom)
```

**CSS — muted styling to be inconspicuous:**
```css
.dt-hidden-gutter {
  /* Same collapse/expand pattern as .dt-filter-bar */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-top: 1px solid var(--dt-border);
  background: var(--dt-bg);
  flex-shrink: 0;
  flex-wrap: wrap;
  overflow: hidden;
  max-height: 200px;
  transition: max-height 0.2s ease, padding 0.2s ease, border-top-color 0.2s ease;
}

.dt-hidden-gutter--hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-top-color: transparent;
}

/* Chips are more muted than filter chips — inconspicuous coloring */
.dt-hidden-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.25rem 0.125rem 0.5rem;
  background: var(--dt-bg-tertiary);   /* muted, unlike filter chips' --dt-primary-light */
  border: 1px solid var(--dt-border);  /* muted, unlike filter chips' --dt-primary border */
  border-radius: 999px;
  font-size: var(--dt-font-size-sm);
  color: var(--dt-text-secondary);
}
```

#### 6.3.4: Label Both Gutters

**Files to modify:**
- `src/filters/FilterBar.ts` — Add an "Active filters" label
- `src/table/HiddenColumnsGutter.ts` — Include a "Hidden columns" label
- `src/styles/data-table.css` — Label styling

**What to build:**

Add a small label element at the start of each gutter's content. In `FilterBar.createElement()`, insert a `span` with text "Active filters" before the chips container. Same for the hidden columns gutter with "Hidden columns".

Style both labels:
```css
.dt-gutter-label {
  font-size: var(--dt-font-size-xs);
  color: var(--dt-text-tertiary);
  white-space: nowrap;
  user-select: none;
}
```

The labels help users distinguish the two gutters at a glance.

**Verification:**
- Clicking the eye-slash button on a column hides it from the table
- A "Hidden columns" gutter appears at the bottom of the table with the hidden column as a chip
- The filter bar (when visible) now shows an "Active filters" label at its start
- Clicking a chip's restore button in the hidden gutter re-inserts the column at the correct position based on neighbor tracking
- Test the restore logic: hide column B (between A and C), reorder so A and C are separated, restore B → it appears next to whichever neighbor is closest to its original relative position
- Test: hide columns B and C (neighbors of each other), restore B → it walks outward to find a visible anchor
- The gutter collapses smoothly when all columns are restored
- Hiding is disabled/blocked for the last visible column
- The hidden gutter's muted styling is visually distinct from the filter bar's blue-accented styling
- Dark mode: both gutters render correctly

---

### Task 6.4: Move Sort Button to Action Panel

**Goal:** Relocate the sort button from the name row into the action panel, freeing horizontal space for long column names.

**Context for implementer:** The sort button is currently created in `ColumnHeader.createElement()` (around lines 116–136 of `src/table/ColumnHeader.ts`) as part of `nameRow`. It includes an SVG with `.arrow-up` and `.arrow-down` paths and a `.dt-col-sort-badge` span for multi-sort position indicators. The `handleSortClick` method (line 176) handles single-click (cycle asc→desc→none) and Cmd/Ctrl+click (multi-sort). The `update()` method (line 277) manages CSS classes `dt-col-sort-btn--asc` and `dt-col-sort-btn--desc`. Sort CSS is in `src/styles/data-table.css` (lines 446–513).

**Files to modify:**
- `src/table/ColumnHeader.ts` — Move sort button creation from `nameRow` section to `actionPanel` section
- `src/styles/data-table.css` — Adjust sort button sizing if needed for visual consistency in the action panel

**What to build:**

In `createElement()`:
1. **Remove** the sort button creation from the name row section. The sort button (`sortBtn`) and its badge (`sortBadge`) are currently appended to `nameRow`. Stop appending them there.
2. **Add** the sort button to the `.dt-col-action-panel` div, between the hide button and the filter button.
3. The sort button keeps its existing CSS class `.dt-col-sort-btn` (not `.dt-col-action-btn`) because it has specialized styling for the arrow SVG fill states. However, ensure it visually harmonizes with the other action panel buttons in terms of height and spacing.

The updated action panel order:
```
.dt-col-action-panel
├── .dt-col-action-btn.dt-col-pin-btn
├── .dt-col-action-btn.dt-col-hide-btn
├── .dt-col-sort-btn              ← MOVED here from name row
│   └── .dt-col-sort-badge
└── .dt-col-action-btn.dt-col-filter-btn
```

The name row simplifies to:
```
.dt-col-name-row
├── .dt-col-name
└── .dt-col-drag-handle
```

This gives the column name maximum horizontal space for display.

**Nothing changes in behavior:**
- Click to cycle sort (asc → desc → none)
- Cmd/Ctrl+click for multi-sort
- Sort badge shows position number during multi-sort
- Arrow colors: gray default, blue when sorted
- All existing CSS classes and state subscriptions work as before

**CSS adjustments:**
- Verify the sort button's `width`/`height` is consistent with the action panel button size (20×20px suggested in Task 6.2). Adjust `padding` if the arrow SVG looks too small or too large in the panel context.
- Verify the `.dt-col-sort-badge` (positioned absolutely at `top: -6px; right: -6px`) still renders correctly in the action panel's flex context. Adjust position if it gets clipped.

**Verification:**
- Sort button appears in the action panel, between hide and filter buttons
- Column name has noticeably more horizontal space (no sort button competing)
- Click to sort still works (asc → desc → none cycle)
- Cmd/Ctrl+click for multi-sort still works with correct badge numbers
- Sort arrows are gray by default, blue when actively sorted
- Sort badge renders correctly (not clipped by flex container)
- Drag handle remains at the right end of the name row
- No visual regression in any column header element

---

### Task 6.5: Manual Filter Creation Panel

**Goal:** Activate the filter button in the action panel and implement an interactive panel for creating filters manually. This complements the existing visualization-based filtering (clicking histogram bars, brushing) by giving users explicit control over filter parameters.

**Existing filter infrastructure:**
- `src/filters/FilterTypes.ts` — Discriminated union: `RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`
- `src/core/Actions.ts` — `addFilter(filter)` adds/replaces a filter for a column; `removeFilter(column, type?)` removes it
- `state.filters: Signal<Filter[]>` — all active filters
- `state.filtersByColumn: Computed<Map<string, Filter[]>>` — filters grouped by column
- `src/filters/FilterBar.ts` — Displays active filters as removable chips
- `src/filters/FilterSQL.ts` — `filtersToWhereClause()` converts `Filter[]` to SQL WHERE clause
- `CrossfilterCoordinator` — Coordinates visualization updates when filters change

**Column types** (`src/core/types.ts`): `'integer' | 'float' | 'decimal' | 'string' | 'boolean' | 'uuid' | 'date' | 'timestamp' | 'time' | 'interval'`

#### 6.5.1: Filter Panel Component

**Files to create:**
- `src/filters/FilterPanel.ts` — Main panel component
- `src/filters/FilterPanelField.ts` — Per-column filter control row

**Files to modify:**
- `src/table/ColumnHeader.ts` — Activate filter button click handler
- `src/table/TableContainer.ts` — Create and manage the FilterPanel instance
- `src/styles/data-table.css` — Filter panel styles

**What to build:**

The filter panel is a floating panel (like a dropdown/popover) that appears when the user clicks a filter button on any column header. It shows filter controls for **all columns** (not just the clicked one), with the clicked column highlighted or scrolled into view at the top. This allows the user to configure multiple filters without repeatedly opening and closing the panel.

**Panel lifecycle:**
- Created lazily by `TableContainer` when the filter button is first clicked
- One instance per table (not per column)
- Toggle behavior: clicking the filter button on the same column closes the panel; clicking on a different column repositions it and scrolls to that column
- Closes on: clicking outside the panel, pressing Escape, or clicking the panel's close button

**Panel DOM structure:**
```
.dt-filter-panel (positioned absolutely, anchored below the clicked column header)
├── .dt-filter-panel-header
│   ├── span "Create filters"
│   └── button.dt-filter-panel-close (× icon)
├── .dt-filter-panel-body (scrollable, contains all column fields)
│   ├── .dt-filter-panel-field (one per column from schema)
│   │   ├── .dt-filter-panel-field-name (column name + type badge)
│   │   └── .dt-filter-panel-field-controls (type-specific inputs)
│   ├── .dt-filter-panel-field
│   │   └── ...
│   └── ...
└── (no footer needed — filters apply immediately)
```

**Wiring in ColumnHeader:**
- The filter button's click handler should emit a custom event or call a callback (passed via `ColumnHeaderOptions`) with the column name. This avoids tight coupling between `ColumnHeader` and `FilterPanel`.
- Toggle the `dt-col-action-btn--active` class on the filter button when this column has active filters. Subscribe to `state.filtersByColumn` for this — the button is active whenever the column has filters, regardless of whether the panel is open.

**Wiring in TableContainer:**
- Create a `FilterPanel` instance (lazily, on first filter button click)
- Position it below the clicked column header using `getBoundingClientRect()` of the header element
- Append it to `.dt-root` with `position: absolute` (the root is already `position: relative` or can be made so)
- Handle outside clicks and Escape to close

#### 6.5.2: Type-Specific Filter Controls

**File:** `src/filters/FilterPanelField.ts`

Each column gets a `FilterPanelField` that renders controls appropriate for its data type. All controls create standard `Filter` objects from `src/filters/FilterTypes.ts` and call `actions.addFilter()` to apply.

**Numeric columns** (integer, float, decimal):
- A comparison mode dropdown: `between`, `=`, `!=`, `>`, `>=`, `<`, `<=`
- "Between" mode: two number inputs (min and max) → creates `RangeFilter { type: 'range', column, min, max }`
- Single-value modes: one number input → For `=` creates `PointFilter { type: 'point', column, value }`. For `>`, `>=`, `<`, `<=` creates `RangeFilter` with appropriate open bounds (check how `filtersToWhereClause()` in `src/filters/FilterSQL.ts` handles `Infinity`/`-Infinity` bounds; if it doesn't, add support)
- For `!=` use `NotSetFilter { type: 'not-set', column, values: [value] }` or extend the filter types if needed

**String columns:**
- A text input field
- A mode dropdown: "contains", "starts with", "ends with", "regex", "exact match"
- "contains"/"starts with"/"ends with"/"regex" → `PatternFilter { type: 'pattern', column, pattern, mode }` — the `mode` field already supports `'contains' | 'starts' | 'ends' | 'regex'` (see `FilterTypes.ts` line 44)
- "exact match" → `PointFilter { type: 'point', column, value }`

**Boolean columns:**
- Three checkboxes: true, false, null
- When only one boolean value checked: `PointFilter` or `SetFilter`
- When only null checked: `NullFilter { type: 'null' }`
- When true + false checked (excluding null): `NullFilter { type: 'not-null' }` (i.e., "show non-null only")
- All three checked or none checked: remove filter for this column

**Date/timestamp columns:**
- A comparison mode dropdown similar to numeric
- "Between" mode: two date inputs (`<input type="date">`, or `<input type="datetime-local">` for timestamps) → `RangeFilter` with string date values
- Single-value modes: one date input → appropriate `RangeFilter` or `PointFilter`

**Time columns:**
- Two time inputs (`<input type="time">`) for range
- Creates `RangeFilter` with time string values

**UUID columns:**
- Text input for exact match or pattern matching
- Dropdown: "exact match" or "contains"
- Creates `PointFilter` or `PatternFilter`

**Interval columns:**
- Simple text input for pattern matching (intervals are complex to filter numerically)
- Creates `PatternFilter` with `mode: 'contains'`

**All types — null toggle:**
- Every field includes an "is null" / "is not null" / "any" radio group or toggle at the bottom
- "is null" → `NullFilter { type: 'null', column }`
- "is not null" → `NullFilter { type: 'not-null', column }`
- "any" (default) → no null filter (combine with other filter if present)

**Filter application behavior:**
- Filters apply immediately when the user finishes entering a value (no separate "Apply" button)
- **Debounce** text inputs at 300ms to avoid excessive queries while typing
- When the user clears all inputs for a column, call `actions.removeFilter(column)` to remove the filter
- When the panel opens, **pre-populate controls** with existing filter values by reading `state.filtersByColumn` — if a column already has a filter (from visualization interaction or prior panel use), show its current values in the inputs

#### 6.5.3: Integration with Existing Filter System

**What to ensure:**
- Filters from the panel use the exact same `Filter` types as visualization-created filters
- They appear as chips in the existing `FilterBar` (automatic — `FilterBar` subscribes to `state.filters`)
- They coordinate with `CrossfilterCoordinator` — when a panel filter is applied, visualizations update their ghost/foreground bars (automatic — crossfilter subscribes to `state.filters`)
- **Removing a filter via FilterBar chip** also clears the corresponding panel controls: the panel should subscribe to `state.filtersByColumn` and update field states when filters are removed externally
- **Visualization filter vs panel filter:** Since `addFilter()` replaces the existing filter for a column, a panel filter will replace a visualization-created filter and vice versa. This is acceptable behavior — document it if needed.

#### 6.5.4: Filter Panel CSS

**Add to `src/styles/data-table.css`:**

```css
.dt-filter-panel {
  position: absolute;
  z-index: 1000;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 320px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.dt-filter-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--dt-border);
  font-weight: 600;
  font-size: var(--dt-font-size);
}

.dt-filter-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.dt-filter-panel-field {
  padding: 0.5rem;
  border-bottom: 1px solid var(--dt-border);
}

.dt-filter-panel-field-name {
  font-weight: 600;
  font-size: var(--dt-font-size-sm);
  margin-bottom: 0.25rem;
}

/* All form inputs inherit the library's design tokens */
.dt-filter-panel input,
.dt-filter-panel select {
  font-family: var(--dt-font-family);
  font-size: var(--dt-font-size-sm);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius-sm);
  padding: 0.25rem 0.5rem;
  background: var(--dt-bg);
  color: var(--dt-text);
}
```

Dark mode works automatically via the existing CSS custom property overrides in the `@media (prefers-color-scheme: dark)` block.

**Verification:**
- Filter button in the action panel turns blue when the column has an active filter
- Clicking the filter button opens a floating panel below the column header
- The panel lists all columns with type-appropriate controls
- The clicked column is highlighted or scrolled into view at the top
- Creating a filter immediately updates the table data (rows are filtered)
- The filter appears as a chip in the FilterBar
- Removing the FilterBar chip clears the corresponding panel control
- Visualization ghost bars update when a panel filter is applied (crossfilter coordination)
- Text inputs have debounce — typing doesn't trigger a query per keystroke
- Panel closes on outside click, Escape key, or close button
- Re-opening the panel shows pre-populated values for existing filters
- Boolean, date, time, and string filter types all produce correct SQL (test via the table updating correctly)
- Null/not-null toggle works for all column types
- Panel renders correctly in dark mode
- Panel positions correctly and doesn't overflow the viewport (adjust placement if near the edge)

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
