# API Reference

Single-page reference for `@jeyabbalas/data-table`. For task-oriented walkthroughs, start with [Examples](../examples/README.md) or [AGENTS.md](../AGENTS.md).

Every row links back to the source of truth (`src/<file>:<line>`). When the source disagrees with this page, trust the source.

## Contents

- [Package entry points](#package-entry-points)
- [Tier-1 exports (root)](#tier-1-exports)
- [Tier-2 exports (`/advanced`)](#tier-2-exports)
- [`createDataTable(options)`](#createdatatable)
- [`CreateDataTableOptions`](#createdatatableoptions)
- [`DataTable` interface](#datatable-interface)
- [`state` signals (`TableState`)](#state-signals)
- [`actions` methods (`StateActions`)](#actions-methods)
- [Event catalog](#event-catalog)
- [Error catalog](#error-catalog)
- [Filter types](#filter-types)
- [Derived columns](#derived-columns)
- [Serialization helpers](#serialization-helpers)
- [Browser support probe](#browser-support-probe)
- [i18n (`Strings`)](#i18n-strings)

---

## Package entry points

| Import path | Purpose |
|---|---|
| `@jeyabbalas/data-table` | Facade: `createDataTable`, types, errors, filter helpers, i18n helpers. 95% of consumers only need this. |
| `@jeyabbalas/data-table/advanced` | Low-level building blocks: `StateActions`, `UndoManager`, table/filter/derived components, export helpers, `BaseVisualization`. |
| `@jeyabbalas/data-table/styles` (or `/styles.css`) | Side-effect CSS bundle. Import once before `createDataTable()`. |

Source: `package.json` `exports` field.

---

## Tier-1 exports

Exported from `@jeyabbalas/data-table`. Source: `src/index.ts`.

### Version & facade

| Symbol | Kind | Purpose |
|---|---|---|
| `VERSION` | const string | Library version (`'0.1.0'`). |
| `createDataTable(options)` | function | Mount a fully-wired table. Returns `Promise<DataTable>`. |
| `DataTable` | interface | Returned object (state, actions, bridge, container, methods). |
| `CreateDataTableOptions` | interface | Options accepted by `createDataTable()`. |
| `ColorScheme` | type | `'light' \| 'dark' \| 'auto'`. |

### Events

| Symbol | Kind | Purpose |
|---|---|---|
| `TableEvents` | type | Event-name → payload map. |
| `TableEventName` | type | `keyof TableEvents`. |
| `TableErrorSource` | type | Discriminator for the `error` event (`'load' \| 'query' \| 'export' \| 'persistence' \| 'visualization' \| 'sql-validation' \| 'derived-column' \| 'listener' \| 'unknown'`). |

### Error classes

All extend `Error` and carry a `code: string` and optional `details: Record<string, unknown>`. See [Error catalog](#error-catalog) for code meanings.

| Class | When thrown |
|---|---|
| `DataTableError` | Base class (alias for any of the below). |
| `DataTableErrorOptions` | Constructor options shape. |
| `WorkerInitError` | Worker bootstrap / browser-support probe failures. |
| `WorkerTerminatedError` | Worker was terminated (intentionally or unexpectedly). |
| `QueryError` | DuckDB query failed at runtime or was aborted. |
| `LoadError` | CSV/JSON/Parquet parse or fetch failure. |
| `SQLValidationError` | Raw-SQL filter or derived-column expression had a syntax/validation error. |
| `DerivedColumnError` | Derived-column lifecycle error (`EXPRESSION_INVALID`, `CIRCULAR_DEPENDENCY`, `NOT_FOUND`). |
| `PersistenceError` | IndexedDB write failure. |
| `ExportError` | Export pipeline failure (missing table, canvas unavailable, clipboard blocked). |
| `ConfigurationError` | Invalid option, bad preset, internal invariant. |
| `DestroyedError` | Public method called after `destroy()`. |

### Core types

| Symbol | Kind | Purpose |
|---|---|---|
| `DataType` | type | `'integer' \| 'float' \| 'decimal' \| 'string' \| 'boolean' \| 'uuid' \| 'date' \| 'timestamp' \| 'time' \| 'interval'`. |
| `ColumnSchema` | interface | `{ name, type, nullable, originalType }`. |
| `Filter` | type | Discriminated union of 7 filter shapes. |
| `FilterType` | type | `Filter['type']`. |
| `SortColumn` | interface | `{ column: string; direction: SortDirection }`. |
| `SortDirection` | type | `'asc' \| 'desc'`. |

### Filter shapes

See [Filter types](#filter-types) for full fields. Union members: `RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`, `RawSQLFilter`.

### SQL authoring helpers

| Symbol | Signature | Purpose |
|---|---|---|
| `quoteIdentifier` | `(name: string) => string` | Quote a column/table identifier for DuckDB. |
| `formatSQLValue` | `(value: unknown, type?: DataType) => string` | Format a JS value as a DuckDB literal. |

### Filter presets

| Symbol | Kind | Purpose |
|---|---|---|
| `FilterPresetManager` | class | Save/load/export/import named filter sets. |
| `FilterPreset` | type | `{ id, name, description?, filters, sortColumns? }`. |
| `FilterPresetCollection` | type | Exportable array of presets with version metadata. |

### Data layer

| Symbol | Kind | Purpose |
|---|---|---|
| `WorkerBridge` | class | DuckDB worker bridge; owns the worker and query cache. |
| `LoadOptions` | interface | CSV/JSON/Parquet per-format options. |
| `WorkerBridgeOptions` | interface | `workerFactory`, `workerUrl`, `duckdbBundles`, `initTimeoutMs`. |
| `DataFormat` | type | `'csv' \| 'json' \| 'parquet'`. |
| `LoadResult` | interface | `{ tableName, rowCount, schema }` returned by the bridge. |

### Persistence

| Symbol | Kind | Purpose |
|---|---|---|
| `SessionStore` | class | IndexedDB-backed snapshot store. |
| `serializeFilter(filter)` | function | `Filter` → JSON-safe `SerializedFilter`. |
| `deserializeFilter(serialized)` | function | `SerializedFilter` → `Filter \| null` (null if unknown type). |
| `SerializedFilter` | type | JSON-safe filter representation. |

### Visualizations

| Symbol | Kind | Purpose |
|---|---|---|
| `VisualizationRegistry` | class | Per-instance registry of visualization classes. |
| `defaultVisualizationRegistry` | const instance | Fallback registry when `visualizationRegistry` option is omitted. |
| `VisualizationRegistration` | interface | `{ name, isApplicable, constructor, priority }`. |
| `VisualizationConstructor` | type | `new (container, column, options) => BaseVisualization`. |

### Derived columns

| Symbol | Kind | Purpose |
|---|---|---|
| `DerivedColumnKind` | type | `'expression' \| 'vector'`. |
| `VectorDataType` | type | Supported vector types (see [Derived columns](#derived-columns)). |
| `ExpressionColumnDef` | interface | `{ kind: 'expression', name, expression }`. |
| `VectorColumnDef` | interface | `{ kind: 'vector', name, vectorType, values }`. |
| `DerivedColumnDef` | type | Union of the two. |
| `CompletionContext` | interface | Schema + function list passed to expression editors. |
| `ExpressionEditor` | type | Editor contract (`getValue`, `setValue`, `focus`, `destroy`, …). |
| `ExpressionEditorFactory` | type | `(container, context, classPrefix, config?) => ExpressionEditor`. |

### Progress

| Symbol | Kind | Purpose |
|---|---|---|
| `ProgressInfo` | type | `{ stage, bytesLoaded?, totalBytes?, percent? }`. |
| `ProgressCallback` | type | `(info: ProgressInfo) => void`. |
| `ProgressStage` | type | `'download' \| 'decode' \| 'register' \| 'ingest' \| 'finalize'`. |

### i18n

| Symbol | Kind | Purpose |
|---|---|---|
| `defaultStrings` | const | English strings catalog. |
| `mergeStrings(overrides)` | function | Deep-merge partial overrides into `defaultStrings`. |
| `Strings` | interface | Full i18n shape. |
| `DeepPartial<T>` | type | Helper used for partial overrides. |

### Utilities

| Symbol | Signature | Purpose |
|---|---|---|
| `isStylesheetLoaded` | `(root?: HTMLElement) => boolean` | Detects whether `@jeyabbalas/data-table/styles` was imported (checks `--dt-stylesheet-loaded`). |
| `checkBrowserSupport` | `() => BrowserSupport` | Sync probe for required browser APIs. |
| `BrowserSupport` | interface | `{ supported: boolean; missing: string[] }`. |

---

## Tier-2 exports

Exported from `@jeyabbalas/data-table/advanced`. Source: `src/advanced.ts`. Reach into these only when the facade doesn't expose what you need — see [When to use `/advanced`](../AGENTS.md#when-to-use-advanced).

### Low-level state & reactive primitives

| Symbol | Kind | Purpose |
|---|---|---|
| `EventEmitter` | class | Type-safe pub/sub; drives `table.on/off`. |
| `StateActions` | class | Command/mutation layer (see [actions methods](#actions-methods)). |
| `LoadDataOptions` | interface | Options passed to `actions.loadData` / `table.loadData`. |
| `createTableState()` | function | Build a fresh `TableState` (all signals initialized). |
| `resetTableState(state)` | function | Reset every signal to its empty default. |
| `initializeColumnsFromSchema(state, schema)` | function | Populate `schema`, `visibleColumns`, `columnOrder` from a `ColumnSchema[]`. |
| `TableState` | interface | Reactive state shape (see [state signals](#state-signals)). |
| `HiddenColumnInfo` | interface | Neighbor metadata recorded when a column is hidden. |
| `UndoManager` | class | Two-stack undo/redo manager. |
| `captureSnapshot(state)` | function | Read signals into a `StateSnapshot`. |
| `applySnapshot(state, snapshot)` | function | Write a `StateSnapshot` back into signals. |
| `derivedColumnsEqual(a, b)` | function | Shallow structural equality for derived-column lists. |
| `StateSnapshot` | type | Lightweight view-state snapshot (filters, sort, columns, derived). |

### Table UI components

| Symbol | Kind | Purpose |
|---|---|---|
| `TableContainer` | class | Main DOM container that composes every UI piece. |
| `TableContainerOptions` | interface | Ctor options (rowHeight, headerHeight, classPrefix, instanceId, colorScheme, messages, …). |
| `ResizeCallback` | type | `(rect: DOMRect) => void` for resize observers. |
| `ColumnHeader` | class | Renders a single column header cell (label, stats, viz canvas). |
| `ColumnHeaderOptions` | interface | Header ctor options. |
| `VirtualScroller` | class | Virtual row windowing for large datasets. |
| `VirtualScrollerOptions` | interface | Scroller ctor options. |
| `VisibleRange` | type | `{ startIndex, endIndex }`. |
| `ScrollCallback` | type | `(info) => void`. |
| `ScrollAlign` | type | `'start' \| 'center' \| 'end' \| 'auto'`. |
| `TableBody` | class | Row rendering inside the scroller. |
| `TableBodyOptions` | interface | Body ctor options. |
| `RowData` | interface | Row-level data passed to `CellRenderer`. |
| `CellRenderer` | class | Renders a single cell (type-aware formatting). |
| `CellOptions` | interface | Cell ctor options. |
| `ColumnReorder` | class | Drag-to-reorder controller for column headers. |
| `ColumnReorderOptions` | interface | Reorder ctor options. |
| `ReorderCallback` | type | `(newOrder: string[]) => void`. |
| `HiddenColumnsGutter` | class | Renders the gutter that surfaces hidden columns. |
| `HiddenColumnsGutterOptions` | interface | Gutter ctor options. |
| `KeyboardNavigator` | class | Roving-tabindex / arrow-key navigation for the grid. |
| `KeyboardNavigatorOptions` | interface | Navigator ctor options. |

### Filter UI components

| Symbol | Kind | Purpose |
|---|---|---|
| `FilterChip` | class | Single filter chip with removal control. |
| `FilterChipOptions` | interface | Chip ctor options. |
| `FilterBar` | class | Horizontal bar of active filter chips. |
| `FilterBarOptions` | interface | Bar ctor options. |
| `FilterPanel` | class | Per-column popover holding one or more `FilterPanelField`s. |
| `FilterPanelOptions` | interface | Panel ctor options. |
| `FilterPanelField` | class | Single type-specific input (numeric range, categorical picker, pattern, null toggle). |
| `FilterPanelFieldOptions` | interface | Field ctor options. |
| `SQLFilterModal` | class | Modal editor for raw-SQL (`RawSQLFilter`) filters. |
| `SQLFilterModalOptions` | interface | Modal ctor options. |
| `FilterPresetPanel` | class | Save/load/export preset panel. |
| `FilterPresetPanelOptions` | interface | Panel ctor options. |

### Derived-column UI

| Symbol | Kind | Purpose |
|---|---|---|
| `DerivedColumnEditPanel` | class | Inline "edit column" inspector attached to a header. |
| `DerivedColumnEditPanelOptions` | interface | Panel ctor options. |
| `DerivedColumnModal` | class | Create/edit modal (expression + vector modes). |
| `DerivedColumnModalOptions` | interface | Modal ctor options. |
| `AddColumnButton` | class | The "+" button that opens `DerivedColumnModal`. |
| `AddColumnButtonOptions` | interface | Button ctor options. |
| `DefaultExpressionEditor` | class | Minimal plain-textarea fallback editor. |
| `DerivedColumnManager` | class | DuckDB-side lifecycle (VIEW, vector helper tables, validation). |
| `DerivedColumnInfo` | interface | Stored def + detected type metadata. |
| `CodeMirrorExpressionEditor` | class | CodeMirror 6 editor with DuckDB SQL grammar + autocompletion. |
| `DUCKDB_FUNCTIONS` | const array | Function names/signatures surfaced by autocomplete. |

### Export (low-level)

| Symbol | Kind | Purpose |
|---|---|---|
| `ExportDialog` | class | Modal dialog (format, scope, columns, download/copy). |
| `ExportDialogOptions` | interface | Dialog ctor options. |
| `exportToCSV(rows, opts)` | function | Serialize a row array to CSV. |
| `exportFromState(state, bridge, opts)` | function | CSV export straight from a live table. |
| `ExportOptions` | interface | `{ scope, columns, includeHeaders, delimiter, nullValue }`. |
| `exportToJSON(rows, opts)` | function | Serialize to JSON. |
| `exportJSONFromState(state, bridge, opts)` | function | JSON export from a live table. |
| `JSONExportOptions` | interface | JSON-specific options. |
| `exportToParquet(rows, opts)` | function | Serialize to Parquet. |
| `exportParquetFromState(state, bridge, opts)` | function | Parquet export from a live table. |
| `ParquetExportOptions` | interface | Parquet-specific options. |
| `copyToClipboard(rows, opts)` | function | Copy rendered rows to the system clipboard. |
| `copyRowsToClipboard(rows, opts)` | function | Alias kept for legacy callers. |
| `ExportContext` | type | Shared context passed between export helpers. |

### Persistence internals

| Symbol | Kind | Purpose |
|---|---|---|
| `AutoSave` | class | Debounces writes to `SessionStore`. |
| `AutoSaveOptions` | interface | `{ debounceMs, undoManager, presetManager, onError }`. |
| `SessionSnapshot` | type | Full on-disk snapshot (`schema`, `state`, `derivedColumns`, `undo`, `redo`, `presets`). |
| `SerializedStateSnapshot` | type | JSON-safe portion of `SessionSnapshot`. |
| `SerializedDerivedColumnDef` | type | JSON-safe derived-column def (vector refs pooled). |
| `PooledVectorColumnRef` | type | Reference to a pooled vector value list. |
| `VectorValuePoolEntry` | type | A single pool entry. |
| `DateWrapper` | type | `{ __date__: string }` marker used to round-trip `Date`. |
| `SNAPSHOT_VERSION` | const | Snapshot schema version bumped on breaking changes. |
| `isPooledVectorRef(value)` | function | Type guard for `PooledVectorColumnRef`. |

### Statistics

| Symbol | Kind | Purpose |
|---|---|---|
| `ColumnStatsData` | type | Union of all stat-kind data shapes. |
| `NumericColumnStats` | type | Numeric stats (min, max, median, sum, …). |
| `CategoricalColumnStats` | type | Categorical stats (distinct count, top values, …). |
| `TemporalColumnStats` | type | Date/timestamp stats. |
| `TimeColumnStats` | type | TIME stats. |
| `IntervalColumnStats` | type | INTERVAL stats. |
| `BaseColumnStats` | type | Common fields (`totalCount`, `nullCount`). |
| `statsKindForDataType(type)` | function | Pick the stats kind for a `DataType`. |
| `formatStatValue(value, type, locale?)` | function | Format a single stat value. |
| `formatCount(n, locale?)` | function | Locale-aware integer formatting. |
| `formatDefaultStats(stats, type, messages)` | function | Produce the multi-line stats block shown in headers. |
| `fetchIntervalStats(bridge, table, column, filters)` | function | Compute interval stats on demand. |

### Visualization internals

| Symbol | Kind | Purpose |
|---|---|---|
| `BaseVisualization` | abstract class | Base for canvas visualizations (subclass to add custom viz types). |
| `VisualizationOptions` | interface | Ctor options (`bridge`, `state`, `filters`, `classPrefix`, …). |
| `Histogram` | class | Numeric histogram. |
| `DateHistogram` | class | Date/timestamp histogram. |
| `TimeHistogram` | class | TIME histogram. |
| `IntervalHistogram` | class | INTERVAL histogram. |
| `ValueCounts` | class | Categorical stacked-segment bar. |
| `HistogramBin`, `HistogramData`, `DateHistogramBin`, `DateHistogramData`, `TimeInterval`, `TimeHistogramBin`, `TimeHistogramData`, `IntervalHistogramBin`, `IntervalHistogramData` | types | Per-viz data shapes. |
| `CategorySegment`, `ValueCountsData` | types | Shapes for `ValueCounts`. |
| `CrossfilterCoordinator` | class | Broadcasts filter changes to registered visualizations. |
| `InteractionManager` | class | LIFO Escape-key stack for brush/selection interactions. |
| `InteractiveVisualization` | type | Interface implemented by visualizations participating in `InteractionManager`. |
| `isNumericType`, `isDateType`, `isTimeType`, `isCategoricalType`, `isIntervalType`, `needsVisualization` | functions | `DataType` predicates. |
| `VisualizationFactory` | class (**deprecated**) | Legacy static wrapper kept on `/advanced` only. New code uses `VisualizationRegistry` from the root entry. |

---

## `createDataTable`

```ts
function createDataTable(options: CreateDataTableOptions): Promise<DataTable>
```

Source: `src/DataTable.ts`. Validates options, initializes a `WorkerBridge`, builds `TableState`/`StateActions`, mounts the UI into `options.container`, wires events/persistence/presets/undo-redo, and resolves once UI is mounted. If `options.source` is provided, the initial load begins asynchronously (not awaited by the returned promise — subscribe to `loadComplete` or `loadError` to observe it).

---

## `CreateDataTableOptions`

Source: `src/DataTable.ts:124-223`.

### Mounting

| Field | Type | Required? | Default | Description |
|---|---|---|---|---|
| `container` | `HTMLElement` | yes | — | Element that will host the table. The library takes full ownership of its contents. |

### Data

| Field | Type | Required? | Default | Description |
|---|---|---|---|---|
| `source` | `File \| string \| ArrayBuffer \| Blob` | no | — | Initial data source. If omitted, call `table.loadData(source)` later. |
| `sourceFormat` | `DataFormat` | no | auto-detect | Override format when the URL/filename doesn't encode it. |
| `tableName` | `string` | no | auto-generated | DuckDB-side table name. |

### Features (all default to `true`)

| Field | Type | Default | Description |
|---|---|---|---|
| `persistence` | `boolean \| { sessionStore?: SessionStore }` | `true` | IndexedDB session snapshot. Pass `{ sessionStore }` to reuse an existing store across tables. |
| `presets` | `boolean \| { manager?: FilterPresetManager }` | `true` | Filter preset UI + storage. Pass `{ manager }` to share across tables. |
| `undoRedo` | `boolean` | `true` | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z. |
| `expressionFilter` | `boolean` | `true` | Raw-SQL filter button in the filter bar. |
| `visualizations` | `boolean` | `true` | Auto-attach column-header histograms and value counts. |
| `visualizationRegistry` | `VisualizationRegistry` | `defaultVisualizationRegistry` | Per-instance registry for custom visualizations. |
| `exportDialog` | `boolean` | `true` | Built-in export dialog (CSV/JSON/Parquet). |

### Worker

| Field | Type | Required? | Default | Description |
|---|---|---|---|---|
| `bridge` | `WorkerBridge` | no | new one created | Share a worker across tables. |
| `bridgeOptions` | `WorkerBridgeOptions` | no | `{}` | Options for the owned bridge (`workerFactory`, `workerUrl`, `duckdbBundles`, `initTimeoutMs`). Ignored when `bridge` is supplied. |

### UI

| Field | Type | Required? | Default | Description |
|---|---|---|---|---|
| `portalTarget` | `HTMLElement` | no | `document.body` | Where fixed-position modals mount. |
| `rowHeight` | `number` | no | `32` | Row height in pixels. |
| `headerHeight` | `number` | no | `120` | Header height in pixels (accommodates visualizations). |
| `colorScheme` | `ColorScheme` | no | `'auto'` | Initial light/dark theme. |
| `classPrefix` | `string` | no | `'dt'` | CSS class prefix for full isolation. |

### Customization

| Field | Type | Required? | Default | Description |
|---|---|---|---|---|
| `instanceId` | `string` | no | auto-generated | Mixed into element IDs to avoid `aria-labelledby` collisions. |
| `editorFactory` | `ExpressionEditorFactory` | no | CodeMirror editor | Plug a custom expression editor. |
| `messages` | `DeepPartial<Strings>` | no | `defaultStrings` | Override user-facing strings. Consumed once at init — rebuild to change. |
| `strictBrowserCheck` | `boolean` | no | `false` | When true, reject init with `WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`) if any required browser API is missing. |

---

## `DataTable` interface

Returned by `createDataTable()`. Source: `src/DataTable.ts:228-312`.

### Properties

| Property | Type | Purpose |
|---|---|---|
| `state` | `TableState` | Reactive signals. See [state signals](#state-signals). |
| `actions` | `StateActions` | Command/mutation layer. See [actions methods](#actions-methods). |
| `bridge` | `WorkerBridge` | DuckDB worker bridge for custom SQL. |
| `container` | `TableContainer` | UI container. Rarely needed directly. |
| `instanceId` | `string` | Unique per-instance identifier (e.g., `'t1-a3f9'`). |

### Methods

| Method | Signature | Purpose |
|---|---|---|
| `loadData` | `(source, opts?) => Promise<void>` | Load a new source. Emits `loadStart` → `loadProgress` → `loadComplete` (or `loadError`). |
| `on` | `<K extends keyof TableEvents>(event, handler) => () => void` | Subscribe. Returns an unsubscribe function. |
| `off` | `<K extends keyof TableEvents>(event, handler) => void` | Unsubscribe. |
| `openExportDialog` | `() => void` | Open the export dialog. No-op when `exportDialog: false`. |
| `clearSession` | `() => Promise<void>` | Wipe persisted snapshot AND in-memory state. Call `loadData()` after to repopulate. |
| `destroy` | `() => Promise<void>` | Tear down DOM, subscriptions, worker (if owned), session store (if owned). |
| `isDestroyed` | `() => boolean` | Guard against use after `destroy()`. |
| `isPersistenceActive` | `() => boolean` | `false` if persistence disabled OR IndexedDB unavailable (watch for `warning` with code `PERSISTENCE_UNAVAILABLE`). |
| `setColorScheme` | `(scheme: ColorScheme) => void` | Switch light/dark at runtime. |
| `getColorScheme` | `() => ColorScheme` | Currently-applied scheme. |

---

## State signals

Source: `src/core/State.ts`. Access via `table.state.<name>.get()` / `.subscribe(fn)`.

| Signal | Type | Purpose |
|---|---|---|
| `tableName` | `Signal<string \| null>` | DuckDB table / VIEW name. |
| `schema` | `Signal<ColumnSchema[]>` | Column schema. |
| `totalRows` | `Signal<number>` | Row count. |
| `baseTableName` | `Signal<string \| null>` | Original table name (before VIEW). |
| `derivedColumns` | `Signal<DerivedColumnDef[]>` | Derived-column definitions. |
| `filters` | `Signal<Filter[]>` | Active filters. |
| `filteredRows` | `Signal<number>` | Rows matching filters. |
| `filtersByColumn` | `Computed<Map<string, Filter[]>>` | Filters grouped by column name (derived). |
| `sortColumns` | `Signal<SortColumn[]>` | Sort columns in priority order. |
| `visibleColumns` | `Signal<string[]>` | Currently visible column names. |
| `columnOrder` | `Signal<string[]>` | Display order. |
| `columnWidths` | `Signal<Map<string, number>>` | Custom widths (pixels). |
| `pinnedColumns` | `Signal<string[]>` | Left-pinned column names. |
| `hiddenColumnInfo` | `Signal<Map<string, HiddenColumnInfo>>` | Neighbor metadata for hidden columns. |
| `selectedRows` | `Signal<Set<number>>` | Selected row indices. |
| `hoveredRow` | `Signal<number \| null>` | Hovered row index. |
| `hoveredColumn` | `Signal<string \| null>` | Hovered column name. |
| `focusedCell` | `Signal<{ row: number; column: string } \| null>` | Focused cell (keyboard nav). |

---

## Actions methods

Source: `src/core/Actions.ts`. Access via `table.actions`.

### Undo / redo

| Method | Signature | Notes |
|---|---|---|
| `undo` | `() => Promise<boolean>` | Resolves `true` if something was undone. |
| `redo` | `() => Promise<boolean>` | Resolves `true` if something was redone. |
| `beginColumnWidthChange` | `() => void` | Call before a width drag so undo captures pre-drag state. |
| `endColumnWidthChange` | `() => void` | Pair with `beginColumnWidthChange`. |
| `getUndoManager` | `() => UndoManager \| undefined` | Returns the active manager or `undefined` if `undoRedo: false`. |
| `resetToInitial` | `() => Promise<boolean>` | Reset to snapshot captured at load time. |
| `setOnFilterRemove` | `(cb: (column: string) => void) => void` | Called when a filter chip is removed (e.g., to clear viz state). |

### Data loading

| Method | Signature | Notes |
|---|---|---|
| `loadData` | `(source, options?) => Promise<void>` | Same as `table.loadData`. Accepts `sessionStore`/`presetManager` for restoration. |

### Filters

```ts
// Example — add a range filter on "age"
table.actions.addFilter({
  type: 'range',
  column: 'age',
  min: 18,
  max: 65,
  maxInclusive: true,
});

// Example — add a set filter
table.actions.addFilter({ type: 'set', column: 'country', values: ['US', 'CA'] });

// Example — point, null, pattern
table.actions.addFilter({ type: 'point', column: 'sku', value: 'A-42' });
table.actions.addFilter({ type: 'null', column: 'deleted_at' });
table.actions.addFilter({ type: 'pattern', column: 'name', pattern: 'smith', mode: 'contains' });
```

| Method | Signature | Notes |
|---|---|---|
| `addFilter` | `(filter: Filter) => void` | Replaces any existing filter on the same column + type. |
| `removeFilter` | `(column: string, type?: FilterType) => void` | Removes all filters for the column; pass `type` to scope. |
| `clearFilters` | `() => void` | Remove every filter. |
| `loadFilterPreset` | `(filters: Filter[], sortColumns?: SortColumn[]) => void` | Atomic replace of filters (and optionally sort). |

### Raw SQL filters

| Method | Signature | Notes |
|---|---|---|
| `addRawSQLFilter` | `(sql: string, label?: string) => string` | Returns the new filter `id`. |
| `updateRawSQLFilter` | `(id: string, sql: string, label?: string) => void` | |
| `removeRawSQLFilter` | `(id: string) => void` | |
| `getRawSQLFilters` | `() => RawSQLFilter[]` | |
| `validateSQLFilter` | `(sql: string, signal?: AbortSignal) => Promise<{ valid: boolean; matchCount?: number; error?: string }>` | Validates a WHERE-clause fragment without applying it. |
| `getFiltersSQL` | `() => string` | Current WHERE clause from all active filters. |

### Sorting

| Method | Signature | Notes |
|---|---|---|
| `setSort` | `(columns: SortColumn[]) => void` | Replace the entire sort. |
| `toggleSort` | `(column: string) => void` | Cycle none → asc → desc → none for that column (replaces other sorts). |
| `addToSort` | `(column: string) => void` | Multi-sort: add or toggle direction. |
| `clearSort` | `() => void` | |

### Column visibility

| Method | Signature | Notes |
|---|---|---|
| `hideColumn` | `(column: string) => void` | Records neighbors for intelligent restore. |
| `showColumn` | `(column: string) => void` | Re-inserts next to original neighbor if possible. |
| `showAllColumns` | `() => void` | |

### Column order / pin / width

| Method | Signature | Notes |
|---|---|---|
| `setColumnOrder` | `(columns: string[]) => void` | |
| `toggleColumnPin` | `(column: string) => void` | Moves to / from the pinned group. |
| `setColumnWidth` | `(column: string, width: number) => void` | |
| `resetColumnWidth` | `(column: string) => void` | |

### Derived columns

| Method | Signature | Notes |
|---|---|---|
| `addDerivedColumn` | `(def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>` | Expression or vector. |
| `updateDerivedColumn` | `(oldName: string, def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>` | |
| `removeDerivedColumn` | `(name: string) => Promise<void>` | |
| `validateExpression` | `(expression: string) => Promise<{ valid: boolean; type?: DataType; originalType?: string; error?: string }>` | Validate without committing. |
| `getCompletionContext` | `() => CompletionContext` | For autocompletion in custom editors. |

### Selection

| Method | Signature | Notes |
|---|---|---|
| `selectRow` | `(index: number, mode?: 'replace' \| 'toggle' \| 'range') => void` | Default mode: `'replace'`. |
| `clearSelection` | `() => void` | |
| `selectAll` | `() => void` | |

### UI state

| Method | Signature | Notes |
|---|---|---|
| `setHoveredRow` | `(index: number \| null) => void` | |
| `setHoveredColumn` | `(column: string \| null) => void` | |
| `setFocusedCell` | `(cell: { row: number; column: string } \| null) => void` | |
| `clearFocusedCell` | `() => void` | |

---

## Event catalog

Source: `src/core/TableEvents.ts`. Subscribe via `table.on(name, handler)`.

| Event | Payload | When it fires |
|---|---|---|
| `ready` | `{ bridgeReady: true }` | After `initialize()` completes; late subscribers receive it in a microtask. |
| `loadStart` | `{ source: string }` | Load begins. |
| `loadProgress` | `ProgressInfo` | Per-chunk progress (`download` / `decode` / `register` / `ingest` / `finalize`). |
| `loadComplete` | `{ tableName, rowCount, schema }` | Data loaded and schema known. |
| `loadError` | `{ error: Error }` | Load failed. |
| `error` | `{ error: DataTableError; source: TableErrorSource }` | Any recoverable typed error. `source` discriminates the subsystem. |
| `warning` | `{ code: string; message: string; details?: Record<string, unknown> }` | Non-fatal degradation (e.g., `STYLESHEET_MISSING`, `PERSISTENCE_UNAVAILABLE`). |
| `filterChange` | `{ filters, filteredRowCount, totalRowCount }` | Any filter-list change. |
| `sortChange` | `{ sortColumns }` | Sort changed. |
| `selectionChange` | `{ selectedRows: Set<number> }` | Row selection changed. |
| `columnChange` | `{ visibleColumns, pinnedColumns, columnOrder }` | Visibility, order, pin, or width change. |
| `derivedChange` | `{ derivedColumns }` | Derived-column list added / updated / removed. |
| `undoChange` | `{ canUndo, canRedo }` | Undo-stack state changed. |
| `destroy` | `Record<string, never>` | Library teardown, before signals are disposed. |

---

## Error catalog

Every error is a subclass of `DataTableError` with `error.code: string` and optional `error.details`. Subscribe via:

```ts
table.on('error', ({ error, source }) => {
  if (error.code === 'PARSE_FAILED') showToast('Could not read that file.');
  else reportToSentry(error);
});
```

| Code | Class | Source | Trigger |
|---|---|---|---|
| `OPTIONS_INVALID` | `ConfigurationError` | `src/DataTable.ts`, `src/filters/FilterPresets.ts` | Invalid option passed to `createDataTable()` or `FilterPresetManager`. |
| `WORKER_UNSUPPORTED` | `WorkerInitError` | `src/DataTable.ts` | `strictBrowserCheck: true` and at least one required API is missing. `details.missing: string[]`. |
| `WORKER_CRASHED` | `WorkerInitError` | `src/data/WorkerBridge.ts` | Worker error or failed init. |
| `WORKER_INIT_TIMEOUT` | `WorkerInitError` | `src/data/WorkerBridge.ts` | Worker init did not complete within `initTimeoutMs` (default 30s). |
| `WORKER_TERMINATED` | `WorkerTerminatedError` | `src/data/WorkerBridge.ts` | Worker terminated mid-flight. |
| `BRIDGE_NOT_READY` | `ConfigurationError` | `src/core/Actions.ts`, `src/worker/duckdb.ts`, `src/data/WorkerBridge.ts` | Bridge used before init (`await createDataTable()` not yet resolved). |
| `QUERY_RUNTIME` | `QueryError` | various viz + query sites | DuckDB returned an error at query time. |
| `QUERY_ABORTED` | `QueryError` | `src/data/WorkerBridge.ts` | Query aborted via `AbortSignal` or bridge teardown. |
| `SQL_SYNTAX` | `SQLValidationError` | `src/core/Actions.ts` | Raw-SQL filter / derived-column expression failed WHERE-clause validation. |
| `LOAD_PARSE_FAILED` | `LoadError` | `src/worker/loaders/common.ts` | CSV/JSON/Parquet parse failed during timestamp/date/time coercion. |
| `LOAD_INVALID_TIMEZONE` | `LoadError` | `src/worker/loaders/{csv,json,parquet}.ts` | Invalid timezone in load options. |
| `LOAD_INVALID_OPTIONS` | `LoadError` | `src/worker/loaders/{csv,json}.ts` | Incompatible load-option combination. |
| `LOAD_FORMAT_UNSUPPORTED` | `LoadError` | `src/worker/worker.ts` | Unknown/unsupported file format. |
| `FETCH_FAILED` | `LoadError` | `src/data/DataLoader.ts` | URL fetch failed. |
| `PARSE_FAILED` | `LoadError` | `src/DataTable.ts` | Generic parse fallback. |
| `EXPRESSION_INVALID` | `DerivedColumnError` | `src/derived/DerivedColumnManager.ts` | Derived-column expression rejected by DuckDB. |
| `CIRCULAR_DEPENDENCY` | `DerivedColumnError` | `src/derived/DerivedColumnManager.ts` | Derived column references itself (directly or transitively). |
| `NOT_FOUND` | `DerivedColumnError` | `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts` | Derived column missing on update/remove. |
| `DUPLICATE_NAME` | `DerivedColumnError` | `src/core/Actions.ts` | A column with that name already exists. |
| `VECTOR_LENGTH_MISMATCH` | `DerivedColumnError` | `src/core/Actions.ts` | Vector length doesn't match row count. |
| `NO_TABLE_LOADED` | `ExportError` | `src/export/{CSV,JSON,Parquet,Clipboard}Export.ts` | Export called before data loaded. |
| `CANVAS_UNAVAILABLE` | `ExportError` | `src/visualizations/BaseVisualization.ts` | Canvas rendering unavailable (headless browsers). |
| `CLIPBOARD_UNAVAILABLE` | `ExportError` | `src/export/Clipboard.ts` | Clipboard API blocked (non-secure context, permissions). |
| `SAVE_FAILED` | `PersistenceError` | `src/persistence/AutoSave.ts` | IndexedDB write failed (quota, aborted transaction). |
| `PERSISTENCE_UNAVAILABLE` | warning event | `src/DataTable.ts` | IndexedDB unavailable (private browsing). Surfaced via `warning` event, not `error`. |
| `STYLESHEET_MISSING` | warning event | `src/DataTable.ts` | `@jeyabbalas/data-table/styles` was not imported. Surfaced via `warning` event. |
| `DESTROYED` | `DestroyedError` | `src/DataTable.ts` | Public method called after `destroy()`. |
| `INVARIANT` | `ConfigurationError` | `src/statistics/ColumnStatsTypes.ts`, `src/core/Signal.ts`, `src/worker/worker.ts` | Internal invariant violation (should not happen — file a bug). |

---

## Filter types

Source: `src/filters/FilterTypes.ts`. Every filter shares `type: string` and `column: string`.

### `RangeFilter`

```ts
interface RangeFilter {
  type: 'range';
  column: string;
  min: number | string | Date;
  max: number | string | Date;
  /** When true, upper bound uses <= instead of <. Used for the last histogram bin. */
  maxInclusive?: boolean;
  /** When true, lower bound uses > instead of >=. Strict greater-than filters. */
  minExclusive?: boolean;
  /** Value type hint for SQL generation. When 'interval', values are prefixed with INTERVAL keyword. */
  valueType?: 'interval';
}

table.actions.addFilter({
  type: 'range', column: 'age', min: 18, max: 65, maxInclusive: true,
});
```

### `PointFilter`

```ts
interface PointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | Date | null;
}

table.actions.addFilter({ type: 'point', column: 'sku', value: 'A-42' });
```

### `SetFilter`

```ts
interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included — generates `col IN (...) OR col IS NULL`. */
  includeNull?: boolean;
}

table.actions.addFilter({ type: 'set', column: 'country', values: ['US', 'CA'] });
```

### `NotSetFilter`

```ts
interface NotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included — generates `col NOT IN (...) OR col IS NULL`. */
  includeNull?: boolean;
}

table.actions.addFilter({ type: 'not-set', column: 'status', values: ['archived'] });
```

### `NullFilter`

```ts
interface NullFilter {
  type: 'null' | 'not-null';
  column: string;
}

table.actions.addFilter({ type: 'null', column: 'deleted_at' });
```

### `PatternFilter`

```ts
interface PatternFilter {
  type: 'pattern';
  column: string;
  pattern: string;
  mode: 'contains' | 'starts' | 'ends' | 'regex';
}

table.actions.addFilter({ type: 'pattern', column: 'name', pattern: 'smith', mode: 'contains' });
```

### `RawSQLFilter`

```ts
interface RawSQLFilter {
  type: 'raw-sql';
  column: string;   // synthetic key: '__raw_sql_<id>__'
  sql: string;      // WHERE clause fragment (no WHERE keyword)
  label?: string;   // human-readable label for the filter chip
  id: string;       // unique identifier (crypto.randomUUID())
}

// Preferred: use the action, which mints the id for you.
const id = table.actions.addRawSQLFilter(`price > 100 AND category IN ('A', 'B')`, 'Premium A/B');
```

Raw SQL filters bypass validation for their content; treat them as trusted input.

---

## Derived columns

Source: `src/derived/types.ts`.

### Expression-based

```ts
interface ExpressionColumnDef {
  kind: 'expression';
  name: string;
  expression: string; // DuckDB SQL expression evaluated per row
}

await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'age_group',
  expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
});
```

### Vector-based

```ts
type VectorDataType =
  | 'integer' | 'float' | 'decimal' | 'string' | 'boolean'
  | 'uuid' | 'date' | 'timestamp' | 'time' | 'interval';

interface VectorColumnDef {
  kind: 'vector';
  name: string;
  vectorType: VectorDataType;
  values: number[] | string[] | boolean[];
}

await table.actions.addDerivedColumn({
  kind: 'vector',
  name: 'score',
  vectorType: 'float',
  values: precomputedScores,   // length must equal table row count
});
```

Vector columns materialize a helper table in DuckDB; the main table becomes a VIEW so existing queries transparently see the new column.

---

## Serialization helpers

| Symbol | Signature | Purpose |
|---|---|---|
| `serializeFilter(filter)` | `(Filter) => SerializedFilter` | Replaces `Date` with `{ __date__: ISO string }` so the filter is JSON-safe. |
| `deserializeFilter(serialized)` | `(SerializedFilter) => Filter \| null` | Returns `null` for unknown types (e.g., after a schema version bump). |

### `SessionStore`

Source: `src/persistence/SessionStore.ts`.

| Method | Signature | Notes |
|---|---|---|
| `open` | `() => Promise<boolean>` | Returns `false` if IndexedDB is unavailable. |
| `save` | `(snapshot: SessionSnapshot) => Promise<void>` | |
| `saveSync` | `(snapshot: SessionSnapshot) => void` | For page lifecycle handlers (`pagehide`). |
| `load` | `(tableName: string) => Promise<SessionSnapshot \| null>` | |
| `delete` | `(tableName: string) => Promise<void>` | |
| `list` | `() => Promise<string[]>` | All stored table names. |
| `close` | `() => void` | Close the DB connection and reset state. |

---

## Browser support probe

```ts
import { checkBrowserSupport } from '@jeyabbalas/data-table';

const { supported, missing } = checkBrowserSupport();
if (!supported) {
  showMessage(`Your browser is missing: ${missing.join(', ')}`);
}
```

Source: `src/core/checkBrowserSupport.ts`. Probes are synchronous and safe in any runtime (returns `supported: false` in Node rather than throwing).

| Probe | Needed for |
|---|---|
| `Worker` | DuckDB runs in a dedicated worker. |
| `WebAssembly` | DuckDB is Wasm-compiled. |
| `IndexedDB` | Session persistence. |
| `ResizeObserver` | Column resize + visualization responsive layout. |
| `BigInt` | DuckDB integer columns cross worker boundary as BigInt. |
| `structuredClone` | Worker bridge snapshots result sets. |

---

## i18n (`Strings`)

Source: `src/core/Strings.ts`. Override any subset via `messages: DeepPartial<Strings>`.

Top-level groups: `common`, `filters`, `presets`, `export`, `derived`, `a11y`, `statistics`, `errors`.

```ts
import { createDataTable } from '@jeyabbalas/data-table';

await createDataTable({
  container,
  source,
  messages: {
    common: { close: 'Fermer', apply: 'Appliquer' },
    filters: { panelTitle: 'Filtres', applyButton: 'Appliquer le filtre' },
    export:  { title: 'Exporter', downloadButton: 'Télécharger' },
  },
});
```

Messages are resolved once at `createDataTable()` time and threaded to every component. Recreate the table to switch languages at runtime.
