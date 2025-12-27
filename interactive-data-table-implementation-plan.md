# Interactive Data Table Library - Implementation Plan

## Executive Summary

This document provides a phased implementation plan for building a client-side JavaScript library for interactive, explorable data tables. The library uses DuckDB WASM for in-browser analytics, enabling complete privacy with no server-side processing.

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

**Duration:** 1-2 sessions

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

**Duration:** 3-4 sessions

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

**Duration:** 2-3 sessions

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

**Duration:** 3-4 sessions

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

**Duration:** 4-5 sessions

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
    // For time: TimeOfDayHistogram (optional)
  }
  
  static isApplicable(type: string, column: ColumnSchema): boolean;
}
```

**Verification:**
- Correct visualization type selected per column type
- Plugin registration works

### Task 4.9: Integrate Visualizations with Headers

Update `ColumnHeader.ts`:

```typescript
private visualization: BaseVisualization | null = null;

private initializeVisualization(): void {
  const viz = VisualizationFactory.create(this.column, this.vizContainer);
  viz.fetchData();
  this.visualization = viz;
}

private updateVisualization(): void {
  // Called when filters change
  this.visualization?.fetchData();
}
```

**Verification:**
- Each column shows appropriate visualization
- Visualizations update on filter change

---

## Phase 5: Filtering System

**Goal:** Implement complete filtering with crossfilter behavior.

**Duration:** 3-4 sessions

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

Update `ColumnHeader.ts`:

```typescript
private renderFilterBadge(): void {
  const hasFilter = this.state.filtersByColumn.get().has(this.column.name);
  this.filterBadge.style.display = hasFilter ? 'block' : 'none';
}
```

**Verification:**
- Badge appears when column has filter
- Badge disappears when filter removed

---

## Phase 6: Advanced Table Features

**Goal:** Add search, context menus, and statistics.

**Duration:** 3-4 sessions

### Task 6.1: Implement Global Search

Create `src/search/GlobalSearch.ts`:

```typescript
export class GlobalSearch {
  private searchInput: HTMLInputElement;
  private debounceTimer: number | null = null;
  
  constructor(
    private container: HTMLElement,
    private state: TableState,
    private bridge: WorkerBridge
  ) {}

  render(): HTMLElement;
  
  private async performSearch(query: string): Promise<SearchResult[]>;
  private highlightMatches(results: SearchResult[]): void;
}
```

**Verification:**
- Search box renders
- Typing triggers search (debounced)
- Results show match count

### Task 6.2: Implement Search Result Highlighting

Update table rendering:

```typescript
// In TableBody
private renderCell(value: unknown, searchMatches: Match[]): HTMLElement {
  if (searchMatches.length > 0) {
    return this.renderHighlightedCell(value, searchMatches);
  }
  return this.renderNormalCell(value);
}
```

**Verification:**
- Matching cells highlighted
- Matching text portion emphasized

### Task 6.3: Implement Context Menu System

Create `src/ui/ContextMenu.ts`:

```typescript
export interface MenuItem {
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export class ContextMenu {
  private element: HTMLElement | null = null;

  show(x: number, y: number, items: MenuItem[]): void;
  hide(): void;
}
```

**Verification:**
- Menu appears at click position
- Items render correctly
- Click outside closes menu

### Task 6.4: Implement Column Header Context Menu

Create `src/table/ColumnContextMenu.ts`:

```typescript
export function getColumnContextMenuItems(
  column: ColumnSchema,
  state: TableState,
  actions: StateActions
): MenuItem[] {
  return [
    { label: 'Sort Ascending', action: () => actions.setSort([{ column: column.name, direction: 'asc' }]) },
    { label: 'Sort Descending', action: () => actions.setSort([{ column: column.name, direction: 'desc' }]) },
    { label: 'Clear Sort', action: () => actions.clearSort() },
    { divider: true },
    { label: 'Hide Column', action: () => actions.hideColumn(column.name) },
    { label: state.pinnedColumns.get().includes(column.name) ? 'Unpin' : 'Pin', action: () => actions.togglePin(column.name) },
    { divider: true },
    { label: 'Filter to Non-Null', action: () => actions.addFilter({ type: 'not-null', column: column.name }) },
    { label: 'Show Statistics', action: () => showStatisticsModal(column) },
  ];
}
```

**Verification:**
- Right-click on header shows menu
- All actions work

### Task 6.5: Implement Cell Context Menu

Create `src/table/CellContextMenu.ts`:

```typescript
export function getCellContextMenuItems(
  row: number,
  column: string,
  value: unknown,
  actions: StateActions
): MenuItem[] {
  return [
    { label: 'Copy Value', action: () => navigator.clipboard.writeText(String(value)) },
    { label: 'Filter to This Value', action: () => actions.addFilter({ type: 'point', column, value }) },
    { label: 'Exclude This Value', action: () => actions.addFilter({ type: 'exclude', column, value }) },
    { divider: true },
    { label: 'Copy Row', action: () => copyRowToClipboard(row) },
  ];
}
```

**Verification:**
- Right-click on cell shows menu
- Copy works
- Filter actions work

### Task 6.6: Implement Statistics Panel

Create `src/statistics/StatisticsPanel.ts`:

```typescript
export interface NumericStats {
  count: number;
  nullCount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  q1: number;
  q3: number;
  distinct: number;
}

export async function fetchNumericStats(
  tableName: string,
  column: string,
  bridge: WorkerBridge
): Promise<NumericStats>;

export class StatisticsPanel {
  constructor(private column: ColumnSchema, private bridge: WorkerBridge) {}
  
  async render(): Promise<HTMLElement>;
}
```

**Verification:**
- Stats calculated correctly
- Panel displays all values
- Works for numeric, categorical, temporal

### Task 6.7: Implement Stats Display in Header

Update `ColumnHeader.ts`:

```typescript
private statsLine: HTMLElement;

private updateStats(context?: 'default' | 'hover' | 'selection'): void {
  // Default: "1,234 rows"
  // Hover: "[45..67]: 234 rows (18.9%)"
  // Selection: "Selected: 456 rows (37.0%)"
}
```

**Verification:**
- Stats line updates on hover
- Stats line updates on selection
- Formatting correct

### Task 6.8: Implement Column Visibility Panel

Create `src/table/ColumnVisibilityPanel.ts`:

```typescript
export class ColumnVisibilityPanel {
  constructor(
    private state: TableState,
    private actions: StateActions
  ) {}

  render(): HTMLElement {
    // List all columns with checkboxes
    // Drag to reorder
    // "Reset" button
  }
}
```

**Verification:**
- Can hide/show columns
- Can reorder columns
- Reset restores defaults

---

## Phase 7: Export & Persistence

**Goal:** Enable data export and session persistence.

**Duration:** 2-3 sessions

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

**Duration:** 4-5 sessions

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

**Duration:** 3-4 sessions

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
