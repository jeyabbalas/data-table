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
- [`table.annotations` namespace](#tableannotations-namespace)
- [Event catalog](#event-catalog)
- [Error catalog](#error-catalog)
- [Filter types](#filter-types)
- [Derived columns](#derived-columns)
- [Column-header tooltip content](#column-header-tooltip-content)
- [Annotation JSON format](#annotation-json-format)
- [Stats panels](#stats-panels)
- [SQL editor primitives](#sql-editor-primitives)
- [Serialization helpers](#serialization-helpers)
- [Browser support probe](#browser-support-probe)
- [i18n (`Strings`)](#i18n-strings)

---

## Package entry points

| Import path                                        | Purpose                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@jeyabbalas/data-table`                           | Facade: `createDataTable`, types, errors, filter helpers, i18n helpers. 95% of consumers only need this.                        |
| `@jeyabbalas/data-table/advanced`                  | Low-level building blocks: `StateActions`, `UndoManager`, table/filter/derived components, export helpers, `BaseVisualization`. |
| `@jeyabbalas/data-table/styles` (or `/styles.css`) | Side-effect CSS bundle. Import once before `createDataTable()`.                                                                 |

Source: `package.json` `exports` field.

---

## Tier-1 exports

Exported from `@jeyabbalas/data-table`. Source: `src/index.ts`.

### Version & facade

| Symbol                     | Kind         | Purpose                                                       |
| -------------------------- | ------------ | ------------------------------------------------------------- |
| `VERSION`                  | const string | Library version (`'0.1.0'`).                                  |
| `createDataTable(options)` | function     | Mount a fully-wired table. Returns `Promise<DataTable>`.      |
| `DataTable`                | interface    | Returned object (state, actions, bridge, container, methods). |
| `CreateDataTableOptions`   | interface    | Options accepted by `createDataTable()`.                      |
| `ColorScheme`              | type         | `'light' \| 'dark' \| 'auto'`.                                |

### Events

| Symbol             | Kind | Purpose                                                                                                                                                                                        |
| ------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TableEvents`      | type | Event-name → payload map.                                                                                                                                                                      |
| `TableEventName`   | type | `keyof TableEvents`.                                                                                                                                                                           |
| `TableErrorSource` | type | Discriminator for the `error` event (`'load' \| 'query' \| 'export' \| 'persistence' \| 'visualization' \| 'stats-panel' \| 'sql-validation' \| 'derived-column' \| 'listener' \| 'unknown'`). |

### Error classes

All extend `Error` and carry a `code: string` and optional `details: Record<string, unknown>`. See [Error catalog](#error-catalog) for code meanings.

| Class                   | When thrown                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTableError`        | Base class (alias for any of the below).                                                                                                                          |
| `DataTableErrorOptions` | Constructor options shape.                                                                                                                                        |
| `WorkerInitError`       | Worker bootstrap / browser-support probe failures.                                                                                                                |
| `WorkerTerminatedError` | Worker was terminated (intentionally or unexpectedly).                                                                                                            |
| `QueryError`            | DuckDB query failed at runtime or was aborted.                                                                                                                    |
| `LoadError`             | CSV/JSON/Parquet parse or fetch failure.                                                                                                                          |
| `SQLValidationError`    | Raw-SQL filter or derived-column expression had a syntax/validation error.                                                                                        |
| `DerivedColumnError`    | Derived-column lifecycle error (`EXPRESSION_INVALID`, `CIRCULAR_DEPENDENCY`, `DEPENDENTS_INCOMPATIBLE`, `NOT_FOUND`, `DUPLICATE_NAME`, `VECTOR_LENGTH_MISMATCH`). |
| `AnnotationError`       | Annotation lifecycle / JSON load error (`DUPLICATE_ID`, `NOT_FOUND`, `INVALID_SHAPE`, `VERSION_UNSUPPORTED`).                                                     |
| `PersistenceError`      | IndexedDB write failure.                                                                                                                                          |
| `ExportError`           | Export pipeline failure (missing table, canvas unavailable, clipboard blocked).                                                                                   |
| `ConfigurationError`    | Invalid option, bad preset, internal invariant.                                                                                                                   |
| `DestroyedError`        | Public method called after `destroy()`.                                                                                                                           |

### Core types

| Symbol                       | Kind         | Purpose                                                                                                                                         |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataType`                   | type         | `'integer' \| 'float' \| 'decimal' \| 'string' \| 'boolean' \| 'uuid' \| 'date' \| 'timestamp' \| 'time' \| 'interval'`.                        |
| `ColumnSchema`               | interface    | `{ name, type, nullable, originalType, system?: boolean }`. `system: true` marks library-injected columns (notably `__rowid__`).                |
| `Filter`                     | type         | Discriminated union of 7 filter shapes.                                                                                                         |
| `FilterType`                 | type         | `Filter['type']`.                                                                                                                               |
| `SortColumn`                 | interface    | `{ column: string; direction: SortDirection }`.                                                                                                 |
| `SortDirection`              | type         | `'asc' \| 'desc'`.                                                                                                                              |
| `RowId`                      | type         | Alias for `number`. The annotation API and `getColumnValues` consume / return this.                                                             |
| `ROWID_COLUMN`               | const string | The literal `'__rowid__'`. The reserved system-column name; sources containing it reject with `LoadError('RESERVED_COLUMN_NAME')`.              |
| `GetColumnValuesOptions`     | type         | Options for `actions.getColumnValues` — `{ scope?: 'all' \| 'filtered' \| 'selected'; limit?: number; offset?: number; signal?: AbortSignal }`. |
| `ColumnHeaderTooltipContent` | interface    | Structured popover content — `{ title?, description?, items? }`. See [Column-header tooltip content](#column-header-tooltip-content).           |
| `ColumnHeaderTooltipItem`    | interface    | `{ label: string; value: string \| string[] }`. `string[]` renders as wrapping enum chips.                                                      |

### Filter shapes

See [Filter types](#filter-types) for full fields. Union members: `RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`, `RawSQLFilter`.

### SQL authoring helpers

| Symbol            | Signature                                     | Purpose                                     |
| ----------------- | --------------------------------------------- | ------------------------------------------- |
| `quoteIdentifier` | `(name: string) => string`                    | Quote a column/table identifier for DuckDB. |
| `formatSQLValue`  | `(value: unknown, type?: DataType) => string` | Format a JS value as a DuckDB literal.      |

### Filter presets

| Symbol                   | Kind  | Purpose                                              |
| ------------------------ | ----- | ---------------------------------------------------- |
| `FilterPresetManager`    | class | Save/load/export/import named filter sets.           |
| `FilterPreset`           | type  | `{ id, name, description?, filters, sortColumns? }`. |
| `FilterPresetCollection` | type  | Exportable array of presets with version metadata.   |

### Annotations

Types for the [`table.annotations`](#tableannotations-namespace) namespace and the JSON I/O round-trip. Source: `src/annotations/types.ts`.

| Symbol                    | Kind         | Purpose                                                                                                                                                  |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Annotation`              | type         | Discriminated union: `RowAnnotation \| ColumnAnnotation \| CellAnnotation`.                                                                              |
| `AnnotationScope`         | type         | `'row' \| 'column' \| 'cell'`.                                                                                                                           |
| `AnnotationSeverity`      | type         | `'error' \| 'warning' \| 'info'`.                                                                                                                        |
| `RowAnnotation`           | interface    | `AnnotationBase & { scope: 'row'; rowId: number }`.                                                                                                      |
| `ColumnAnnotation`        | interface    | `AnnotationBase & { scope: 'column'; column: string }`.                                                                                                  |
| `CellAnnotation`          | interface    | `AnnotationBase & { scope: 'cell'; rowId: number; column: string }`.                                                                                     |
| `NewAnnotation`           | type         | Input for `add` / `addMany` — `Annotation` with optional `id` (the library generates one if missing).                                                    |
| `AnnotationFile`          | interface    | JSON payload — `{ version, tableName?, createdAt?, updatedAt?, annotations[], …unknownFields }`. See [Annotation JSON format](#annotation-json-format).  |
| `AnnotationChangePayload` | type         | `{ kind: 'added' \| 'updated' \| 'removed' \| 'cleared' \| 'filterChanged'; ids: string[] }`.                                                            |
| `AnnotationChangeHandler` | type         | `(p: AnnotationChangePayload) => void`.                                                                                                                  |
| `SeverityFilter`          | interface    | `{ error: boolean; warning: boolean; info: boolean }` — view-layer flags read by the rendering layer; flipping them does not modify the underlying data. |
| `ANNOTATION_FILE_VERSION` | const number | Currently `1`. Files with `version > ANNOTATION_FILE_VERSION` reject on load.                                                                            |
| `AnnotationError`         | class        | `DataTableError` subclass — codes `DUPLICATE_ID` / `NOT_FOUND` / `INVALID_SHAPE` / `VERSION_UNSUPPORTED`.                                                |

### Data layer

| Symbol                | Kind      | Purpose                                                                                                |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `WorkerBridge`        | class     | DuckDB worker bridge; owns the worker and query cache; exposes `dropTable()` for ad-hoc table cleanup. |
| `LoadOptions`         | interface | CSV/JSON/Parquet per-format options.                                                                   |
| `WorkerBridgeOptions` | interface | `workerFactory`, `workerUrl`, `duckdbBundles`, `initTimeoutMs`.                                        |
| `DataFormat`          | type      | `'csv' \| 'json' \| 'parquet'`.                                                                        |
| `LoadResult`          | interface | `{ tableName, rowCount, schema }` returned by the bridge.                                              |

### Persistence

| Symbol                          | Kind     | Purpose                                                       |
| ------------------------------- | -------- | ------------------------------------------------------------- |
| `SessionStore`                  | class    | IndexedDB-backed snapshot store.                              |
| `serializeFilter(filter)`       | function | `Filter` → JSON-safe `SerializedFilter`.                      |
| `deserializeFilter(serialized)` | function | `SerializedFilter` → `Filter \| null` (null if unknown type). |
| `SerializedFilter`              | type     | JSON-safe filter representation.                              |

### Visualizations

| Symbol                         | Kind           | Purpose                                                           |
| ------------------------------ | -------------- | ----------------------------------------------------------------- |
| `VisualizationRegistry`        | class          | Per-instance registry of visualization classes.                   |
| `defaultVisualizationRegistry` | const instance | Fallback registry when `visualizationRegistry` option is omitted. |
| `VisualizationRegistration`    | interface      | `{ name, isApplicable, constructor, priority }`.                  |
| `VisualizationConstructor`     | type           | `new (container, column, options) => BaseVisualization`.          |

### Stats panel registry

Types for the [Stats panels](#stats-panels) extension point. Source: `src/visualizations/StatsPanelRegistry.ts`.

| Symbol                      | Kind           | Purpose                                                                                                                                                                             |
| --------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatsPanelRegistry`        | class          | Per-instance registry of `BaseStatsPanel` subclasses keyed by `DataType`. Empty by default; mirror of `VisualizationRegistry` for the column-stats slot.                            |
| `defaultStatsPanelRegistry` | const instance | Module-scoped fallback used when `createDataTable` is called without a `statsPanelRegistry` option. Also empty by default.                                                          |
| `StatsPanelRegistration`    | interface      | `{ name, isApplicable: (type: DataType) => boolean, constructor: StatsPanelConstructor, priority: number }`. Same-name re-register replaces; higher `priority` wins on multi-match. |
| `StatsPanelConstructor`     | type           | `new (container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) => BaseStatsPanel`.                                                                                 |

### Derived columns

| Symbol                    | Kind      | Purpose                                                           |
| ------------------------- | --------- | ----------------------------------------------------------------- |
| `DerivedColumnKind`       | type      | `'expression' \| 'vector'`.                                       |
| `VectorDataType`          | type      | Supported vector types (see [Derived columns](#derived-columns)). |
| `ExpressionColumnDef`     | interface | `{ kind: 'expression', name, expression }`.                       |
| `VectorColumnDef`         | interface | `{ kind: 'vector', name, vectorType, values }`.                   |
| `DerivedColumnDef`        | type      | Union of the two.                                                 |
| `CompletionContext`       | interface | Schema + function list passed to expression editors.              |
| `ExpressionEditor`        | type      | Editor contract (`getValue`, `setValue`, `focus`, `destroy`, …).  |
| `ExpressionEditorFactory` | type      | `(container, context, classPrefix, config?) => ExpressionEditor`. |

### Progress

| Symbol             | Kind | Purpose                                                           |
| ------------------ | ---- | ----------------------------------------------------------------- |
| `ProgressInfo`     | type | `{ stage, bytesLoaded?, totalBytes?, percent? }`.                 |
| `ProgressCallback` | type | `(info: ProgressInfo) => void`.                                   |
| `ProgressStage`    | type | `'download' \| 'decode' \| 'register' \| 'ingest' \| 'finalize'`. |

### i18n

| Symbol                    | Kind      | Purpose                                             |
| ------------------------- | --------- | --------------------------------------------------- |
| `defaultStrings`          | const     | English strings catalog.                            |
| `mergeStrings(overrides)` | function  | Deep-merge partial overrides into `defaultStrings`. |
| `Strings`                 | interface | Full i18n shape.                                    |
| `DeepPartial<T>`          | type      | Helper used for partial overrides.                  |

### Utilities

| Symbol                | Signature                         | Purpose                                                                                         |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `isStylesheetLoaded`  | `(root?: HTMLElement) => boolean` | Detects whether `@jeyabbalas/data-table/styles` was imported (checks `--dt-stylesheet-loaded`). |
| `checkBrowserSupport` | `() => BrowserSupport`            | Sync probe for required browser APIs.                                                           |
| `BrowserSupport`      | interface                         | `{ supported: boolean; missing: string[] }`.                                                    |

---

## Tier-2 exports

Exported from `@jeyabbalas/data-table/advanced`. Source: `src/advanced.ts`. Reach into these only when the facade doesn't expose what you need — see [When to use `/advanced`](../AGENTS.md#when-to-use-advanced).

### Low-level state & reactive primitives

| Symbol                                       | Kind      | Purpose                                                                     |
| -------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| `EventEmitter`                               | class     | Type-safe pub/sub; drives `table.on/off`.                                   |
| `StateActions`                               | class     | Command/mutation layer (see [actions methods](#actions-methods)).           |
| `LoadDataOptions`                            | interface | Options passed to `actions.loadData` / `table.loadData`.                    |
| `createTableState()`                         | function  | Build a fresh `TableState` (all signals initialized).                       |
| `resetTableState(state)`                     | function  | Reset every signal to its empty default.                                    |
| `initializeColumnsFromSchema(state, schema)` | function  | Populate `schema`, `visibleColumns`, `columnOrder` from a `ColumnSchema[]`. |
| `TableState`                                 | interface | Reactive state shape (see [state signals](#state-signals)).                 |
| `HiddenColumnInfo`                           | interface | Neighbor metadata recorded when a column is hidden.                         |
| `UndoManager`                                | class     | Two-stack undo/redo manager.                                                |
| `captureSnapshot(state)`                     | function  | Read signals into a `StateSnapshot`.                                        |
| `applySnapshot(state, snapshot)`             | function  | Write a `StateSnapshot` back into signals.                                  |
| `derivedColumnsEqual(a, b)`                  | function  | Shallow structural equality for derived-column lists.                       |
| `StateSnapshot`                              | type      | Lightweight view-state snapshot (filters, sort, columns, derived).          |

### Table UI components

| Symbol                              | Kind           | Purpose                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TableContainer`                    | class          | Main DOM container that composes every UI piece. `announce(message)` speaks a transient message through its second polite live region.                                                                                                                                                                                           |
| `TableContainerOptions`             | interface      | Ctor options (rowHeight, headerHeight, classPrefix, instanceId, colorScheme, messages, …).                                                                                                                                                                                                                                       |
| `ResizeCallback`                    | type           | `(rect: DOMRect) => void` for resize observers.                                                                                                                                                                                                                                                                                  |
| `ColumnHeader`                      | class          | Renders a single column header cell (label, stats, viz canvas). See [Column layout mode](#column-layout-mode-shiftf2) for its keyboard width API.                                                                                                                                                                                |
| `ColumnHeaderOptions`               | interface      | Header ctor options. `announce?: (message: string) => void` writes to the transient live region (used to announce the width at the end of a resize drag).                                                                                                                                                                        |
| `VirtualScroller`                   | class          | Virtual row windowing for large datasets.                                                                                                                                                                                                                                                                                        |
| `VirtualScrollerOptions`            | interface      | Scroller ctor options.                                                                                                                                                                                                                                                                                                           |
| `VisibleRange`                      | type           | `{ startIndex, endIndex }`.                                                                                                                                                                                                                                                                                                      |
| `ScrollCallback`                    | type           | `(info) => void`.                                                                                                                                                                                                                                                                                                                |
| `ScrollAlign`                       | type           | `'start' \| 'center' \| 'end' \| 'auto'`.                                                                                                                                                                                                                                                                                        |
| `TableBody`                         | class          | Row rendering inside the scroller.                                                                                                                                                                                                                                                                                               |
| `TableBodyOptions`                  | interface      | Body ctor options.                                                                                                                                                                                                                                                                                                               |
| `RowData`                           | interface      | Row-level data passed to `CellRenderer`.                                                                                                                                                                                                                                                                                         |
| `CellRenderer`                      | class          | Renders a single cell (type-aware formatting).                                                                                                                                                                                                                                                                                   |
| `CellOptions`                       | interface      | Cell ctor options.                                                                                                                                                                                                                                                                                                               |
| `ColumnReorder`                     | class          | Drag-to-reorder controller for column headers.                                                                                                                                                                                                                                                                                   |
| `ColumnReorderOptions`              | interface      | Reorder ctor options.                                                                                                                                                                                                                                                                                                            |
| `ReorderCallback`                   | type           | `(newOrder: string[], movedColumn: string) => void`.                                                                                                                                                                                                                                                                             |
| `HiddenColumnsGutter`               | class          | Renders the gutter that surfaces hidden columns.                                                                                                                                                                                                                                                                                 |
| `HiddenColumnsGutterOptions`        | interface      | Gutter ctor options.                                                                                                                                                                                                                                                                                                             |
| `KeyboardNavigator`                 | class          | Arrow-key / `aria-activedescendant` navigation for the grid, plus `F2` controls mode and `Shift+F2` column layout mode.                                                                                                                                                                                                          |
| `KeyboardNavigatorOptions`          | interface      | Navigator ctor options. `announce?: (message: string) => void` and `messages?: Strings` drive the layout-mode live-region text; omit `announce` and the gesture still works, silently.                                                                                                                                           |
| `AnnotationStore`                   | class          | Programmatic annotation CRUD store. Exposed at Tier-1 via `table.annotations`; the class itself lives on `/advanced` for consumers that want to construct one independently.                                                                                                                                                     |
| `AnnotationStoreOptions`            | interface      | Ctor options (`tableName`, `idGenerator`, `now`).                                                                                                                                                                                                                                                                                |
| `AnnotationPopover`                 | class          | Single shared popover instance reused across hover / focus targets. Constructed by `createDataTable`; see [`docs/guides/annotations.md`](./guides/annotations.md).                                                                                                                                                               |
| `AnnotationPopoverOptions`          | interface      | Popover ctor options.                                                                                                                                                                                                                                                                                                            |
| `ColumnHeaderTooltipPopover`        | class          | Single shared popover for `actions.setColumnHeaderTooltip`. Anchored on the column-name span (distinct DOM node from `AnnotationPopover`).                                                                                                                                                                                       |
| `ColumnHeaderTooltipPopoverOptions` | interface      | Popover ctor options.                                                                                                                                                                                                                                                                                                            |
| `BaseStatsPanel`                    | abstract class | Subclass to render a custom stats panel into the `.dt-col-stats` slot. Lifecycle: `update(stats)` → `updateFilters(filters)` → `setHoverStats(html)` → `destroy()`. See [Stats panels](#stats-panels).                                                                                                                           |
| `StatsPanelOptions`                 | interface      | `{ tableName, bridge, filters, messages, onError? }` passed to the panel constructor and refreshed on every filter change. Mirrors `VisualizationOptions`.                                                                                                                                                                       |
| `StatsPanelErrorContext`            | interface      | Context object passed to `options.onError` — `{ source: 'stats-panel', column: string, phase: StatsPanelErrorPhase }`.                                                                                                                                                                                                           |
| `StatsPanelErrorPhase`              | type           | `'construct' \| 'update' \| 'hover' \| 'fetch' \| 'destroy'` — discriminator for where in the panel lifecycle the error originated.                                                                                                                                                                                              |
| `StatsPanelCoordinator`             | class          | Composed by `createDataTable`; subscribes to `state.filters` and broadcasts `panel.updateFilters(filters)` to every registered panel. Stamps a monotonic `filterSequence` per broadcast to drop stale in-flight calls; bounded fan-out (`DEFAULT_PANEL_CONCURRENCY = 4`). Exposed for power users orchestrating panels manually. |

### Filter UI components

| Symbol                     | Kind      | Purpose                                                                               |
| -------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `FilterChip`               | class     | Single filter chip with removal control.                                              |
| `FilterChipOptions`        | interface | Chip ctor options.                                                                    |
| `FilterBar`                | class     | Horizontal bar of active filter chips.                                                |
| `FilterBarOptions`         | interface | Bar ctor options.                                                                     |
| `FilterPanel`              | class     | Per-column popover holding one or more `FilterPanelField`s.                           |
| `FilterPanelOptions`       | interface | Panel ctor options.                                                                   |
| `FilterPanelField`         | class     | Single type-specific input (numeric range, categorical picker, pattern, null toggle). |
| `FilterPanelFieldOptions`  | interface | Field ctor options.                                                                   |
| `SQLFilterModal`           | class     | Modal editor for raw-SQL (`RawSQLFilter`) filters.                                    |
| `SQLFilterModalOptions`    | interface | Modal ctor options.                                                                   |
| `FilterPresetPanel`        | class     | Save/load/export preset panel.                                                        |
| `FilterPresetPanelOptions` | interface | Panel ctor options.                                                                   |

### Column layout mode (`Shift+F2`)

Column resize and column reorder are keyboard-operable from the header cursor
through one modal gesture. It adds no tab stop and makes no element focusable
— real DOM focus stays on `.dt-grid` throughout. The key map, the live-region
strings and the pinned-column rules are in the
[accessibility guide](./guides/accessibility.md#column-layout-mode-shiftf2).

These are the public surfaces it is built on; reach for them directly only
when assembling a custom container shell.

| Symbol                                       | Kind     | Purpose                                                                                                                            |
| -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ColumnHeader.getWidth()`                    | method   | Current width in pixels, read from `columnWidths` (150 when unset) rather than from layout.                                        |
| `ColumnHeader.getWidthBounds()`              | method   | `{ min, max }` — the resizer's clamp, 50 / 500 by default.                                                                         |
| `ColumnHeader.setWidth(px)`                  | method   | Apply a width, clamped to the bounds. Returns the width actually applied.                                                          |
| `ColumnHeader.resizeBy(deltaPx)`             | method   | Grow or shrink by a signed delta, clamped. Returns the width actually applied.                                                     |
| `ColumnHeader.setLayoutMode(active)`         | method   | Toggle the dashed outline and the lit resize handle that mark the column the arrow keys are about to act on.                       |
| `TableContainer.announce(message)`           | method   | Write a transient message to the second polite live region. Repeating the same text re-announces it.                               |
| `clampUnpinnedIndex(index, columns, pinned)` | function | Clamp an insertion index out of the pinned block. Exported from `ColumnReorder`; used by both the drag path and the keyboard move. |
| `actions.beginColumnLayoutChange()`          | method   | Open the undo bracket — see [Undo / redo](#undo--redo).                                                                            |
| `actions.endColumnLayoutChange()`            | method   | Commit it, pushing at most one entry.                                                                                              |
| `actions.cancelColumnLayoutChange()`         | method   | Abandon it, restoring width and order.                                                                                             |

### Derived-column UI

| Symbol                                      | Kind        | Purpose                                                                                                                                                      |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DerivedColumnEditPanel`                    | class       | Inline "edit column" inspector attached to a header.                                                                                                         |
| `DerivedColumnEditPanelOptions`             | interface   | Panel ctor options.                                                                                                                                          |
| `DerivedColumnModal`                        | class       | Create/edit modal (expression + vector modes).                                                                                                               |
| `DerivedColumnModalOptions`                 | interface   | Modal ctor options.                                                                                                                                          |
| `AddColumnButton`                           | class       | The "+" button that opens `DerivedColumnModal`.                                                                                                              |
| `AddColumnButtonOptions`                    | interface   | Button ctor options.                                                                                                                                         |
| `DefaultExpressionEditor`                   | class       | Minimal plain-textarea fallback editor.                                                                                                                      |
| `DerivedColumnManager`                      | class       | DuckDB-side lifecycle (VIEW, vector helper tables, validation).                                                                                              |
| `DerivedColumnInfo`                         | interface   | Stored def + detected type metadata.                                                                                                                         |
| `CodeMirrorExpressionEditor`                | class       | CodeMirror 6 editor with DuckDB SQL grammar + autocompletion.                                                                                                |
| `DUCKDB_FUNCTIONS`                          | const array | Function names surfaced by autocomplete. Derived from `DUCKDB_FUNCTION_DETAILS`.                                                                             |
| `DUCKDB_FUNCTION_DETAILS`                   | const array | `{ name, category, description }` for each curated DuckDB function.                                                                                          |
| `DuckDBFunctionInfo`                        | interface   | Shape of one entry in `DUCKDB_FUNCTION_DETAILS`.                                                                                                             |
| `DuckDBFunctionCategory`                    | union type  | `'aggregate' \| 'numeric' \| 'string' \| 'date/time' \| 'casting' \| 'conditional' \| 'list' \| 'struct' \| 'window' \| 'utility'`.                          |
| `createSqlExtensions(context, options?)`    | function    | Returns CodeMirror `Extension[]` (PostgreSQL grammar + schema/function autocomplete + optional theme) for host-built editors mounted outside the data table. |
| `buildCompletionContext(columns, options?)` | function    | Normalizes any column-like array (`ColumnSchema[]`, `[{name, type}, …]`) into a `CompletionContext`.                                                         |
| `SqlExtensionOptions`                       | interface   | `{ includeTheme?, functions?, upperCaseKeywords? }` accepted by `createSqlExtensions`.                                                                       |
| `dataTableTheme`                            | const       | CodeMirror theme using `--dt-*` CSS variables.                                                                                                               |
| `dataTableHighlighting`                     | const       | Syntax-highlighting colors that pair with `dataTableTheme`.                                                                                                  |

### Export (low-level)

| Symbol                                        | Kind      | Purpose                                                     |
| --------------------------------------------- | --------- | ----------------------------------------------------------- |
| `ExportDialog`                                | class     | Modal dialog (format, scope, columns, download/copy).       |
| `ExportDialogOptions`                         | interface | Dialog ctor options.                                        |
| `exportToCSV(rows, opts)`                     | function  | Serialize a row array to CSV.                               |
| `exportFromState(state, bridge, opts)`        | function  | CSV export straight from a live table.                      |
| `ExportOptions`                               | interface | `{ scope, columns, includeHeaders, delimiter, nullValue }`. |
| `exportToJSON(rows, opts)`                    | function  | Serialize to JSON.                                          |
| `exportJSONFromState(state, bridge, opts)`    | function  | JSON export from a live table.                              |
| `JSONExportOptions`                           | interface | JSON-specific options.                                      |
| `exportToParquet(rows, opts)`                 | function  | Serialize to Parquet.                                       |
| `exportParquetFromState(state, bridge, opts)` | function  | Parquet export from a live table.                           |
| `ParquetExportOptions`                        | interface | Parquet-specific options.                                   |
| `copyToClipboard(rows, opts)`                 | function  | Copy rendered rows to the system clipboard.                 |
| `copyRowsToClipboard(rows, opts)`             | function  | Alias kept for legacy callers.                              |
| `ExportContext`                               | type      | Shared context passed between export helpers.               |

### Persistence internals

| Symbol                       | Kind      | Purpose                                                                                 |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `AutoSave`                   | class     | Debounces writes to `SessionStore`.                                                     |
| `AutoSaveOptions`            | interface | `{ debounceMs, undoManager, presetManager, onError }`.                                  |
| `SessionSnapshot`            | type      | Full on-disk snapshot (`schema`, `state`, `derivedColumns`, `undo`, `redo`, `presets`). |
| `SerializedStateSnapshot`    | type      | JSON-safe portion of `SessionSnapshot`.                                                 |
| `SerializedDerivedColumnDef` | type      | JSON-safe derived-column def (vector refs pooled).                                      |
| `PooledVectorColumnRef`      | type      | Reference to a pooled vector value list.                                                |
| `VectorValuePoolEntry`       | type      | A single pool entry.                                                                    |
| `DateWrapper`                | type      | `{ __date__: string }` marker used to round-trip `Date`.                                |
| `SNAPSHOT_VERSION`           | const     | Snapshot schema version bumped on breaking changes.                                     |
| `isPooledVectorRef(value)`   | function  | Type guard for `PooledVectorColumnRef`.                                                 |

### Statistics

| Symbol                                               | Kind     | Purpose                                              |
| ---------------------------------------------------- | -------- | ---------------------------------------------------- |
| `ColumnStatsData`                                    | type     | Union of all stat-kind data shapes.                  |
| `NumericColumnStats`                                 | type     | Numeric stats (min, max, median, sum, …).            |
| `CategoricalColumnStats`                             | type     | Categorical stats (distinct count, top values, …).   |
| `TemporalColumnStats`                                | type     | Date/timestamp stats.                                |
| `TimeColumnStats`                                    | type     | TIME stats.                                          |
| `IntervalColumnStats`                                | type     | INTERVAL stats.                                      |
| `BaseColumnStats`                                    | type     | Common fields (`totalCount`, `nullCount`).           |
| `statsKindForDataType(type)`                         | function | Pick the stats kind for a `DataType`.                |
| `formatStatValue(value, type, locale?)`              | function | Format a single stat value.                          |
| `formatCount(n, locale?)`                            | function | Locale-aware integer formatting.                     |
| `formatDefaultStats(stats, type, messages)`          | function | Produce the multi-line stats block shown in headers. |
| `fetchIntervalStats(bridge, table, column, filters)` | function | Compute interval stats on demand.                    |

### Visualization internals

| Symbol                                                                                                                                                                             | Kind                   | Purpose                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BaseVisualization`                                                                                                                                                                | abstract class         | Base for canvas visualizations (subclass to add custom viz types).                                         |
| `VisualizationOptions`                                                                                                                                                             | interface              | Ctor options (`bridge`, `state`, `filters`, `classPrefix`, …).                                             |
| `Histogram`                                                                                                                                                                        | class                  | Numeric histogram.                                                                                         |
| `DateHistogram`                                                                                                                                                                    | class                  | Date/timestamp histogram.                                                                                  |
| `TimeHistogram`                                                                                                                                                                    | class                  | TIME histogram.                                                                                            |
| `IntervalHistogram`                                                                                                                                                                | class                  | INTERVAL histogram.                                                                                        |
| `ValueCounts`                                                                                                                                                                      | class                  | Categorical stacked-segment bar.                                                                           |
| `HistogramBin`, `HistogramData`, `DateHistogramBin`, `DateHistogramData`, `TimeInterval`, `TimeHistogramBin`, `TimeHistogramData`, `IntervalHistogramBin`, `IntervalHistogramData` | types                  | Per-viz data shapes.                                                                                       |
| `CategorySegment`, `ValueCountsData`                                                                                                                                               | types                  | Shapes for `ValueCounts`.                                                                                  |
| `CrossfilterCoordinator`                                                                                                                                                           | class                  | Broadcasts filter changes to registered visualizations.                                                    |
| `InteractionManager`                                                                                                                                                               | class                  | LIFO Escape-key stack for brush/selection interactions.                                                    |
| `InteractiveVisualization`                                                                                                                                                         | type                   | Interface implemented by visualizations participating in `InteractionManager`.                             |
| `isNumericType`, `isDateType`, `isTimeType`, `isCategoricalType`, `isIntervalType`, `needsVisualization`                                                                           | functions              | `DataType` predicates.                                                                                     |
| `VisualizationFactory`                                                                                                                                                             | class (**deprecated**) | Legacy static wrapper kept on `/advanced` only. New code uses `VisualizationRegistry` from the root entry. |

---

## `createDataTable`

```ts
function createDataTable(options: CreateDataTableOptions): Promise<DataTable>;
```

Source: `src/DataTable.ts`. Validates options, initializes a `WorkerBridge`, builds `TableState`/`StateActions`, mounts the UI into `options.container`, wires events/persistence/presets/undo-redo, and resolves once UI is mounted. If `options.source` is provided, the initial load begins asynchronously (not awaited by the returned promise — subscribe to `loadComplete` or `loadError` to observe it).

---

## `CreateDataTableOptions`

Source: `src/DataTable.ts:123-278`.

### Mounting

| Field       | Type          | Required? | Default | Description                                                                                                                          |
| ----------- | ------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `container` | `HTMLElement` | yes       | —       | Element that will host the table. The library takes full ownership of its contents. Must have a bounded height — see the note below. |

A bounded container height is a performance requirement, not a style preference. The library appends a `height: 100%` root into `container` (`src/styles/02-shell.css:11-19`) and the virtual scroller sizes its render window from the `clientHeight` of the internal `.dt-body-scroll` viewport (`src/table/VirtualScroller.ts:245-262`) — `⌈clientHeight / rowHeight⌉ + 10` rows. When `container` is content-sized, that chain resolves to the height of the whole dataset: the visible range becomes every row, the body issues a single `LIMIT <totalRows>` query (`src/table/TableBody.ts:732`), and a DOM row is built per result (`src/table/TableBody.ts:812`). Virtualization is defeated with no error and no warning. The degenerate opposite — a container that is zero-tall at mount — renders nothing and does log a one-shot `console.warn` (`src/table/TableContainer.ts:357-368`).

There is no `height`, `maxHeight`, or `autoHeight` option; sizing the element is the host page's job, and the library never writes styles onto it. The inverse holds for `rowHeight` / `headerHeight` below: those are options rather than CSS knobs, and the library publishes them as the `--dt-row-height` / `--dt-header-height` custom properties on its own root, so overriding those tokens in a stylesheet has no effect. Selector strings are not accepted — pass the `HTMLElement`. See [Sizing the container](../README.md#sizing-the-container) for the two layouts that work and the failure modes, and [Architecture § Virtual scroller](./concepts/architecture.md#virtual-scroller) for the mechanism in full.

### Data

| Field          | Type                                    | Required? | Default        | Description                                                           |
| -------------- | --------------------------------------- | --------- | -------------- | --------------------------------------------------------------------- |
| `source`       | `File \| string \| ArrayBuffer \| Blob` | no        | —              | Initial data source. If omitted, call `table.loadData(source)` later. |
| `sourceFormat` | `DataFormat`                            | no        | auto-detect    | Override format when the URL/filename doesn't encode it.              |
| `tableName`    | `string`                                | no        | auto-generated | DuckDB-side table name.                                               |

### Features (all default to `true`)

| Field                   | Type                                           | Default                        | Description                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistence`           | `boolean \| { sessionStore?: SessionStore }`   | `true`                         | IndexedDB session snapshot. Pass `{ sessionStore }` to reuse an existing store across tables.                                                                                                                                                                                                     |
| `presets`               | `boolean \| { manager?: FilterPresetManager }` | `true`                         | Filter preset UI + storage. Pass `{ manager }` to share across tables.                                                                                                                                                                                                                            |
| `undoRedo`              | `boolean`                                      | `true`                         | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z, plus Ctrl+Y for redo.                                                                                                                                                                                                                                              |
| `expressionFilter`      | `boolean`                                      | `true`                         | Raw-SQL filter button in the filter bar.                                                                                                                                                                                                                                                          |
| `derivedColumns`        | `boolean`                                      | `true`                         | "+" add-column button and per-header `f(x)` edit icon. The programmatic API (`actions.addDerivedColumn` etc.) is unaffected by this flag.                                                                                                                                                         |
| `visualizations`        | `boolean`                                      | `true`                         | Auto-attach column-header histograms and value counts.                                                                                                                                                                                                                                            |
| `visualizationRegistry` | `VisualizationRegistry`                        | `defaultVisualizationRegistry` | Per-instance registry for custom visualizations.                                                                                                                                                                                                                                                  |
| `statsPanelRegistry`    | `StatsPanelRegistry`                           | `defaultStatsPanelRegistry`    | Per-instance registry for custom column-stats panels. Both the per-instance and module-scoped fallback are empty by default — register a `BaseStatsPanel` subclass to replace the library's built-in `formatDefaultStats` rendering for matching column types. See [Stats panels](#stats-panels). |
| `exportDialog`          | `boolean`                                      | `true`                         | Built-in export dialog (CSV/JSON/Parquet).                                                                                                                                                                                                                                                        |

### Worker

| Field           | Type                  | Required? | Default         | Description                                                                                                                       |
| --------------- | --------------------- | --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bridge`        | `WorkerBridge`        | no        | new one created | Share a worker across tables.                                                                                                     |
| `bridgeOptions` | `WorkerBridgeOptions` | no        | `{}`            | Options for the owned bridge (`workerFactory`, `workerUrl`, `duckdbBundles`, `initTimeoutMs`). Ignored when `bridge` is supplied. |

### UI

| Field          | Type          | Required? | Default         | Description                                                                                                                                                                                        |
| -------------- | ------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portalTarget` | `HTMLElement` | no        | `document.body` | Where fixed-position modals mount.                                                                                                                                                                 |
| `rowHeight`    | `number`      | no        | `32`            | Row height in pixels. With the scroll viewport's height it fixes how many rows render — see [Mounting](#mounting). Published as `--dt-row-height`.                                                 |
| `headerHeight` | `number`      | no        | `120`           | Header height in pixels (accommodates visualizations). Applied as a `min-height` on the header row, so it comes out of the container's height before the body scroll viewport takes the remainder. |
| `colorScheme`  | `ColorScheme` | no        | `'auto'`        | Initial light/dark theme.                                                                                                                                                                          |
| `classPrefix`  | `string`      | no        | `'dt'`          | CSS class prefix for full isolation.                                                                                                                                                               |

### Customization

| Field                | Type                      | Required? | Default           | Description                                                                                                                                                                                       |
| -------------------- | ------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instanceId`         | `string`                  | no        | auto-generated    | Mixed into element IDs to avoid ambiguous `aria-labelledby` / `aria-activedescendant` IDREFs. A random suffix is always appended — read `DataTable.instanceId` for the value actually in the DOM. |
| `editorFactory`      | `ExpressionEditorFactory` | no        | CodeMirror editor | Plug a custom expression editor.                                                                                                                                                                  |
| `messages`           | `DeepPartial<Strings>`    | no        | `defaultStrings`  | Override user-facing strings. Consumed once at init — rebuild to change.                                                                                                                          |
| `strictBrowserCheck` | `boolean`                 | no        | `false`           | When true, reject init with `WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`) if any required browser API is missing.                                                                              |

---

## `DataTable` interface

Returned by `createDataTable()`. Source: `src/DataTable.ts:283-372`.

### Properties

| Property      | Type              | Purpose                                                                                                                                                                                                                               |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`       | `TableState`      | Reactive signals. See [state signals](#state-signals).                                                                                                                                                                                |
| `actions`     | `StateActions`    | Command/mutation layer. See [actions methods](#actions-methods).                                                                                                                                                                      |
| `annotations` | `AnnotationStore` | Programmatic row / column / cell annotation CRUD. See [`table.annotations` namespace](#tableannotations-namespace). The class itself lives on `/advanced`; the instance is created by `createDataTable` and torn down on `destroy()`. |
| `bridge`      | `WorkerBridge`    | DuckDB worker bridge for custom SQL.                                                                                                                                                                                                  |
| `container`   | `TableContainer`  | UI container. Rarely needed directly.                                                                                                                                                                                                 |
| `instanceId`  | `string`          | Unique per-instance identifier, mixed into this table's element IDs (e.g., `'t1-a3f9'`). This is the resolved value — a supplied `instanceId` appears here with its random suffix attached.                                           |

### Methods

| Method                | Signature                                                     | Purpose                                                                                                             |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `loadData`            | `(source, opts?) => Promise<void>`                            | Load a new source. Emits `loadStart` → `loadProgress` → `loadComplete` (or `loadError`).                            |
| `on`                  | `<K extends keyof TableEvents>(event, handler) => () => void` | Subscribe. Returns an unsubscribe function.                                                                         |
| `off`                 | `<K extends keyof TableEvents>(event, handler) => void`       | Unsubscribe.                                                                                                        |
| `openExportDialog`    | `() => void`                                                  | Open the export dialog. No-op when `exportDialog: false`.                                                           |
| `clearSession`        | `() => Promise<void>`                                         | Wipe persisted snapshot AND in-memory state. Call `loadData()` after to repopulate.                                 |
| `destroy`             | `() => Promise<void>`                                         | Tear down DOM, subscriptions, worker (if owned), session store (if owned).                                          |
| `isDestroyed`         | `() => boolean`                                               | Guard against use after `destroy()`.                                                                                |
| `isPersistenceActive` | `() => boolean`                                               | `false` if persistence disabled OR IndexedDB unavailable (watch for `warning` with code `PERSISTENCE_UNAVAILABLE`). |
| `setColorScheme`      | `(scheme: ColorScheme) => void`                               | Switch light/dark at runtime.                                                                                       |
| `getColorScheme`      | `() => ColorScheme`                                           | Currently-applied scheme.                                                                                           |

---

## State signals

Source: `src/core/State.ts`. Access via `table.state.<name>.get()` / `.subscribe(fn)`.

| Signal                 | Type                                              | Purpose                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tableName`            | `Signal<string \| null>`                          | DuckDB table / VIEW name.                                                                                                                                                                                                                            |
| `schema`               | `Signal<ColumnSchema[]>`                          | Column schema.                                                                                                                                                                                                                                       |
| `totalRows`            | `Signal<number>`                                  | Row count.                                                                                                                                                                                                                                           |
| `baseTableName`        | `Signal<string \| null>`                          | Original table name (before VIEW).                                                                                                                                                                                                                   |
| `derivedColumns`       | `Signal<DerivedColumnDef[]>`                      | Derived-column definitions.                                                                                                                                                                                                                          |
| `filters`              | `Signal<Filter[]>`                                | Active filters.                                                                                                                                                                                                                                      |
| `filteredRows`         | `Signal<number>`                                  | Rows matching filters.                                                                                                                                                                                                                               |
| `filtersByColumn`      | `Computed<Map<string, Filter[]>>`                 | Filters grouped by column name (derived).                                                                                                                                                                                                            |
| `sortColumns`          | `Signal<SortColumn[]>`                            | Sort columns in priority order.                                                                                                                                                                                                                      |
| `visibleColumns`       | `Signal<string[]>`                                | Currently visible column names.                                                                                                                                                                                                                      |
| `columnOrder`          | `Signal<string[]>`                                | Display order.                                                                                                                                                                                                                                       |
| `columnWidths`         | `Signal<Map<string, number>>`                     | Custom widths (pixels).                                                                                                                                                                                                                              |
| `pinnedColumns`        | `Signal<string[]>`                                | Left-pinned column names.                                                                                                                                                                                                                            |
| `hiddenColumnInfo`     | `Signal<Map<string, HiddenColumnInfo>>`           | Neighbor metadata for hidden columns.                                                                                                                                                                                                                |
| `columnHeaderTooltips` | `Signal<Map<string, ColumnHeaderTooltipContent>>` | Per-column structured popover content set via `actions.setColumnHeaderTooltip`. Empty map by default; persisted into `SessionSnapshot.columnHeaderTooltips`.                                                                                         |
| `selectedRows`         | `Signal<Set<number>>`                             | Selected row indices.                                                                                                                                                                                                                                |
| `hoveredRow`           | `Signal<number \| null>`                          | Hovered row index.                                                                                                                                                                                                                                   |
| `hoveredColumn`        | `Signal<string \| null>`                          | Hovered column name.                                                                                                                                                                                                                                 |
| `focusedCell`          | `Signal<{ row: number; column: string } \| null>` | Keyboard cursor. `null` when there is no cursor. `row: -1` is the header sentinel (`HEADER_ROW_INDEX` internally) — the cursor is on the column-header row rather than on a data row, so treat any negative row as "not a data row" before indexing. |

The reserved synthetic [`__rowid__`](./glossary.md#__rowid__-synthetic-row-id) column appears in `schema` and `columnOrder` but is excluded from the default `visibleColumns`. The `ColumnSchema` entry carries `system: true`. Toggle visibility with `actions.showColumn('__rowid__')` / `actions.hideColumn('__rowid__')`.

---

## Actions methods

Source: `src/core/Actions.ts`. Access via `table.actions`.

### Undo / redo

| Method                     | Signature                                | Notes                                                                                                                                |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `undo`                     | `() => Promise<boolean>`                 | Resolves `true` if something was undone.                                                                                             |
| `redo`                     | `() => Promise<boolean>`                 | Resolves `true` if something was redone.                                                                                             |
| `beginColumnWidthChange`   | `() => void`                             | Call before a width drag so undo captures pre-drag state. Thin alias for `beginColumnLayoutChange`.                                  |
| `endColumnWidthChange`     | `() => void`                             | Pair with `beginColumnWidthChange`. Thin alias for `endColumnLayoutChange`.                                                          |
| `beginColumnLayoutChange`  | `() => void`                             | Open a column-layout gesture: every width and order change until it closes becomes one undo entry, and nested capture is suppressed. |
| `endColumnLayoutChange`    | `() => void`                             | Commit the gesture. Pushes an undo entry **only if the state actually changed** — a no-op drag adds no step.                         |
| `cancelColumnLayoutChange` | `() => void`                             | Abandon the gesture: restore the width and order it opened on, push nothing. The `Escape` half of `Shift+F2`.                        |
| `getUndoManager`           | `() => UndoManager \| undefined`         | Returns the active manager or `undefined` if `undoRedo: false`.                                                                      |
| `resetToInitial`           | `() => Promise<boolean>`                 | Reset to snapshot captured at load time.                                                                                             |
| `setOnFilterRemove`        | `(cb: (column: string) => void) => void` | Called when a filter chip is removed (e.g., to clear viz state).                                                                     |

### Data loading

| Method     | Signature                             | Notes                                                                             |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------- |
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

| Method             | Signature                                                 | Notes                                                     |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| `addFilter`        | `(filter: Filter) => void`                                | Replaces any existing filter on the same column + type.   |
| `removeFilter`     | `(column: string, type?: FilterType) => void`             | Removes all filters for the column; pass `type` to scope. |
| `clearFilters`     | `() => void`                                              | Remove every filter.                                      |
| `loadFilterPreset` | `(filters: Filter[], sortColumns?: SortColumn[]) => void` | Atomic replace of filters (and optionally sort).          |

### Raw SQL filters

| Method               | Signature                                                                                                 | Notes                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `addRawSQLFilter`    | `(sql: string, label?: string) => string`                                                                 | Returns the new filter `id`.                           |
| `updateRawSQLFilter` | `(id: string, sql: string, label?: string) => void`                                                       |                                                        |
| `removeRawSQLFilter` | `(id: string) => void`                                                                                    |                                                        |
| `getRawSQLFilters`   | `() => RawSQLFilter[]`                                                                                    |                                                        |
| `validateSQLFilter`  | `(sql: string, signal?: AbortSignal) => Promise<{ valid: boolean; matchCount?: number; error?: string }>` | Validates a WHERE-clause fragment without applying it. |
| `getFiltersSQL`      | `() => string`                                                                                            | Current WHERE clause from all active filters.          |

### Sorting

| Method       | Signature                         | Notes                                                                  |
| ------------ | --------------------------------- | ---------------------------------------------------------------------- |
| `setSort`    | `(columns: SortColumn[]) => void` | Replace the entire sort.                                               |
| `toggleSort` | `(column: string) => void`        | Cycle none → asc → desc → none for that column (replaces other sorts). |
| `addToSort`  | `(column: string) => void`        | Multi-sort: add or toggle direction.                                   |
| `clearSort`  | `() => void`                      |                                                                        |

### Column visibility

| Method           | Signature                  | Notes                                             |
| ---------------- | -------------------------- | ------------------------------------------------- |
| `hideColumn`     | `(column: string) => void` | Records neighbors for intelligent restore.        |
| `showColumn`     | `(column: string) => void` | Re-inserts next to original neighbor if possible. |
| `showAllColumns` | `() => void`               |                                                   |

### Column order / pin / width

| Method             | Signature                                 | Notes                             |
| ------------------ | ----------------------------------------- | --------------------------------- |
| `setColumnOrder`   | `(columns: string[]) => void`             |                                   |
| `toggleColumnPin`  | `(column: string) => void`                | Moves to / from the pinned group. |
| `setColumnWidth`   | `(column: string, width: number) => void` |                                   |
| `resetColumnWidth` | `(column: string) => void`                |                                   |

### Derived columns

| Method                 | Signature                                                                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addDerivedColumn`     | `(def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>`                                                                         | Expression or vector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `updateDerivedColumn`  | `(oldName: string, def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>`                                                        | Handles renames; if `def.name !== oldName` the column is renamed and references are propagated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `replaceDerivedColumn` | `(name: string, newDef: DerivedColumnDef) => Promise<{ success: true; info: DerivedColumnInfo } \| { success: false; error: DerivedColumnError }>` | Same-name replacement with dependent re-validation. Pre-flight order: existence → expression validation → type detection → dependent re-validation → cycle check → commit. Errors: `NOT_FOUND`, `EXPRESSION_INVALID`, `DEPENDENTS_INCOMPATIBLE` (`details.dependentsAffected: string[]`, `details.reasons: Record<string,string>`), `CIRCULAR_DEPENDENCY`, `VECTOR_LENGTH_MISMATCH`. Fires `derivedChange` with `kind: 'replaced'` on success. See [Derived columns guide → Replacing](./guides/derived-columns.md#replacing-a-derived-column-same-name--dependent-re-validation). |
| `removeDerivedColumn`  | `(name: string) => Promise<void>`                                                                                                                  | Fires `derivedChange` with `kind: 'removed'` and `columnName` set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `validateExpression`   | `(expression: string) => Promise<{ valid: boolean; type?: DataType; originalType?: string; error?: string }>`                                      | Validate without committing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getCompletionContext` | `() => CompletionContext`                                                                                                                          | For autocompletion in custom editors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Column values (read-only export)

```ts
async getColumnValues(
  name: string,
  opts?: GetColumnValuesOptions,
): Promise<unknown[] | Int32Array | Float64Array | BigInt64Array>;

interface GetColumnValuesOptions {
  scope?: 'all' | 'filtered' | 'selected';   // default 'all'
  limit?: number;                             // default no limit
  offset?: number;                            // default 0
  signal?: AbortSignal;
}
```

Returns the named column's values in `__rowid__` order (or selection insertion order when `scope: 'selected'`). The return type narrows by data type:

| `DataType`                                                                               | Returned as     |
| ---------------------------------------------------------------------------------------- | --------------- |
| `'integer'`                                                                              | `Int32Array`    |
| `'float'` / `'decimal'`                                                                  | `Float64Array`  |
| `'integer'` BIGINT (incl. `__rowid__`)                                                   | `BigInt64Array` |
| `'string'` / `'date'` / `'timestamp'` / `'time'` / `'boolean'` / `'uuid'` / `'interval'` | `unknown[]`     |

Notes:

- Empty selection + `scope: 'selected'` returns `[]` (no throw).
- `__rowid__` is queryable by name even though it's hidden in the grid by default.
- Pagination is enforced by SQL (`LIMIT` / `OFFSET`) — not slicing afterwards.

Errors (all `QueryError`):

| Code                 | When                                            |
| -------------------- | ----------------------------------------------- |
| `NO_TABLE`           | Called before data is loaded.                   |
| `COLUMN_NOT_FOUND`   | `name` is not in `state.schema`.                |
| `INVALID_PAGINATION` | `limit` or `offset` is negative or non-integer. |

See [`examples/10-column-export/`](../examples/10-column-export/) for a runnable demo, including `BigInt64Array` ergonomics for `__rowid__`.

### Column-header tooltips

```ts
setColumnHeaderTooltip(
  columnName: string,
  content: string | ColumnHeaderTooltipContent | null,
): void;
getColumnHeaderTooltip(columnName: string): ColumnHeaderTooltipContent | null;
```

Attach (or update) a structured popover anchored on the column-name span. A plain `string` is shorthand for `{ description: string }`. `null` (or any input that normalises to empty) clears the override.

Every text field is rendered via `.textContent` — HTML strings, DOM nodes, and render functions are not accepted. Malformed `items` entries are dropped silently during normalization. Persisted into `SessionSnapshot.columnHeaderTooltips` by default; pass `persistence: false` if the embedding app already owns its column catalogue (recommended pattern).

Type definitions inlined under [Column-header tooltip content](#column-header-tooltip-content); see also the [Column-header tooltips guide](./guides/column-header-tooltips.md).

### Selection

| Method           | Signature                                                          | Notes                      |
| ---------------- | ------------------------------------------------------------------ | -------------------------- |
| `selectRow`      | `(index: number, mode?: 'replace' \| 'toggle' \| 'range') => void` | Default mode: `'replace'`. |
| `clearSelection` | `() => void`                                                       |                            |
| `selectAll`      | `() => void`                                                       |                            |

### UI state

| Method             | Signature                                                 | Notes                                                       |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| `setHoveredRow`    | `(index: number \| null) => void`                         |                                                             |
| `setHoveredColumn` | `(column: string \| null) => void`                        |                                                             |
| `setFocusedCell`   | `(cell: { row: number; column: string } \| null) => void` | Pass `row: -1` to park the cursor on the column-header row. |
| `clearFocusedCell` | `() => void`                                              |                                                             |

---

## `table.annotations` namespace

Access via `table.annotations`. Source: `src/annotations/AnnotationStore.ts`.

Annotations are app-authored overlay metadata (typically validation results from a JSON Schema or quality-control rules). They live outside `TableState` and do **not** participate in undo/redo. Auto-persisted into `SessionSnapshot.annotations`. See the [annotations guide](./guides/annotations.md) for narrative and the [Annotation JSON format](#annotation-json-format) for the on-disk shape.

### CRUD

| Method       | Signature                                                    | Notes                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`        | `(ann: NewAnnotation) => Annotation`                         | Stores one annotation. Generates an `id` if missing (`ann_` + 26-char Crockford base32). Throws `AnnotationError('DUPLICATE_ID')` if a caller-supplied `id` already exists. Sets `createdAt` if missing.                     |
| `addMany`    | `(anns: NewAnnotation[]) => Annotation[]`                    | Atomic batch — if any entry fails, none are stored. Fires a single `change` event.                                                                                                                                           |
| `update`     | `(id: string, patch: Partial<AnnotationBase>) => Annotation` | Patch the message / severity / code / source / metadata. `scope`, `rowId`, and `column` are immutable — passing them in `patch` is a no-op. Throws `AnnotationError('NOT_FOUND')` if the id is unknown. Updates `updatedAt`. |
| `remove`     | `(id: string) => boolean`                                    | Returns `true` if the annotation existed and was removed.                                                                                                                                                                    |
| `removeMany` | `(ids: string[]) => number`                                  | Returns the number actually removed.                                                                                                                                                                                         |
| `clear`      | `(scope?: AnnotationScope \| 'all') => number`               | Defaults to `'all'`. Returns the number removed. Single `cleared` event.                                                                                                                                                     |
| `count`      | `() => number`                                               | Total annotations in the store.                                                                                                                                                                                              |

### Lookups

| Method        | Signature                                         | Notes                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`         | `(id: string) => Annotation \| null`              | Single fetch by id.                                                                                                                                                                                                                                                                                |
| `getAll`      | `() => Annotation[]`                              | Insertion order.                                                                                                                                                                                                                                                                                   |
| `getByRow`    | `(rowId: number) => Annotation[]`                 | Row-scope only — does not include cell-scope annotations on the same row.                                                                                                                                                                                                                          |
| `getByColumn` | `(column: string) => Annotation[]`                | Column-scope only.                                                                                                                                                                                                                                                                                 |
| `getByCell`   | `(rowId: number, column: string) => Annotation[]` | Intersection — returns the union of row + column + cell annotations applicable at `(rowId, column)`. Sorted by severity (`error` > `warning` > `info`), then `createdAt` ascending, then insertion order. This is the list rendered in the popover when a user hovers / focuses an annotated cell. |

### Severity filter (view layer)

| Method              | Signature                                  | Notes                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setSeverityFilter` | `(patch: Partial<SeverityFilter>) => void` | Toggle which severities the rendering layer paints. The store's data is unchanged — `getAll` / `getByRow` / `getByColumn` / `getByCell` always return the full set. Fires a `change` event with `kind: 'filterChanged'` and empty `ids`. |
| `getSeverityFilter` | `() => SeverityFilter`                     | Returns the current `{ error, warning, info }` flags (default all `true`).                                                                                                                                                               |

### JSON I/O

| Method     | Signature                                                                                   | Notes                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toJSON`   | `() => AnnotationFile`                                                                      | Snapshot of the store. Sets `version: ANNOTATION_FILE_VERSION`, `tableName` (from the owning table), `createdAt` / `updatedAt`. Preserves unknown top-level and per-annotation fields verbatim.                                                                                                    |
| `loadJSON` | `(file: AnnotationFile, mode?: 'replace' \| 'merge') => { added: number; skipped: number }` | Default mode is `'replace'`. `'merge'` adds without clearing — duplicate ids reject with `AnnotationError('DUPLICATE_ID')`. Files with `version > ANNOTATION_FILE_VERSION` reject with `AnnotationError('VERSION_UNSUPPORTED')`. Malformed entries reject with `AnnotationError('INVALID_SHAPE')`. |

### Events

| Method | Signature                                                           | Notes                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `on`   | `(event: 'change', handler: AnnotationChangeHandler) => () => void` | Returns an unsubscribe function. Payload: `{ kind: 'added' \| 'updated' \| 'removed' \| 'cleared' \| 'filterChanged'; ids: string[] }`. `'filterChanged'` fires with empty `ids` when `setSeverityFilter` flips a flag. Bulk operations fire one event with the full id list. |

---

## Event catalog

Source: `src/core/TableEvents.ts`. Subscribe via `table.on(name, handler)`.

| Event             | Payload                                                                                                              | When it fires                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`           | `{ bridgeReady: true }`                                                                                              | After `initialize()` completes; late subscribers receive it in a microtask.                                                                                                                                                                         |
| `loadStart`       | `{ source: string }`                                                                                                 | Load begins.                                                                                                                                                                                                                                        |
| `loadProgress`    | `ProgressInfo`                                                                                                       | Per-chunk progress (`download` / `decode` / `register` / `ingest` / `finalize`).                                                                                                                                                                    |
| `loadComplete`    | `{ tableName, rowCount, schema }`                                                                                    | Data loaded and schema known.                                                                                                                                                                                                                       |
| `loadError`       | `{ error: Error }`                                                                                                   | Load failed.                                                                                                                                                                                                                                        |
| `error`           | `{ error: DataTableError; source: TableErrorSource }`                                                                | Any recoverable typed error. `source` discriminates the subsystem.                                                                                                                                                                                  |
| `warning`         | `{ code: string; message: string; details?: Record<string, unknown> }`                                               | Non-fatal degradation (e.g., `STYLESHEET_MISSING`, `PERSISTENCE_UNAVAILABLE`).                                                                                                                                                                      |
| `filterChange`    | `{ filters, filteredRowCount, totalRowCount }`                                                                       | Any filter-list change.                                                                                                                                                                                                                             |
| `sortChange`      | `{ sortColumns }`                                                                                                    | Sort changed.                                                                                                                                                                                                                                       |
| `selectionChange` | `{ selectedRows: Set<number> }`                                                                                      | Row selection changed.                                                                                                                                                                                                                              |
| `columnChange`    | `{ visibleColumns, pinnedColumns, columnOrder }`                                                                     | Visibility, order, pin, or width change.                                                                                                                                                                                                            |
| `derivedChange`   | `{ derivedColumns: DerivedColumnDef[]; kind: 'added' \| 'removed' \| 'replaced' \| 'updated'; columnName?: string }` | Derived-column list changed. `kind: 'replaced'` fires for [`replaceDerivedColumn`](#derived-columns); `'updated'` for `updateDerivedColumn`; `'added'` / `'removed'` for the matching APIs. `columnName` names the affected column when applicable. |
| `undoChange`      | `{ canUndo, canRedo }`                                                                                               | Undo-stack state changed.                                                                                                                                                                                                                           |
| `destroy`         | `Record<string, never>`                                                                                              | Library teardown, before signals are disposed.                                                                                                                                                                                                      |

> Annotation mutations don't flow through this bus — subscribe via [`table.annotations.on('change', …)`](#tableannotations-namespace) instead.

---

## Error catalog

Every error is a subclass of `DataTableError` with `error.code: string` and optional `error.details`. Subscribe via:

```ts
table.on('error', ({ error, source }) => {
  if (error.code === 'PARSE_FAILED') showToast('Could not read that file.');
  else reportToSentry(error);
});
```

| Code                      | Class                   | Source                                                                             | Trigger                                                                                                                                              |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPTIONS_INVALID`         | `ConfigurationError`    | `src/DataTable.ts`, `src/filters/FilterPresets.ts`                                 | Invalid option passed to `createDataTable()` or `FilterPresetManager`.                                                                               |
| `WORKER_UNSUPPORTED`      | `WorkerInitError`       | `src/DataTable.ts`                                                                 | `strictBrowserCheck: true` and at least one required API is missing. `details.missing: string[]`.                                                    |
| `WORKER_CRASHED`          | `WorkerInitError`       | `src/data/WorkerBridge.ts`                                                         | Worker error or failed init.                                                                                                                         |
| `WORKER_INIT_TIMEOUT`     | `WorkerInitError`       | `src/data/WorkerBridge.ts`                                                         | Worker init did not complete within `initTimeoutMs` (default 30s).                                                                                   |
| `WORKER_TERMINATED`       | `WorkerTerminatedError` | `src/data/WorkerBridge.ts`                                                         | Worker terminated mid-flight.                                                                                                                        |
| `BRIDGE_NOT_READY`        | `ConfigurationError`    | `src/core/Actions.ts`, `src/worker/duckdb.ts`, `src/data/WorkerBridge.ts`          | Bridge used before init (`await createDataTable()` not yet resolved).                                                                                |
| `QUERY_RUNTIME`           | `QueryError`            | various viz + query sites                                                          | DuckDB returned an error at query time.                                                                                                              |
| `QUERY_ABORTED`           | `QueryError`            | `src/data/WorkerBridge.ts`                                                         | Query aborted via `AbortSignal` or bridge teardown.                                                                                                  |
| `SQL_SYNTAX`              | `SQLValidationError`    | `src/core/Actions.ts`                                                              | Raw-SQL filter / derived-column expression failed WHERE-clause validation.                                                                           |
| `LOAD_PARSE_FAILED`       | `LoadError`             | `src/worker/loaders/common.ts`                                                     | CSV/JSON/Parquet parse failed during timestamp/date/time coercion.                                                                                   |
| `LOAD_INVALID_TIMEZONE`   | `LoadError`             | `src/worker/loaders/{csv,json,parquet}.ts`                                         | Invalid timezone in load options.                                                                                                                    |
| `LOAD_INVALID_OPTIONS`    | `LoadError`             | `src/worker/loaders/{csv,json}.ts`                                                 | Incompatible load-option combination.                                                                                                                |
| `LOAD_FORMAT_UNSUPPORTED` | `LoadError`             | `src/worker/worker.ts`                                                             | Unknown/unsupported file format.                                                                                                                     |
| `FETCH_FAILED`            | `LoadError`             | `src/data/DataLoader.ts`                                                           | URL fetch failed.                                                                                                                                    |
| `PARSE_FAILED`            | `LoadError`             | `src/DataTable.ts`                                                                 | Generic parse fallback.                                                                                                                              |
| `EXPRESSION_INVALID`      | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`                                              | Derived-column expression rejected by DuckDB.                                                                                                        |
| `CIRCULAR_DEPENDENCY`     | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`                                              | Derived column references itself (directly or transitively).                                                                                         |
| `DEPENDENTS_INCOMPATIBLE` | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts`                       | `replaceDerivedColumn` would break one or more dependent columns. `details.dependentsAffected: string[]`, `details.reasons: Record<string, string>`. |
| `NOT_FOUND`               | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts`                       | Derived column missing on update / replace / remove.                                                                                                 |
| `DUPLICATE_NAME`          | `DerivedColumnError`    | `src/core/Actions.ts`                                                              | A column with that name already exists.                                                                                                              |
| `VECTOR_LENGTH_MISMATCH`  | `DerivedColumnError`    | `src/core/Actions.ts`                                                              | Vector length doesn't match row count.                                                                                                               |
| `RESERVED_COLUMN_NAME`    | `LoadError`             | `src/worker/loaders/{csv,json,parquet}.ts`                                         | Source contains a column named `__rowid__`, which is reserved for the synthetic row id.                                                              |
| `COLUMN_NOT_FOUND`        | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`)                                          | Column does not exist on the loaded schema.                                                                                                          |
| `INVALID_PAGINATION`      | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`)                                          | `limit` or `offset` is negative or non-integer.                                                                                                      |
| `NO_TABLE`                | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`)                                          | Action invoked before data was loaded.                                                                                                               |
| `DUPLICATE_ID`            | `AnnotationError`       | `src/annotations/AnnotationStore.ts`                                               | Annotation `id` already exists in the store (during `add`, `addMany`, or `loadJSON('merge')`).                                                       |
| `INVALID_SHAPE`           | `AnnotationError`       | `src/annotations/AnnotationStore.ts`                                               | `loadJSON` rejected a malformed entry — wrong scope, missing required field, wrong field type.                                                       |
| `VERSION_UNSUPPORTED`     | `AnnotationError`       | `src/annotations/AnnotationStore.ts`                                               | `loadJSON` was given a file whose `version > ANNOTATION_FILE_VERSION`.                                                                               |
| `NO_TABLE_LOADED`         | `ExportError`           | `src/export/{CSV,JSON,Parquet,Clipboard}Export.ts`                                 | Export called before data loaded.                                                                                                                    |
| `CANVAS_UNAVAILABLE`      | `ExportError`           | `src/visualizations/BaseVisualization.ts`                                          | Canvas rendering unavailable (headless browsers).                                                                                                    |
| `CLIPBOARD_UNAVAILABLE`   | `ExportError`           | `src/export/Clipboard.ts`                                                          | Clipboard API blocked (non-secure context, permissions).                                                                                             |
| `SAVE_FAILED`             | `PersistenceError`      | `src/persistence/AutoSave.ts`                                                      | IndexedDB write failed (quota, aborted transaction).                                                                                                 |
| `PERSISTENCE_UNAVAILABLE` | warning event           | `src/DataTable.ts`                                                                 | IndexedDB unavailable (private browsing). Surfaced via `warning` event, not `error`.                                                                 |
| `STYLESHEET_MISSING`      | warning event           | `src/DataTable.ts`                                                                 | `@jeyabbalas/data-table/styles` was not imported. Surfaced via `warning` event.                                                                      |
| `DESTROYED`               | `DestroyedError`        | `src/DataTable.ts`                                                                 | Public method called after `destroy()`.                                                                                                              |
| `INVARIANT`               | `ConfigurationError`    | `src/statistics/ColumnStatsTypes.ts`, `src/core/Signal.ts`, `src/worker/worker.ts` | Internal invariant violation (should not happen — file a bug).                                                                                       |

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
  type: 'range',
  column: 'age',
  min: 18,
  max: 65,
  maxInclusive: true,
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
  column: string; // synthetic key: '__raw_sql_<id>__'
  sql: string; // WHERE clause fragment (no WHERE keyword)
  label?: string; // human-readable label for the filter chip
  id: string; // unique identifier (crypto.randomUUID())
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
  | 'integer'
  | 'float'
  | 'decimal'
  | 'string'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'interval';

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
  values: precomputedScores, // length must equal table row count
});
```

Vector columns materialize a helper table in DuckDB; the main table becomes a VIEW so existing queries transparently see the new column.

---

## Stats panels

Custom replacements for the column-header `.dt-col-stats` slot — the two-line stats text that sits below each visualization. Subclass [`BaseStatsPanel`](#tier-2-exports) and register it on a [`StatsPanelRegistry`](#stats-panel-registry); the facade routes filter changes, visualization stats, and viz-hover snippets to the matching panel for every column whose `DataType` your registration handles.

The registry is empty by default — when no registration matches a column's type, the library falls back to its built-in `formatDefaultStats` HTML rendering, so opt-in is granular. Source: `src/visualizations/BaseStatsPanel.ts`, `src/visualizations/StatsPanelRegistry.ts`, `src/visualizations/StatsPanelCoordinator.ts`. See also the [Stats panels guide](./guides/stats-panels.md) and runnable [`examples/13-custom-stats-panel/`](../examples/13-custom-stats-panel/).

### Registry

```ts
class StatsPanelRegistry {
  register(registration: StatsPanelRegistration): void;
  unregister(name: string): boolean;
  create(
    container: HTMLElement,
    column: ColumnSchema,
    options: StatsPanelOptions,
  ): BaseStatsPanel | null;
  isApplicable(column: ColumnSchema): boolean;
  getRegisteredTypes(): string[];
  resetToDefaults(): void; // empties the registry (no library built-ins)
}

interface StatsPanelRegistration {
  name: string; // stable identifier; same-name re-register replaces
  isApplicable: (type: DataType) => boolean;
  constructor: StatsPanelConstructor;
  priority: number; // higher wins on multi-match
}

type StatsPanelConstructor = new (
  container: HTMLElement,
  column: ColumnSchema,
  options: StatsPanelOptions,
) => BaseStatsPanel;
```

Pass via `createDataTable({ statsPanelRegistry })`; or register on the module-scoped `defaultStatsPanelRegistry` to share across every table that doesn't pass a per-instance registry. To restrict a panel to a specific column **name** rather than a `DataType`, subclass `StatsPanelRegistry` and override `create()` (same pattern as `examples/08-custom-visualization`'s `StateAwareRegistry`).

### Panel constructor and lifecycle

```ts
abstract class BaseStatsPanel {
  protected readonly container: HTMLElement;
  protected readonly column: ColumnSchema;
  protected options: StatsPanelOptions;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions);

  /**
   * Required. Receives `null` once on mount, then with each ColumnStatsData
   * the column's visualization emits (and on data reload). Columns without
   * a visualization receive `update(null)` only.
   */
  abstract update(stats: ColumnStatsData | null): void;

  /**
   * Optional. Default no-op. Receives the visualization's hover snippet as
   * an HTML string (the same pre-formatted markup the library's built-in
   * panel renders in place of line 2), or `null` to clear. The bundled
   * Histogram / ValueCounts visualizations escape every user-derived value
   * before producing this string; custom visualizations are responsible
   * for escaping before passing text to onStatsChange.
   */
  setHoverStats(html: string | null): void;

  /**
   * Optional. Default refreshes `this.options.filters` only. Override to
   * issue your own DuckDB queries via `this.options.bridge` whenever the
   * active filter array changes. The library guarantees `update(stats)`
   * separately on viz refetch, so panels that only re-render existing
   * stats need not override.
   */
  async updateFilters(filters: Filter[]): Promise<void>;

  /**
   * Required (override). Subclasses must clear any DOM nodes they appended
   * to `container`, drop any subscriptions, then call `super.destroy()`.
   * The library calls `destroy()` exactly once on its own teardown path
   * (schema change, table destroy). Panels MUST NOT call `destroy()` on
   * themselves — the library tracks active panels in a name-keyed map and
   * a self-destroy leaves a dangling registration whose `.dt-col-stats`
   * slot is no longer eligible for fallback rendering.
   */
  destroy(): void;

  /** Accessors */
  isDestroyed(): boolean;
  getColumn(): ColumnSchema;
}
```

### Lifecycle ordering guarantees

Quoted from `src/visualizations/BaseStatsPanel.ts:108-127`:

- The constructor is called with an empty `container` element (the `.dt-col-stats` slot inside a column header).
- `update(null)` fires once on mount, then with each `ColumnStatsData` the visualization for this column emits (and on data reload). Columns without a visualization receive `update(null)` only.
- `updateFilters(filters)` fires every time the table's active filter array changes, before any subsequent `update(stats)` call from a viz refetch.
- `setHoverStats(html | null)` fires when the column's visualization emits a hover snippet (and again with `null` to clear). Columns without a viz never trigger this.
- `destroy()` is called exactly once, before the container is reused for a freshly-constructed panel (e.g. on a schema change).

### Options and error surface

```ts
interface StatsPanelOptions {
  tableName: string; // DuckDB table name the panel can query
  bridge: WorkerBridge; // run your own SELECTs against the worker
  filters: Filter[]; // refreshed on each updateFilters call
  messages: Strings; // resolved i18n strings for any text the panel renders
  onError?: (error: DataTableError, context: StatsPanelErrorContext) => void;
}

interface StatsPanelErrorContext {
  source: 'stats-panel';
  column: string;
  phase: 'construct' | 'update' | 'hover' | 'fetch' | 'destroy';
}
```

The facade re-emits any error routed through `options.onError(...)` on its `error` event with `source: 'stats-panel'` (see [Event catalog](#event-catalog)). The library's [`StatsPanelCoordinator`](#tier-2-exports) deliberately swallows per-panel `updateFilters` rejections so one panel's failure can't cascade across columns; surfacing those errors is the panel's responsibility.

### Filter-aware queries — the canonical pattern

Build a `WHERE` clause with [`filtersToWhereClause`](#sql-authoring-helpers) and quote identifiers with [`quoteIdentifier`](#sql-authoring-helpers). Use a per-panel `fetchSeq` counter to drop stale results that resolve out of order — the coordinator's own `filterSequence` guards the broadcast side, but a panel that has its own per-call awaits still needs a local counter. See [troubleshooting §21](./troubleshooting.md#21-stats-panel-renders-stale-data-after-a-fast-filter-change) for the full pattern.

```ts
private fetchSeq = 0;

async updateFilters(filters: Filter[]): Promise<void> {
  await super.updateFilters(filters);                         // refresh this.options.filters
  await this.fetch();
}

private async fetch(): Promise<void> {
  if (this.isDestroyed()) return;
  const seq = ++this.fetchSeq;
  const colId = quoteIdentifier(this.column.name);
  const tableId = quoteIdentifier(this.options.tableName);
  const where = filtersToWhereClause(this.options.filters);
  const sql = `SELECT AVG(${colId}) m, STDDEV_POP(${colId}) s
               FROM ${tableId} ${where ? 'WHERE ' + where : ''}`;
  try {
    const [row] = await this.options.bridge.query<{ m: number; s: number }>(sql);
    if (this.isDestroyed() || seq !== this.fetchSeq) return;  // dropped
    this.paint(row);
  } catch (err) {
    this.options.onError?.(
      new QueryError(err instanceof Error ? err.message : String(err), {
        code: 'QUERY_RUNTIME', cause: err,
      }),
      { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
    );
  }
}
```

---

## SQL editor primitives

Building blocks for assembling a CodeMirror SQL editor _outside_ the data
table — for filter-preset composers, derived-column wizards, query-template
forms, etc. The helpers ship the same DuckDB SQL grammar, schema- and
function-aware autocomplete source, and theme that the bundled
[`CodeMirrorExpressionEditor`](#tier-2-exports) uses internally; the
host owns layout, sizing, keymap, and the autocompletion UI surface.

Re-exported from `@jeyabbalas/data-table/advanced`. Source:
`src/sql-editor/extensions.ts`, `src/sql-editor/duckdbFunctionDetails.ts`,
`src/sql-editor/theme.ts`. See also the [SQL editor primitives
guide](./guides/sql-editor-primitives.md) and runnable
[`examples/14-standalone-sql-editor/`](../examples/14-standalone-sql-editor/).

Two intended paths: **live-schema**, paired with a `DataTable` via
[`actions.getCompletionContext()`](#actions-methods) plus
`Compartment.reconfigure()` on `loadComplete` / `derivedChange`; and
**literal-schema**, with an ad-hoc `[{name, type}, …]` array fed through
`buildCompletionContext` once.

### `createSqlExtensions(context, options?)`

```ts
function createSqlExtensions(
  context: CompletionContext,
  options?: SqlExtensionOptions,
): Extension[];
```

Returns a CodeMirror `Extension[]` containing the PostgreSQL grammar, the
schema/function autocomplete _source_ (a `PostgreSQL.language.data.of({
autocomplete: ... })` extension), and — when `includeTheme` is left at its
default `true` — `dataTableTheme` and `dataTableHighlighting`. Drop it
into any `EditorState.create({ extensions })` alongside whatever other
extensions the host wants (`keymap`, `placeholder`, sizing, gutters).

**The returned array does not include `autocompletion()`.** The helper
ships the autocomplete source (the language-data facet); the autocomplete
UI is the host's responsibility. Without `autocompletion()` from
`@codemirror/autocomplete` in your extension array, no dropdown ever
appears (`src/sql-editor/extensions.ts:156-158`). The bundled
`CodeMirrorExpressionEditor` adds it explicitly
(`src/sql-editor/CodeMirrorExpressionEditor.ts:60-62`).

Wrap the result in a `Compartment` to enable schema swaps via
`Compartment.reconfigure()` without rebuilding the editor — preserves undo
history, focus, selection, and scroll position. The bundled
`CodeMirrorExpressionEditor` uses the same pattern internally
(`src/sql-editor/CodeMirrorExpressionEditor.ts:142-148`).

### `buildCompletionContext(columns, options?)`

```ts
function buildCompletionContext(
  columns: ReadonlyArray<{
    name: string;
    type?: string | null;
    originalType?: string | null;
    isDerived?: boolean | null;
  }>,
  options?: { functions?: readonly string[] },
): CompletionContext;
```

Tiny shape-normalizer for the literal-schema path. Accepts inputs as terse
as `[{name: 'foo'}]` or as full as a `ColumnSchema[]`. When both
`originalType` and `type` are present, `originalType` wins (matches the
data-table's internal behavior). Unknown types fall back to an empty
string. `isDerived` defaults to `false`. The
[`CompletionContext`](#derived-columns) type the helper produces is the
same one [`actions.getCompletionContext()`](#actions-methods) returns —
they are interchangeable inputs to `createSqlExtensions`.

System columns are **not** filtered automatically. If your column array
came from `actions.tableSchema` or any raw source, filter
`name === '__rowid__'` before passing it in — `actions.getCompletionContext()`
already filters the synthetic id, but `buildCompletionContext` does not.

### `SqlExtensionOptions`

```ts
interface SqlExtensionOptions {
  includeTheme?: boolean; // default true
  functions?: readonly DuckDBFunctionInfo[] | readonly string[];
  upperCaseKeywords?: boolean; // default true
}
```

| Field               | Default     | Effect                                                                                                                                                                                                                                  |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeTheme`      | `true`      | Append `dataTableTheme` + `dataTableHighlighting`. Set `false` if the host owns presentation, or wants to add the theme outside the `Compartment` so it survives reconfiguration without flicker (the pattern the bundled editor uses). |
| `functions`         | `undefined` | Override the function autocomplete list. See **Function-list precedence** below.                                                                                                                                                        |
| `upperCaseKeywords` | `true`      | Format SQL keywords as uppercase. Matches DuckDB's preferred style and the bundled `CodeMirrorExpressionEditor`.                                                                                                                        |

### Function-list precedence

Resolution order (`src/sql-editor/extensions.ts:140-142`):

1. `options.functions` (if not `undefined`)
2. `context.functions` (if not `undefined`)
3. `DUCKDB_FUNCTION_DETAILS` (built-in fallback)

`undefined` falls through; `[]` (empty array) does **not** fall through —
it disables function autocomplete entirely. The helper uses `??`, which
only treats `null` / `undefined` as missing.

Shape detection runs once on the resolved list, looking at the first
element (`src/sql-editor/extensions.ts:185-198`):

| Shape                  | Completion fields produced                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `DuckDBFunctionInfo[]` | `label` = `name`, `detail` = `category`, `info` = `description`, `type: 'function'`, `boost: -1` |
| `string[]`             | `label` = name, `type: 'function'`, `boost: -1` (no `detail` / `info`)                           |

Mixed arrays are not supported — pass either rich objects or plain names,
not both. Column completions use `type: 'variable'`, `detail` = the
column's DuckDB type, `boost: 0` (so columns rank above functions in the
dropdown).

### `DUCKDB_FUNCTION_DETAILS` and types

```ts
interface DuckDBFunctionInfo {
  name: string; // lowercase, matches DuckDB resolution
  category: DuckDBFunctionCategory;
  description: string;
}

type DuckDBFunctionCategory =
  | 'aggregate'
  | 'numeric'
  | 'string'
  | 'date/time'
  | 'casting'
  | 'conditional'
  | 'list'
  | 'struct'
  | 'window'
  | 'utility';

const DUCKDB_FUNCTION_DETAILS: readonly DuckDBFunctionInfo[]; // 176 entries
const DUCKDB_FUNCTIONS: readonly string[]; // names-only, derived
```

`DUCKDB_FUNCTION_DETAILS` is the curated list used as the built-in
fallback — `Object.freeze`-d at array level and entry level so consumers
cannot mutate it accidentally. `DUCKDB_FUNCTIONS` is now derived from
`DUCKDB_FUNCTION_DETAILS.map((f) => f.name)`, so the two cannot drift; pass
the constant to `options.functions` for a fixed names-only surface.

### `dataTableTheme`, `dataTableHighlighting`

The CodeMirror theme and `HighlightStyle` the bundled
`CodeMirrorExpressionEditor` uses, re-exported for hosts that opt out of
`includeTheme` and want to apply the theme separately — for example,
outside a `Compartment` so it survives schema reconfiguration without
flicker. Both reference `--dt-*` CSS variables (`--dt-bg`, `--dt-border`,
`--dt-primary`, `--dt-text`, `--dt-syntax-string`, `--dt-syntax-type`,
…), so the editor automatically follows the table's color scheme. Source:
`src/sql-editor/theme.ts`.

### Live-schema vs literal-schema usage

Walk-through prose with full code blocks lives in the [SQL editor
primitives guide](./guides/sql-editor-primitives.md). The short version:

- **Live-schema** — call
  `() => table.actions.getCompletionContext()` as a thunk (not a snapshot)
  so subsequent refreshes see the latest schema; wrap
  `createSqlExtensions(...)` in a `Compartment`; subscribe to
  `loadComplete` and `derivedChange` and call
  `compartment.reconfigure(createSqlExtensions(getContext()))` from each.
- **Literal-schema** — call `buildCompletionContext([{name, type}, …])`
  once and feed it through `createSqlExtensions(ctx)`. Refresh by
  rebuilding the context and dispatching a `reconfigure` if your schema
  source changes.

For the in-table case (the SQL filter modal, the derived-column expression
input), use [`CodeMirrorExpressionEditor`](#tier-2-exports) — it wraps
exactly these primitives and adds the autocompletion UI, keymap, history,
and theme bookkeeping for you.

---

## Column-header tooltip content

Source: `src/core/types.ts`, `src/core/columnHeaderTooltip.ts`. Set / clear via the [`Column-header tooltips` action](#column-header-tooltips); see also the [Column-header tooltips guide](./guides/column-header-tooltips.md).

```ts
interface ColumnHeaderTooltipContent {
  /** Optional bold heading. */
  title?: string;
  /** Optional free-text body. Whitespace is preserved (`white-space: pre-wrap`). */
  description?: string;
  /** Optional label/value rows. */
  items?: ColumnHeaderTooltipItem[];
}

interface ColumnHeaderTooltipItem {
  label: string;
  /** `string` renders inline; `string[]` renders as wrapping enum chips. */
  value: string | string[];
}
```

### Input shorthand

| Input                                       | Effect                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `string`                                    | Normalised to `{ description: <input> }`.                         |
| `ColumnHeaderTooltipContent`                | Validated field-by-field; malformed `items` are dropped silently. |
| `null`                                      | Removes the override.                                             |
| Empty after normalisation (e.g. `{}`, `''`) | Removes the override.                                             |

### XSS safety

Every text field — `title`, `description`, `items[].label`, and `items[].value` (string or each chip in `string[]`) — is rendered via `.textContent`. The setter does not accept HTML strings, DOM nodes, or render functions. This eliminates the XSS surface by construction. See [`examples/12-column-header-tooltips/`](../examples/12-column-header-tooltips/) for a live demonstration including an "inject HTML" button that renders the literal string instead of parsing it.

### Persistence

Tooltip overrides are persisted into `SessionSnapshot.columnHeaderTooltips` and restored on subsequent loads. Legacy string entries from in-flight sessions are normalised to `{ description }` on restore. To opt out (recommended when the embedding app already owns its column registry), pass `persistence: false` to `createDataTable` and re-apply tooltips on every mount.

---

## Annotation JSON format

Round-tripped via [`table.annotations.toJSON()`](#tableannotations-namespace) / `loadJSON()`. Source: `src/annotations/types.ts`. Current `ANNOTATION_FILE_VERSION` is `1`.

### Top-level

```ts
interface AnnotationFile {
  version: 1; // required; loadJSON refuses files with version > current
  tableName?: string; // set by toJSON from the owning table
  createdAt?: string; // ISO 8601, set by toJSON
  updatedAt?: string; // ISO 8601, updated on every change
  annotations: Annotation[]; // required
  [unknownField: string]: unknown; // unknown top-level fields are preserved verbatim
}
```

### Per-annotation

Discriminated by `scope`. All shapes share the base fields:

```ts
interface AnnotationBase {
  id: string; // ann_ + 26-char Crockford base32 (auto-generated if missing)
  severity: 'error' | 'warning' | 'info';
  message: string; // plain text (no HTML)
  code?: string; // app-defined error code (e.g. 'JSON_SCHEMA_MAXIMUM')
  source?: string; // app-defined origin tag
  metadata?: Record<string, unknown>; // app-defined extras; round-tripped as-is
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  [unknownField: string]: unknown; // per-annotation unknown fields preserved verbatim
}

type RowAnnotation = AnnotationBase & { scope: 'row'; rowId: number };
type ColumnAnnotation = AnnotationBase & { scope: 'column'; column: string };
type CellAnnotation = AnnotationBase & { scope: 'cell'; rowId: number; column: string };

type Annotation = RowAnnotation | ColumnAnnotation | CellAnnotation;
```

### Sample file

```json
{
  "version": 1,
  "tableName": "source",
  "createdAt": "2026-04-23T12:34:56.789Z",
  "updatedAt": "2026-04-23T12:35:10.123Z",
  "annotations": [
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWX",
      "scope": "cell",
      "rowId": 42,
      "column": "age",
      "severity": "error",
      "message": "Value 200 exceeds maximum allowed 150",
      "code": "JSON_SCHEMA_MAXIMUM",
      "source": "harmonization-validator",
      "metadata": { "keyword": "maximum", "expected": 150, "actual": 200 },
      "createdAt": "2026-04-23T12:34:56.789Z"
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWY",
      "scope": "row",
      "rowId": 10,
      "severity": "warning",
      "message": "Row violates dependency on (lastName, firstName, dob)"
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWZ",
      "scope": "column",
      "column": "id",
      "severity": "error",
      "message": "Column violates uniqueness constraint"
    }
  ]
}
```

### Round-trip rules

- Unknown top-level and per-annotation fields are preserved verbatim across `toJSON` → `loadJSON`. Apps can store auxiliary data (tracking ids, reviewer notes) without negotiating schema changes with the library.
- `id` round-trips. If a caller supplies an `id` to `add`, it is preserved; if not, the library generates `ann_` + 26-char Crockford base32.
- The library writes `tableName` and `updatedAt` on every `toJSON` call; consumers may overwrite both before downloading the file.

For semantics of the in-memory store and the rendering layer, see the [annotations guide](./guides/annotations.md).

---

## Serialization helpers

| Symbol                          | Signature                              | Purpose                                                                     |
| ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `serializeFilter(filter)`       | `(Filter) => SerializedFilter`         | Replaces `Date` with `{ __date__: ISO string }` so the filter is JSON-safe. |
| `deserializeFilter(serialized)` | `(SerializedFilter) => Filter \| null` | Returns `null` for unknown types (e.g., after a schema version bump).       |

### `SessionStore`

Source: `src/persistence/SessionStore.ts`.

| Method     | Signature                                                 | Notes                                        |
| ---------- | --------------------------------------------------------- | -------------------------------------------- |
| `open`     | `() => Promise<boolean>`                                  | Returns `false` if IndexedDB is unavailable. |
| `save`     | `(snapshot: SessionSnapshot) => Promise<void>`            |                                              |
| `saveSync` | `(snapshot: SessionSnapshot) => void`                     | For page lifecycle handlers (`pagehide`).    |
| `load`     | `(tableName: string) => Promise<SessionSnapshot \| null>` |                                              |
| `delete`   | `(tableName: string) => Promise<void>`                    |                                              |
| `list`     | `() => Promise<string[]>`                                 | All stored table names.                      |
| `close`    | `() => void`                                              | Close the DB connection and reset state.     |

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

| Probe             | Needed for                                              |
| ----------------- | ------------------------------------------------------- |
| `Worker`          | DuckDB runs in a dedicated worker.                      |
| `WebAssembly`     | DuckDB is Wasm-compiled.                                |
| `IndexedDB`       | Session persistence.                                    |
| `ResizeObserver`  | Column resize + visualization responsive layout.        |
| `BigInt`          | DuckDB integer columns cross worker boundary as BigInt. |
| `structuredClone` | Worker bridge snapshots result sets.                    |

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
    export: { title: 'Exporter', downloadButton: 'Télécharger' },
  },
});
```

Messages are resolved once at `createDataTable()` time and threaded to every component. Recreate the table to switch languages at runtime.

**Scope.** `messages` controls every string the library renders itself — labels, buttons, tooltips, aria-text, and stats-line templates. Out of scope: number and date formatting use the browser's host locale via `.toLocaleString()` (independent of `messages`), cell content comes from your data, and right-to-left layouts are not supported today. See `examples/07-i18n-french/` for a fully worked French translation.
