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

| Symbol                       | Kind         | Purpose                                                                                                                                                                                                                     |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataType`                   | type         | `'integer' \| 'float' \| 'decimal' \| 'string' \| 'boolean' \| 'uuid' \| 'date' \| 'timestamp' \| 'time' \| 'interval' \| 'nested'`. `'nested'` is a LIST, ARRAY, STRUCT, MAP, UNION or VARIANT column; JSON is `'string'`. |
| `ColumnSchema`               | interface    | `{ name, type, nullable, originalType, system?: boolean }`. `originalType` is the DuckDB type as `DESCRIBE` prints it (`STRUCT(x DOUBLE, y DOUBLE)`). `system: true` marks library-injected columns (notably `__rowid__`).  |
| `Filter`                     | type         | Discriminated union of 7 filter shapes.                                                                                                                                                                                     |
| `FilterType`                 | type         | `Filter['type']`.                                                                                                                                                                                                           |
| `SortColumn`                 | interface    | `{ column: string; direction: SortDirection }`.                                                                                                                                                                             |
| `SortDirection`              | type         | `'asc' \| 'desc'`.                                                                                                                                                                                                          |
| `RowId`                      | type         | Alias for `bigint`: a `__rowid__` value, as `getColumnValues('__rowid__')` returns them in a `BigInt64Array`. The annotation API takes a `number` rowId; `getCellValue` takes either.                                       |
| `ROWID_COLUMN`               | const string | The literal `'__rowid__'`. The reserved system-column name; sources containing it reject with `LoadError('RESERVED_COLUMN_NAME')`.                                                                                          |
| `GetColumnValuesOptions`     | type         | Options for `actions.getColumnValues` — `{ scope?: 'all' \| 'filtered' \| 'selected'; limit?: number; offset?: number; signal?: AbortSignal }`.                                                                             |
| `GetCellValueOptions`        | type         | Options for `actions.getCellValue` — `{ signal?: AbortSignal }`. Aborting rejects with `QueryError` `QUERY_ABORTED`.                                                                                                        |
| `ColumnHeaderTooltipContent` | interface    | Structured popover content — `{ title?, description?, items? }`. See [Column-header tooltip content](#column-header-tooltip-content).                                                                                       |
| `ColumnHeaderTooltipItem`    | interface    | `{ label: string; value: string \| string[] }`. `string[]` renders as wrapping enum chips.                                                                                                                                  |

A nested column's values, and what the grid, filters, exports and charts do with them, are covered in [Nested and JSON columns](./guides/loading-data.md#nested-and-json-columns).

### Filter shapes

See [Filter types](#filter-types) for full fields. Union members: `RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`, `RawSQLFilter`.

### SQL authoring helpers

| Symbol                 | Signature                                               | Purpose                                                                                           |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `quoteIdentifier`      | `(name: string) => string`                              | Quote a column/table identifier for DuckDB.                                                       |
| `formatSQLValue`       | `(value: unknown) => string`                            | Format a JS value as a DuckDB literal.                                                            |
| `filtersToWhereClause` | `(filters: Filter[], excludeColumn?: string) => string` | The `WHERE` clause (without the keyword) of a filter list, as the table builds it; `''` for none. |

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

| Symbol                | Kind      | Purpose                                                                                                                                                                                                                                                                |
| --------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkerBridge`        | class     | DuckDB worker bridge; owns the worker and query cache; `query(sql, signal?, options?)` accepts per-query `QueryOptions` (cache bypass, priority); exposes `dropTable()` for ad-hoc table cleanup.                                                                      |
| `LoadOptions`         | interface | `WorkerBridge.loadData` options: `format`, `tableName`, and the fields of `SourceOptions`.                                                                                                                                                                             |
| `SourceOptions`       | interface | How a source is read, per format: `timezone`, and the entries `csv` (`CSVSourceOptions`), `json` (`JSONSourceOptions`) and `parquet` (`ParquetSourceOptions`). A load reads its format's entry. See [loading data](./guides/loading-data.md#how-a-source-is-read).     |
| `WorkerBridgeOptions` | interface | `workerFactory`, `workerUrl`, `duckdbBundles`, `initializeTimeoutMs`.                                                                                                                                                                                                  |
| `QueryOptions`        | interface | Per-query options for `WorkerBridge.query` — `{ cache?: boolean; priority?: 'high' \| 'elevated' \| 'normal' }`. `cache: false` bypasses both the read and the write of the SQL result cache; `priority` is the query's place in the worker's queue (below the table). |
| `DataFormat`          | type      | `'csv' \| 'json' \| 'parquet'`.                                                                                                                                                                                                                                        |
| `LoadResult`          | interface | `{ tableName, rowCount, schema }` returned by the bridge.                                                                                                                                                                                                              |

`QueryOptions.priority` places a query in the worker's serial dispatch queue, which runs one query at a time: the queued `'high'` queries first, then the `'elevated'`, then the `'normal'`, each level in the order posted. `'high'` is for viewport row fetches, the rows the grid is waiting to show; `'elevated'` for an interactive read of a few values that someone is waiting on, as `actions.getCellValue` and the value inspector's read of one cell are, which runs ahead of queued chart and stats queries and behind the row fetches; `'normal'`, the default, for background work such as charts, stats, prefetches and exports. A query already running is never interrupted by one of higher priority.

`WorkerBridge.query` returns each row as a plain object whose own properties are its columns, `__proto__` included, as Arrow carries the values (`src/data/WorkerBridge.ts`, `src/worker/duckdb.ts`). Integers arrive as numbers, the nearest one past 2^53, and a `HUGEINT` or `UHUGEINT` column's value can arrive with the wrong sign at the edges (a `UHUGEINT` past 2^127 negative, the `HUGEINT` minimum positive); a LIST or ARRAY value as an array; a STRUCT or MAP value as an object, every field or key an own property (`size`, `toJSON` and `__proto__` included), and an unnamed STRUCT, as `row(1, 'a')` builds, as an array; a BLOB as a `Uint8Array`; a `DATE` or `TIMESTAMP`, of any precision and with or without a zone, as epoch milliseconds, a timestamp's digits past the millisecond as a fraction, DuckDB's `infinity` and `-infinity` as `Infinity` and `-Infinity`, and one past ±2^53 ms (after year 287396 or before 283458 BC) as the nearest number. Arrow loses some values on the way. A `DECIMAL`, `HUGEINT` or `UHUGEINT` in a LIST, ARRAY or STRUCT reads as a meaningless number (`[1.25, 2.50, 3.75]` as `[6.2e-322, 0, 1.235e-321]`, `[-12::HUGEINT]` as `[NaN]`), and anywhere under a MAP or a UNION as a `Uint32Array` of its unscaled integer's 32-bit words, low first (`MAP {'a': 1.25}` as `{ a: Uint32Array [125, 0, 0, 0] }`), and a MAP key as that integer's digits (`'125'`). An `INTERVAL`, nested or not, reads as an `Int32Array` that does not hold it, and a MAP key as that array's text (`'0,0'`). Inside a STRUCT, MAP or UNION, Arrow reads a date or timestamp itself and gets DuckDB's `infinity` wrong: a `TIMESTAMP`'s fails the read (`9223372036854775 is not safe to convert to a number`), as does a `TIMESTAMP` past ±2^53 ms, and a `DATE`'s reads as `185542587100800000`. A VARIANT, or a value that holds one, cannot be selected at all (`Unsupported Arrow type VARIANT`). Select a nested column as `CAST(to_json(c) AS VARCHAR)`, which is exact, unless it is or holds a VARIANT: `to_json` writes a VARIANT as a string (`to_json([42::VARIANT])` is `["42"]`), and on some types holding one fails with an INTERNAL error that invalidates the database. Select a VARIANT as `CAST(c AS JSON)` (a NULL then reads as the text `null`) and a type holding one as `CAST(CAST(c AS VARIANT) AS JSON)`, as the library does (`jsonValueSQL`, `src/data/valueSql.ts`), or read the values with [`getCellValue` / `getColumnValues`](#column-values-read-only-export). The worker's cancellable query path receives no ENUM values, so a result holding an `ENUM`, at any depth, is computed a second time, on the DuckDB query path that carries them, when the SQL is a single query (a `SELECT`, `WITH`, `FROM` or `VALUES` query) that does not name `nextval`. That read cannot be cancelled: an abort still rejects the promise at once, but the worker finishes the read before its next query. Anything else runs once, and its ENUM values arrive as `null`: an `INSERT`, `UPDATE` or `DELETE … RETURNING`, several statements in one text, and a query that calls `nextval`, whose sequence a second run would advance again. A `nextval` called through a view or a macro is not seen, and advances its sequence twice. The check, a `DESCRIBE` of the SQL, fails to parse for anything but a query, and duckdb-wasm logs that failure in the browser console as a `Parser Error`. `CAST(e AS VARCHAR)` reads an ENUM's text in one run, in any statement.

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

| Symbol                     | Kind      | Purpose                                                                                                                                         |
| -------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DerivedColumnKind`        | type      | `'expression' \| 'vector'`.                                                                                                                     |
| `VectorDataType`           | type      | Supported vector types (see [Derived columns](#derived-columns)).                                                                               |
| `ExpressionColumnDef`      | interface | `{ kind: 'expression', name, expression }`.                                                                                                     |
| `VectorColumnDef`          | interface | `{ kind: 'vector', name, vectorType, values }`.                                                                                                 |
| `DerivedColumnDef`         | type      | Union of the two.                                                                                                                               |
| `CompletionContext`        | interface | Schema + function list passed to expression editors.                                                                                            |
| `ExpressionEditor`         | type      | Editor contract (`getValue`, `setValue`, `focus`, `destroy`, …).                                                                                |
| `ExpressionEditorConfig`   | interface | `{ placeholder?, ariaLabel? }`: the placeholder and accessible name a dialog gives its expression editor, from `messages`.                      |
| `ExpressionEditorFactory`  | type      | `(container, context, config) => ExpressionEditor`. `config` is the dialog's placeholder and accessible name.                                   |
| `NestedFieldColumnOptions` | interface | `{ name?, extract?: 'value' \| 'length' \| 'tag', jsonLeaf?: 'string' \| 'number' \| 'boolean' \| 'json' }` for `actions.addNestedFieldColumn`. |

### Progress

| Symbol             | Kind | Purpose                                                                                                                    |
| ------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `ProgressInfo`     | type | `{ stage, percent, cancelable, loaded?, total?, estimatedRemaining? }`; `percent` runs 0–100.                              |
| `ProgressCallback` | type | `(info: ProgressInfo) => void`.                                                                                            |
| `ProgressStage`    | type | `'reading' \| 'parsing' \| 'indexing' \| 'analyzing'`. A load sends the first three; `analyzing` is declared but not sent. |

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

Exported from `@jeyabbalas/data-table/advanced`. Source: `src/advanced.ts`. Reach into these only when the facade doesn't expose what you need — see [When to use `/advanced`](../AGENTS.md#6-when-to-use-advanced).

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
| `TableContainer`                    | class          | Main DOM container that composes every UI piece. `announce(message)` speaks a transient message through its second polite live region. `openValueInspector` and `extractColumn` open the value inspector and add an extracted column; see below the table.                                                                       |
| `TableContainerOptions`             | interface      | Ctor options (rowHeight, headerHeight, classPrefix, instanceId, colorScheme, messages, extractColumns, onError, …).                                                                                                                                                                                                              |
| `ResizeCallback`                    | type           | `(rect: DOMRect) => void` for resize observers.                                                                                                                                                                                                                                                                                  |
| `ColumnHeader`                      | class          | Renders a single column header cell (label, stats, viz canvas). See [Column layout mode](#column-layout-mode-shiftf2) for its keyboard width API.                                                                                                                                                                                |
| `ColumnHeaderOptions`               | interface      | Header ctor options. `announce?: (message: string) => void` writes to the transient live region (used to announce the width at the end of a resize drag).                                                                                                                                                                        |
| `VirtualScroller`                   | class          | Virtual row windowing for large datasets. Caps the physical spacer at 15,000,000 px and maps physical scroll positions into virtual ones above the cap; `getVirtualScrollTop()` is the virtual-space counterpart of `getScrollTop()`, identical below the cap.                                                                   |
| `VirtualScrollerOptions`            | interface      | Scroller ctor options. `maxVirtualHeight` caps the physical spacer height (default 15,000,000 px) — primarily a test hook; raising it past ~17.8M px breaks Firefox, which saturates element heights at ≈17,895,697 px. `/advanced` only: `TableBody` does not forward it, so it is not reachable via `createDataTable`.         |
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

`TableContainer` (reach the table's own as `table.container`) also carries the nested-column entry points:

- `openValueInspector({ row, column })` opens the [value inspector](./guides/loading-data.md#the-value-inspector) on a body cell, `row` being its 0-based position in the sorted, filtered view. It works on a row the grid has rendered, in or near the view, that holds a non-NULL value of a nested or JSON column, and returns `false` for any other cell. The panel opens a microtask later, and the first time once its chunk has loaded; an open still waiting is dropped when the user goes on meanwhile: another panel opening, the cursor moving off the cell, a filter, sort, selection or table change, or, when focus was in the table, focus leaving it, so a `true` can still open nothing. From code the cursor need not be on the cell, but a cursor move in the same task drops the open.
- `extractColumn(request)` adds a column as the extract panel and the inspector's "Add as column" do: `request` is `NestedFieldColumnOptions & { column, path, row? }`, and it resolves what `actions.addNestedFieldColumn` resolves, `{ success, name?, error? }`. On success the cursor moves to the new column, on `row` when given or else on its header, the view scrolls to it, its header flashes and the live region says "Column point_x added"; a failure is announced when no panel is open to show it. The same request (column, path, options and name) while one is still running gets that one's promise, and adds no second column. When the panel that asked was closed before the add landed, the column is still announced, but the cursor, the view and focus stay where they are.
- `TableContainerOptions.extractColumns` (default `true`) shows the extract button on nested and JSON column headers and the inspector's add buttons. `createDataTable` ties it to `derivedColumns`.
- `TableContainerOptions.onError(error)` hears of a failure nothing else reports: a panel that loads on first use, the value inspector or the extract panel, whose chunk did not download. `error` is a `ConfigurationError` with code `CHUNK_LOAD_FAILED`, `details.panel` (`'valueInspector'` or `'extractPanel'`) and the import's error as `cause`; the live region says `messages.values.panelLoadFailed` too. `createDataTable` emits it as the table's `error` event, with `source: 'unknown'`.

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
| `ColumnHeader.getWidth()`                    | method   | Current width in pixels, read from `columnWidths` (150 when unset; 168 for a nested or JSON column) rather than from layout.       |
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
| `DefaultExpressionEditor`                   | class       | Plain-textarea editor, an alternative to `CodeMirrorExpressionEditor` through `editorFactory`. Its 5th argument is an `ExpressionEditorConfig`.              |
| `DerivedColumnManager`                      | class       | DuckDB-side lifecycle (VIEW, vector helper tables, validation); every change is all or nothing. `restoreColumns` is below the table.                         |
| `DerivedColumnInfo`                         | interface   | Stored def + detected type metadata.                                                                                                                         |
| `CodeMirrorExpressionEditor`                | class       | CodeMirror 6 editor with DuckDB SQL grammar + autocompletion. Its 4th argument is an `ExpressionEditorConfig` (English `derived.*` defaults).                |
| `DUCKDB_FUNCTIONS`                          | const array | Function names surfaced by autocomplete. Derived from `DUCKDB_FUNCTION_DETAILS`.                                                                             |
| `DUCKDB_FUNCTION_DETAILS`                   | const array | `{ name, category, description }` for each curated DuckDB function.                                                                                          |
| `DuckDBFunctionInfo`                        | interface   | Shape of one entry in `DUCKDB_FUNCTION_DETAILS`.                                                                                                             |
| `DuckDBFunctionCategory`                    | union type  | `'aggregate' \| 'numeric' \| 'string' \| 'date/time' \| 'casting' \| 'conditional' \| 'list' \| 'struct' \| 'window' \| 'utility'`.                          |
| `createSqlExtensions(context, options?)`    | function    | Returns CodeMirror `Extension[]` (PostgreSQL grammar + schema/function autocomplete + optional theme) for host-built editors mounted outside the data table. |
| `buildCompletionContext(columns, options?)` | function    | Normalizes any column-like array (`ColumnSchema[]`, `[{name, type}, …]`) into a `CompletionContext`.                                                         |
| `SqlExtensionOptions`                       | interface   | `{ includeTheme?, functions?, upperCaseKeywords? }` accepted by `createSqlExtensions`.                                                                       |
| `dataTableTheme`                            | const       | CodeMirror theme using `--dt-*` CSS variables.                                                                                                               |
| `dataTableHighlighting`                     | const       | Syntax-highlighting colors that pair with `dataTableTheme`.                                                                                                  |

`DerivedColumnManager.restoreColumns(defs, columnNames?)` rebuilds saved definitions, as a session restore, an undo and a redo do. It skips, with a `console.warn`, each one that no longer binds, and each one named, ignoring ASCII letter case, as a column of `columnNames` (the table's own columns), as a column it restored before, or `__rowid__`: a `DerivedColumnError` coded `DUPLICATE_NAME`. Every change the manager makes is all or nothing: when the VIEW cannot be built for it, the derived columns and the VIEW stay as they were.

### Export (low-level)

| Symbol                                                  | Kind      | Purpose                                                                                                                     |
| ------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ExportDialog`                                          | class     | Modal dialog (format, scope, columns, download/copy).                                                                       |
| `ExportDialogOptions`                                   | interface | Dialog ctor options.                                                                                                        |
| `exportToCSV(tableName, opts, context, signal?)`        | function  | CSV text of a table, as `context` (filters, sort, selection, schema) says.                                                  |
| `exportFromState(state, bridge, opts?, signal?)`        | function  | CSV export straight from a live table.                                                                                      |
| `ExportOptions`                                         | interface | `{ scope, columns, includeHeaders, delimiter, nullValue }`.                                                                 |
| `exportToJSON(tableName, opts, context, signal?)`       | function  | JSON (array or NDJSON) text of a table.                                                                                     |
| `exportJSONFromState(state, bridge, opts?, signal?)`    | function  | JSON export from a live table.                                                                                              |
| `JSONExportOptions`                                     | interface | JSON-specific options.                                                                                                      |
| `exportToParquet(tableName, opts, context, signal?)`    | function  | Parquet bytes (`Uint8Array`) of a table.                                                                                    |
| `exportParquetFromState(state, bridge, opts?, signal?)` | function  | Parquet export from a live table.                                                                                           |
| `ParquetExportOptions`                                  | interface | Parquet-specific options.                                                                                                   |
| `copyToClipboard(data, format)`                         | function  | Write a string to the system clipboard as `'text'` or `'html'`.                                                             |
| `copyRowsToClipboard(rows, state, bridge)`              | function  | Copy rows (0-based positions in the sorted, filtered view) as TSV: a header row, then the visible columns in display order. |
| `ExportContext`                                         | type      | Shared context passed between export helpers.                                                                               |

CSV and the clipboard's TSV write a nested value (`type: 'nested'`) as standard JSON, `[56,3,91]` or `{"x":1.25,"tier":"bronze"}`: a MAP as an object in key order, a UNION as `{"tag":value}`, every digit kept, `NaN` and `±Infinity` as `null`. JSON export writes real arrays and objects, a MAP as an object keyed by each key's text, an unnamed struct as an array, an integer inside past 2^53 as a string of its digits. A `BIGINT`-family column of its own is read as numbers, as [`bridge.query`](#data-layer) reads them, in both: rounded past 2^53, and a `HUGEINT` or `UHUGEINT` with the wrong sign at its extremes. Take such a column from `getColumnValues`, or export it to Parquet, when its digits matter. Both read nested values as exact JSON text from DuckDB, write `INTERVAL`, `BLOB`, `BIT`, `GEOMETRY`, `BIGNUM`, `ENUM`, `TIME WITH TIME ZONE` and `TIME_NS` values as DuckDB's text (`14:05:06+05:30`, `03:04:05.123456789`), a `DECIMAL` as the double nearest its value (`0.35`, not `0.35000000000000003`), a JSON column's value as its text, and sort by value as the grid does. Dates and times are ISO 8601 text, every digit kept and trailing zeros dropped: JSON writes `"2024-01-02"`, `"03:04:05.5"` and `"2024-01-02T03:04:05.123456"`, and CSV and the clipboard put a space between date and time, `2024-01-02 03:04:05.123456`, so a `DATE` or `TIMESTAMP` is in the form spreadsheets read. A `TIMESTAMP WITH TIME ZONE` is written in UTC with `Z` (`2024-01-02T03:04:05.5Z`), whatever time zone the table loaded in, and some spreadsheets show it as text; a `TIMESTAMP` has no zone and is written without one, so JavaScript's `new Date()` reads it as local time. `infinity`, `-infinity` and dates before year 1 (`0044-03-15 (BC)`) are written as DuckDB writes them. Loaded back, ordinary values read as dates and times, but a column holding `infinity`, `'-infinity` (CSV's formula guard), a BC date or a five-digit year may load as text or another type, and DuckDB's JSON reader can read `infinity` as `1900-01-01`. Inside a nested value, dates and times are DuckDB's text (`["2024-01-02 03:04:05"]`), a `TIMESTAMP WITH TIME ZONE` in UTC with `+00`. `getColumnValues`, `getCellValue` and `bridge.query` still read a date or timestamp as epoch milliseconds. A CSV or JSON export is one string, so a large nested column (a `FLOAT[768]` value is some 15,000 characters of JSON) can pass the browser's string limit: export it to Parquet, which writes every column natively. See [Nested and JSON columns → Exporting](./guides/loading-data.md#exporting).

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

| Symbol                                                                 | Kind     | Purpose                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ColumnStatsData`                                                      | type     | Union of all stat-kind data shapes.                                                                                                                                                                                                            |
| `NumericColumnStats`                                                   | type     | Numeric stats: `min`, `max`, `median` and `distinctCount` of the finite values, and `nonFiniteCount`, the `NaN` and `±Infinity` values the chart leaves out, which line 2 ends with (`· 30 non-finite`).                                       |
| `CategoricalColumnStats`                                               | type     | Categorical stats (distinct count, top values, …).                                                                                                                                                                                             |
| `TemporalColumnStats`                                                  | type     | Date/timestamp stats: `min` and `max` of the dates the chart draws, as ISO text (`-000043-03-15T00:00:00.000Z` is 44 BC), and `nonFiniteCount`, the `infinity`, `-infinity` and far-off dates it leaves out (`· 2 non-finite`).                |
| `TimeColumnStats`                                                      | type     | TIME stats.                                                                                                                                                                                                                                    |
| `IntervalColumnStats`                                                  | type     | INTERVAL stats.                                                                                                                                                                                                                                |
| `NestedColumnStats`                                                    | type     | Stats of a `'nested'` column: `kind: 'nested'`, the row and null counts, and `outline`, the type summary line 2 shows (`x double · y double · tier varchar`). Field names come from the data file: escape `outline` before writing it as HTML. |
| `BaseColumnStats`                                                      | type     | Common fields: `totalRows`, `nonNullCount`, `nullCount`, `filteredTotalRows`.                                                                                                                                                                  |
| `statsKindForDataType(type)`                                           | function | Pick the stats kind for a `DataType`; `'nested'` gives `'nested'`.                                                                                                                                                                             |
| `formatStatValue(value)`                                               | function | Format a single numeric stat value.                                                                                                                                                                                                            |
| `formatCount(count)`                                                   | function | Locale-aware integer formatting.                                                                                                                                                                                                               |
| `formatDefaultStats(stats, type, messages?)`                           | function | Produce the two-line stats HTML shown in headers. For a nested column, line 2 is the escaped type summary.                                                                                                                                     |
| `fetchIntervalStats(table, column, filters, bridge, unfilteredTotal?)` | function | Compute an INTERVAL column's stats on demand, with its chart's stats SQL: the minimum, median and maximum of the rows the filters pass, on the chart's seconds scale (a month is 30.4375 days).                                                |

### Visualization internals

| Symbol                                                                                                                                                                             | Kind           | Purpose                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BaseVisualization`                                                                                                                                                                | abstract class | Base for canvas visualizations (subclass to add custom viz types).                                                                                                                                      |
| `VisualizationOptions`                                                                                                                                                             | interface      | Ctor options (`bridge`, `state`, `filters`, `classPrefix`, …).                                                                                                                                          |
| `Histogram`                                                                                                                                                                        | class          | Numeric histogram.                                                                                                                                                                                      |
| `DateHistogram`                                                                                                                                                                    | class          | Date/timestamp histogram.                                                                                                                                                                               |
| `TimeHistogram`                                                                                                                                                                    | class          | TIME histogram.                                                                                                                                                                                         |
| `IntervalHistogram`                                                                                                                                                                | class          | INTERVAL histogram.                                                                                                                                                                                     |
| `ValueCounts`                                                                                                                                                                      | class          | Categorical stacked-segment bar.                                                                                                                                                                        |
| `NestedSummaryVisualization`                                                                                                                                                       | class          | Summary bar of a `'nested'` column: its non-null and null shares and its type outline, read by ungrouped `COUNT(*), COUNT(c)` scans. No click-to-filter. The default registry's `nested-summary` entry. |
| `HistogramBin`, `HistogramData`, `DateHistogramBin`, `DateHistogramData`, `TimeInterval`, `TimeHistogramBin`, `TimeHistogramData`, `IntervalHistogramBin`, `IntervalHistogramData` | types          | Per-viz data shapes.                                                                                                                                                                                    |
| `CategorySegment`, `ValueCountsData`                                                                                                                                               | types          | Shapes for `ValueCounts`.                                                                                                                                                                               |
| `NestedSummaryData`                                                                                                                                                                | type           | `{ total, nonNullCount, filtered: { total, nonNullCount } \| null }`, the counts behind `NestedSummaryVisualization`.                                                                                   |
| `CrossfilterCoordinator`                                                                                                                                                           | class          | Broadcasts filter changes to registered visualizations.                                                                                                                                                 |
| `CrossfilterCoordinatorOptions`                                                                                                                                                    | interface      | `{ onFilterCycleComplete? }`, the constructor's last argument. `onFilterCycleComplete(filters)` runs once a filter cycle's row count has settled, unless a newer cycle has started.                     |
| `InteractionManager`                                                                                                                                                               | class          | LIFO Escape-key stack for brush/selection interactions.                                                                                                                                                 |
| `InteractiveVisualization`                                                                                                                                                         | type           | Interface implemented by visualizations participating in `InteractionManager`.                                                                                                                          |
| `isNumericType`, `isDateType`, `isTimeType`, `isCategoricalType`, `isIntervalType`, `isNestedType`, `needsVisualization`                                                           | functions      | `DataType` predicates. `isNestedType(type)` is `type === 'nested'`; `isCategoricalType` stays `string` / `boolean` / `uuid`, so nested columns are not categorical.                                     |

### DuckDB types

For code that looks inside a nested column's type, such as a custom chart, a stats panel or an extract picker of its own. Source: `src/core/duckdbType.ts`.

| Symbol                                                                 | Kind     | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseDuckDBType(text)`                                                | function | Read a type as `DESCRIBE` prints it (`ColumnSchema.originalType`) into a `DuckDBTypeNode` tree. Handles quoted, bare and unnamed struct fields, stacked suffixes (`INTEGER[2][]` is a list of 2-arrays) and multi-word names, in any case. Never throws: text it cannot read, or nesting past 256 levels, is an `unknown` node. Memoized; nodes are frozen. |
| `DuckDBTypeNode`                                                       | type     | Union of the node types below, discriminated by `kind`. Every node keeps its own type text in `sqlType`.                                                                                                                                                                                                                                                    |
| `DuckDBTypeKind`                                                       | type     | `'scalar' \| 'json' \| 'variant' \| 'list' \| 'array' \| 'struct' \| 'map' \| 'union' \| 'unknown'`.                                                                                                                                                                                                                                                        |
| `DuckDBScalarTypeNode`                                                 | type     | `{ kind: 'scalar', name, args, dataType }`: the upper-case name, its arguments (`DECIMAL(18,4)`), and the library's `DataType` for it.                                                                                                                                                                                                                      |
| `DuckDBListTypeNode`, `DuckDBArrayTypeNode`                            | types    | `{ element }`; an array also has its fixed `size`.                                                                                                                                                                                                                                                                                                          |
| `DuckDBStructTypeNode`, `DuckDBStructField`                            | types    | `{ fields: { name, type }[] }`; `name` is `null` for a field of an unnamed struct (`STRUCT(INTEGER, VARCHAR)`, what `row(1, 'a')` makes), and `''` for a field named with the empty string, which DuckDB writes as nothing after a named first field: `STRUCT(b BIGINT,  BIGINT)`.                                                                          |
| `DuckDBMapTypeNode`                                                    | type     | `{ key, value }`.                                                                                                                                                                                                                                                                                                                                           |
| `DuckDBUnionTypeNode`, `DuckDBUnionMember`                             | types    | `{ members: { tag, type }[] }`.                                                                                                                                                                                                                                                                                                                             |
| `DuckDBJsonTypeNode`, `DuckDBVariantTypeNode`, `DuckDBUnknownTypeNode` | types    | `JSON`, `VARIANT`, and a type the parser could not read.                                                                                                                                                                                                                                                                                                    |

```ts
import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const node = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
if (node.kind === 'struct') {
  node.fields.map((f) => f.name); // ['x', 'tags']
}
```

---

## `createDataTable`

```ts
function createDataTable(options: CreateDataTableOptions): Promise<DataTable>;
```

Source: `src/DataTable.ts`. Validates options, initializes a `WorkerBridge`, builds `TableState`/`StateActions`, mounts the UI into `options.container`, wires events/persistence/presets/undo-redo, and emits `ready`. Without `options.source` it then resolves. With it, it loads the source and resolves once that load is done: the data loaded, any saved session restored, and the first fetches of its rows and of the charts in view settled. Those fetches are awaited but not required: one that fails is logged, and the table resolves with placeholder rows or a blank chart.

If that load fails, the table first tears itself down, as `destroy()` would: its UI leaves `container`, which is ready for another `createDataTable`, and a worker or session store it created is closed. A `bridge` or `persistence.sessionStore` you passed in stays open, and the saved session is not written; a table the load finished creating in that bridge (it failed later, restoring the session, say) is dropped. Then the promise rejects with the load's error (a `DataTableError`, usually `LoadError`; see [troubleshooting](./troubleshooting.md)). The initial load's `loadStart` / `loadComplete` / `loadError` events fire before the promise settles, where no listener can see them; only `ready` is replayed to later subscribers. To observe the initial load, or to keep the table through a failed load, omit `source`, subscribe, then `await table.loadData(source, { tableName, sourceFormat, sourceOptions })`: `options.tableName`, `options.sourceFormat` and `options.sourceOptions` apply to `source` only, and a load without a `tableName` gets a generated one, so no saved session is restored.

---

## `CreateDataTableOptions`

Source: `src/DataTable.ts:133-367`.

### Mounting

| Field       | Type          | Required? | Default | Description                                                                                                                          |
| ----------- | ------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `container` | `HTMLElement` | yes       | —       | Element that will host the table. The library takes full ownership of its contents. Must have a bounded height — see the note below. |

A bounded container height is a performance requirement, not a style preference. The library appends a `height: 100%` root into `container` (`src/styles/02-shell.css:11-23`) and the virtual scroller sizes its render window from the `clientHeight` of the internal `.dt-body-scroll` viewport (`src/table/VirtualScroller.ts:347-390`) — `⌈clientHeight / rowHeight⌉ + 10` rows. When `container` is content-sized, that chain resolves to the height of the scroll spacer, which is `min(totalRows × rowHeight, 15,000,000 px)` (`src/table/VirtualScroller.ts:426-438`): the render window saturates at ~468,750 rows at the default 32 px row height instead of covering the whole dataset, and rows are fetched in block-aligned chunks (128 rows per block by default, at most 2 in flight — `src/table/TableBody.ts:943-1063`) rather than as a single unbounded query. That caps the damage without removing it: virtualization is defeated with no error and no warning. The degenerate opposite — a container that is zero-tall at mount — renders nothing and does log a one-shot `console.warn` (`src/table/TableContainer.ts:480-491`).

There is no `height`, `maxHeight`, or `autoHeight` option; sizing the element is the host page's job, and the library never writes styles onto it. The inverse holds for `rowHeight` / `headerHeight` below: those are options rather than CSS knobs, and the library publishes them as the `--dt-row-height` / `--dt-header-height` custom properties on its own root, so overriding those tokens in a stylesheet has no effect. Selector strings are not accepted — pass the `HTMLElement`. See [Sizing the container](../README.md#sizing-the-container) for the two layouts that work and the failure modes, and [Architecture § Virtual scroller](./concepts/architecture.md#virtual-scroller) for the mechanism in full.

### Data

| Field           | Type                                    | Required? | Default        | Description                                                                                                                                                                                                    |
| --------------- | --------------------------------------- | --------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`        | `File \| string \| ArrayBuffer \| Blob` | no        | —              | Initial data source. If omitted, call `table.loadData(source, { tableName, sourceFormat, sourceOptions })` later.                                                                                              |
| `sourceFormat`  | `DataFormat`                            | no        | auto-detect    | Override format when the URL/filename doesn't encode it. Applies to `source` only.                                                                                                                             |
| `sourceOptions` | `SourceOptions`                         | no        | detected       | How `source` is read, per format. See `SourceOptions`. Applies to `source` only.                                                                                                                               |
| `tableName`     | `string`                                | no        | auto-generated | DuckDB-side table name for `source`, and the key its saved session is stored under. Applies to `source` only: pass it to a later `loadData()` too, or that load gets a generated name and restores no session. |

### Features (all default to `true`)

| Field                   | Type                                           | Default                        | Description                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistence`           | `boolean \| { sessionStore?: SessionStore }`   | `true`                         | IndexedDB session snapshot. Pass `{ sessionStore }` to reuse an existing store across tables.                                                                                                                                                                                                     |
| `presets`               | `boolean \| { manager?: FilterPresetManager }` | `true`                         | Filter preset UI + storage. Pass `{ manager }` to share across tables.                                                                                                                                                                                                                            |
| `undoRedo`              | `boolean`                                      | `true`                         | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z, plus Ctrl+Y for redo.                                                                                                                                                                                                                                              |
| `expressionFilter`      | `boolean`                                      | `true`                         | Raw-SQL filter button in the filter bar.                                                                                                                                                                                                                                                          |
| `derivedColumns`        | `boolean`                                      | `true`                         | The "+" add-column button, the per-header `f(x)` edit icon, a nested or JSON column header's extract button and the value inspector's "Add as column" buttons. The programmatic API (`actions.addDerivedColumn`, `actions.addNestedFieldColumn`, …) is unaffected by this flag.                   |
| `visualizations`        | `boolean`                                      | `true`                         | Auto-attach column-header charts: histograms, value counts, and a summary bar for nested columns.                                                                                                                                                                                                 |
| `visualizationRegistry` | `VisualizationRegistry`                        | `defaultVisualizationRegistry` | Per-instance registry for custom visualizations.                                                                                                                                                                                                                                                  |
| `statsPanelRegistry`    | `StatsPanelRegistry`                           | `defaultStatsPanelRegistry`    | Per-instance registry for custom column-stats panels. Both the per-instance and module-scoped fallback are empty by default — register a `BaseStatsPanel` subclass to replace the library's built-in `formatDefaultStats` rendering for matching column types. See [Stats panels](#stats-panels). |
| `exportDialog`          | `boolean`                                      | `true`                         | Built-in export dialog (CSV/JSON/Parquet).                                                                                                                                                                                                                                                        |

### Worker

| Field           | Type                  | Required? | Default         | Description                                                                                                                       |
| --------------- | --------------------- | --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bridge`        | `WorkerBridge`        | no        | new one created | Share a worker across tables.                                                                                                     |
| `bridgeOptions` | `WorkerBridgeOptions` | no        | `{}`            | Options for the owned bridge (`workerFactory`, `workerUrl`, `duckdbBundles`, `initializeTimeoutMs`). Unused if `bridge` is given. |

### UI

| Field            | Type          | Required? | Default         | Description                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------- | --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `portalTarget`   | `HTMLElement` | no        | `document.body` | Where fixed-position modals mount.                                                                                                                                                                                                                                                                                 |
| `rowHeight`      | `number`      | no        | `32`            | Row height in pixels. With the scroll viewport's height it fixes how many rows render — see [Mounting](#mounting). Published as `--dt-row-height`.                                                                                                                                                                 |
| `headerHeight`   | `number`      | no        | `120`           | Header height in pixels (accommodates visualizations). Applied as a `min-height` on the header row, so it comes out of the container's height before the body scroll viewport takes the remainder.                                                                                                                 |
| `fetchBlockSize` | `number`      | no        | `128`           | Rows fetched per scroll block. Clamped to [16, 1024]. Row fetches are quantized to block-aligned windows, so overlapping scroll positions dedupe onto the same query and a block already in flight is never re-requested.                                                                                          |
| `rowCacheRows`   | `number`      | no        | `2048`          | Maximum rows held in the in-memory row cache, rounded up to whole blocks with a floor of 4 blocks. Eviction is whole-block, keyed to the live viewport. Raise it to make longer back-scrolls query-free at the cost of memory; it never affects correctness, only how often previously seen blocks are re-fetched. |
| `prefetch`       | `boolean`     | no        | `true`          | Speculatively fetch one block beyond the viewport in the current scroll direction while the fetch pipeline is idle. Runs at `'normal'` worker priority, so visible-row fetches always jump ahead of it; a direction change abandons it. Disable it to keep query volume to the strict minimum.                     |
| `colorScheme`    | `ColorScheme` | no        | `'auto'`        | Initial light/dark theme.                                                                                                                                                                                                                                                                                          |
| `classPrefix`    | `string`      | no        | `'dt'`          | CSS class prefix for full isolation.                                                                                                                                                                                                                                                                               |

### Customization

| Field                | Type                      | Required? | Default           | Description                                                                                                                                                                                       |
| -------------------- | ------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instanceId`         | `string`                  | no        | auto-generated    | Mixed into element IDs to avoid ambiguous `aria-labelledby` / `aria-activedescendant` IDREFs. A random suffix is always appended — read `DataTable.instanceId` for the value actually in the DOM. |
| `editorFactory`      | `ExpressionEditorFactory` | no        | CodeMirror editor | Plug a custom expression editor. It gets each dialog's placeholder and accessible name, from `messages`, as its third argument.                                                                   |
| `messages`           | `DeepPartial<Strings>`    | no        | `defaultStrings`  | Override user-facing strings. Consumed once at init — rebuild to change.                                                                                                                          |
| `strictBrowserCheck` | `boolean`                 | no        | `false`           | When true, reject init with `WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`) if any required browser API is missing.                                                                              |

---

## `DataTable` interface

Returned by `createDataTable()`. Source: `src/DataTable.ts:369-472`.

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
| `loadData`            | `(source, opts?) => Promise<void>`                            | Load a new source. Emits `loadStart` → `loadProgress` → `loadComplete` or `loadError` (see below).                  |
| `on`                  | `<K extends keyof TableEvents>(event, handler) => () => void` | Subscribe. Returns an unsubscribe function.                                                                         |
| `off`                 | `<K extends keyof TableEvents>(event, handler) => void`       | Unsubscribe.                                                                                                        |
| `openExportDialog`    | `() => void`                                                  | Open the export dialog. No-op when `exportDialog: false`.                                                           |
| `clearSession`        | `() => Promise<void>`                                         | Wipe persisted snapshot AND in-memory state. Call `loadData()` after to repopulate.                                 |
| `destroy`             | `() => Promise<void>`                                         | Tear down DOM, subscriptions, worker (if owned), session store (if owned).                                          |
| `isDestroyed`         | `() => boolean`                                               | Guard against use after `destroy()`.                                                                                |
| `isPersistenceActive` | `() => boolean`                                               | `false` if persistence disabled OR IndexedDB unavailable (watch for `warning` with code `PERSISTENCE_UNAVAILABLE`). |
| `setColorScheme`      | `(scheme: ColorScheme) => void`                               | Switch light/dark at runtime.                                                                                       |
| `getColorScheme`      | `() => ColorScheme`                                           | Currently-applied scheme.                                                                                           |

Each `loadStart` is followed by at most one `loadComplete` or `loadError`. A load that a newer `loadData()` or `clearSession()` supersedes before it ends fires neither: its promise resolves, or rejects if the load itself failed, and the table shows the newer load or the cleared state.

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
| `columnWidths`         | `Signal<Map<string, number>>`                     | Custom widths in pixels, padding and border included. A column without an entry is 150 px wide, a nested or JSON column 168 px.                                                                                                                      |
| `pinnedColumns`        | `Signal<string[]>`                                | Left-pinned column names.                                                                                                                                                                                                                            |
| `hiddenColumnInfo`     | `Signal<Map<string, HiddenColumnInfo>>`           | Neighbor metadata for hidden columns.                                                                                                                                                                                                                |
| `columnHeaderTooltips` | `Signal<Map<string, ColumnHeaderTooltipContent>>` | Per-column structured popover content set via `actions.setColumnHeaderTooltip`. Empty map by default; persisted into `SessionSnapshot.columnHeaderTooltips`.                                                                                         |
| `selectedRows`         | `Signal<Set<number>>`                             | Selected rows, as 0-based positions in the filtered, sorted view.                                                                                                                                                                                    |
| `hoveredRow`           | `Signal<number \| null>`                          | Hovered row index.                                                                                                                                                                                                                                   |
| `hoveredColumn`        | `Signal<string \| null>`                          | Hovered column name.                                                                                                                                                                                                                                 |
| `focusedCell`          | `Signal<{ row: number; column: string } \| null>` | Keyboard cursor. `null` when there is no cursor. `row: -1` is the header sentinel (`HEADER_ROW_INDEX` internally) — the cursor is on the column-header row rather than on a data row, so treat any negative row as "not a data row" before indexing. |

The reserved synthetic [`__rowid__`](./glossary.md#__rowid__-synthetic-row-id) column appears in `schema` and `columnOrder` but is excluded from the default `visibleColumns`. The `ColumnSchema` entry carries `system: true`. Toggle visibility with `actions.showColumn('__rowid__')` / `actions.hideColumn('__rowid__')`.

---

## Actions methods

Source: `src/core/Actions.ts`. Access via `table.actions`.

### Undo / redo

| Method                     | Signature                                | Notes                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undo`                     | `() => Promise<boolean>`                 | Resolves `true` if something was undone.                                                                                                                                                                                                                                                                                                     |
| `redo`                     | `() => Promise<boolean>`                 | Resolves `true` if something was redone.                                                                                                                                                                                                                                                                                                     |
| `beginColumnWidthChange`   | `() => void`                             | Call before a width drag so undo captures pre-drag state. Thin alias for `beginColumnLayoutChange`.                                                                                                                                                                                                                                          |
| `endColumnWidthChange`     | `() => void`                             | Pair with `beginColumnWidthChange`. Thin alias for `endColumnLayoutChange`.                                                                                                                                                                                                                                                                  |
| `beginColumnLayoutChange`  | `() => void`                             | Open a column-layout gesture: every width and order change until it closes becomes one undo entry, and nested capture is suppressed.                                                                                                                                                                                                         |
| `endColumnLayoutChange`    | `() => void`                             | Commit the gesture. Pushes an undo entry **only if the state actually changed** — a no-op drag adds no step.                                                                                                                                                                                                                                 |
| `cancelColumnLayoutChange` | `() => void`                             | Abandon the gesture: restore the width and order it opened on, push nothing. The `Escape` half of `Shift+F2`.                                                                                                                                                                                                                                |
| `getUndoManager`           | `() => UndoManager \| undefined`         | Returns the active manager or `undefined` if `undoRedo: false`.                                                                                                                                                                                                                                                                              |
| `resetToInitial`           | `() => Promise<boolean>`                 | Reset to the state as the load left it, a restored session's filters, sort and column layout included. Removes every derived column and clears undo/redo.                                                                                                                                                                                    |
| `setOnFilterRemove`        | `(cb: (column: string) => void) => void` | Called once per column that loses its filter — by chip, panel, `clearFilters`, a preset, undo/redo, reset, or a retyped derived column. Not called when a filter is merely replaced. One slot: the table fills it to clear its charts' brushes, and calling it replaces that handler. To react to removed filters, listen to `filterChange`. |

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

| Method           | Signature                  | Notes                                                                                                                     |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `hideColumn`     | `(column: string) => void` | Records neighbors for intelligent restore.                                                                                |
| `showColumn`     | `(column: string) => void` | Re-inserts next to original neighbor if possible, never among pinned columns unless pinned itself; `columnOrder` follows. |
| `showAllColumns` | `() => void`               |                                                                                                                           |

### Column order / pin / width

| Method             | Signature                                 | Notes                                                       |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| `setColumnOrder`   | `(columns: string[]) => void`             | Pinned columns are kept first. A repeated name counts once. |
| `toggleColumnPin`  | `(column: string) => void`                | Moves to / from the pinned group.                           |
| `setColumnWidth`   | `(column: string, width: number) => void` | Padding and border included; drawn at 50 px at least.       |
| `resetColumnWidth` | `(column: string) => void`                |                                                             |

### Derived columns

| Method                 | Signature                                                                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addDerivedColumn`     | `(def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>`                                                                         | Expression or vector. A name another column has, ignoring the case of ASCII letters, is refused (`already exists as "label"`): DuckDB binds `"LABEL"` to `label`. An expression must give one value for each row: one that returns several rows for a row (`unnest(tags)`, `generate_subscripts`) or an aggregate without a window (`sum(price)`; write `sum(price) OVER ()`) is refused, with a message that says what to write instead. A failed add changes nothing.                                                                                                            |
| `updateDerivedColumn`  | `(oldName: string, def: DerivedColumnDef) => Promise<{ success: boolean; error?: string }>`                                                        | Handles renames; if `def.name !== oldName` the column is renamed and references are propagated. Filters on the column are dropped when its DuckDB type changes, except from one integer type to another or one DECIMAL to another, and `replaceDerivedColumn` drops them the same way. A failed update changes nothing.                                                                                                                                                                                                                                                            |
| `replaceDerivedColumn` | `(name: string, newDef: DerivedColumnDef) => Promise<{ success: true; info: DerivedColumnInfo } \| { success: false; error: DerivedColumnError }>` | Same-name replacement with dependent re-validation. Pre-flight order: existence → expression validation → type detection → cycle check → dependent re-validation → commit. Errors: `NOT_FOUND`, `EXPRESSION_INVALID`, `DEPENDENTS_INCOMPATIBLE` (`details.dependentsAffected: string[]`, `details.reasons: Record<string,string>`), `CIRCULAR_DEPENDENCY`, `VECTOR_LENGTH_MISMATCH`. Fires `derivedChange` with `kind: 'replaced'` on success. See [Derived columns guide → Replacing](./guides/derived-columns.md#replacing-a-derived-column-same-name--dependent-re-validation). |
| `removeDerivedColumn`  | `(name: string) => Promise<void>`                                                                                                                  | Fires `derivedChange` with `kind: 'removed'` and `columnName` set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `addNestedFieldColumn` | `(column: string, path: (string \| number)[], options?: NestedFieldColumnOptions) => Promise<{ success: boolean; name?: string; error?: string }>` | Add a derived expression column that reads one part of a nested or JSON column, right after it. See [Extracting a nested field](#extracting-a-nested-field).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `validateExpression`   | `(expression: string) => Promise<{ valid: boolean; type?: DataType; originalType?: string; error?: string }>`                                      | Validate without committing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getCompletionContext` | `() => CompletionContext`                                                                                                                          | For autocompletion in custom editors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Derived-column changes, `undo`, `redo`, `resetToInitial`, `loadData` and `clearSession` run one at a time, in call order. Each starts once the one before it has landed and validates against the columns that one left, so a second add of one name gets `already exists`, and an `undo` called while an add runs undoes the add. A change still waiting or running when `loadData` or `clearSession` is called does not apply: an add or update resolves `{ success: false }`, a replacement resolves `NOT_FOUND`, a removal rejects with `NOT_FOUND`, and an undo, redo or reset resolves `false`. An `undo`, `redo` or `resetToInitial` called while a load is under way resolves `false`: it would act on the session the load restores.

#### Extracting a nested field

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.addNestedFieldColumn('point', ['x']); // { success: true, name: 'point_x' }
// tags: VARCHAR[]
await table.actions.addNestedFieldColumn('tags', [], { extract: 'length' }); // tags_length
// doc: JSON. A key with a dot in it, then an array index, read as a number
await table.actions.addNestedFieldColumn('doc', ['a.b', 0], { jsonLeaf: 'number' }); // doc_a_b_0
```

`addNestedFieldColumn` writes the expression that reads `path` in a nested or JSON column and adds it as an ordinary derived expression column (`src/core/Actions.ts`, `src/nested/extractExpression.ts`), with the chart, stats and filters of its type. `path` is read against the column's DuckDB type, a step at a time: a STRUCT field's name or 1-based position (the only way to an unnamed field), a LIST or ARRAY element's 1-based position, a MAP key (text or a number), a UNION member's tag, and inside JSON or a VARIANT, object keys and 0-based array indexes. Struct field names and union tags match ignoring the case of ASCII letters, as DuckDB binds them; map keys and JSON keys match exactly, and a JSON key in the wrong case reads NULL in every row.

| Reads                                                | Expression                                                     | Default name      |
| ---------------------------------------------------- | -------------------------------------------------------------- | ----------------- |
| struct field `['geo', 'lat']` of `point`             | `"point"['geo']['lat']`                                        | `point_geo_lat`   |
| unnamed struct field `[2]` of `pair`                 | `struct_extract("pair", 2)`                                    | `pair_2`          |
| field named `''`, `['']` or `[2]`, of `s`            | `struct_extract_at("s", 2)`                                    | `s_field`         |
| list element `[3]` of `tags`                         | `"tags"[3]`                                                    | `tags_3`          |
| `tags`, `extract: 'length'`                          | `len("tags")`                                                  | `tags_length`     |
| map value `['k']` of `m`                             | `map_extract_value("m", 'k')`                                  | `m_k`             |
| `m`, `extract: 'length'`                             | `cardinality("m")`                                             | `m_size`          |
| union member `['num']` of `u`; `u`, `extract: 'tag'` | `union_extract("u", 'num')`; `union_tag("u")`                  | `u_num`; `u_tag`  |
| JSON `['a.b', 0]` of `doc`                           | `json_extract_string("doc", '$."a.b"[0]')`                     | `doc_a_b_0`       |
| the same, `jsonLeaf: 'number'`                       | `TRY_CAST(json_extract_string("doc", '$."a.b"[0]') AS DOUBLE)` | `doc_a_b_0`       |
| JSON `['tags']` of `doc`, `extract: 'length'`        | `json_array_length("doc", '$.tags')`                           | `doc_tags_length` |

- **Options.** `extract`: `'value'` (default), `'length'` (a list's, array's or JSON array's length, a map's number of entries), or `'tag'` (a union's member tag). `jsonLeaf`, for a value inside JSON or a VARIANT: `'string'` (default; a JSON string unquoted, anything else as its JSON text), `'number'` or `'boolean'`, the value's text cast with `TRY_CAST` (so a string holding a number reads as one, `"12.5"` as 12.5, and `1`, `0`, `"true"` and `"yes"` as booleans; NULL where the text does not cast), or `'json'`. `name`: the column's name; refused, as in `addDerivedColumn`, when another column has it in any letter case.
- **Default name.** The column's name and one part per step, joined by `_`, in lowercase ASCII letters, digits and `_`, so it needs no quoting; `_2`, `_3`, … after it when another column has that name, ignoring case.
- **Placement and undo.** The column goes right after its source, past the extracts already made of it (`point, point_x, point_y`); for a pinned source, right after the pinned columns, unpinned. One undo entry.
- **Failures** resolve `{ success: false, error }` and never reject: a column that is not in the schema or is neither nested nor JSON, an option it does not know, a path that does not fit the type (the message names the step; see the path codes in [troubleshooting](./troubleshooting.md#error-code-reference)), a name that is taken, an expression DuckDB refuses, a destroyed table, or new data loaded first. It runs in its turn, as `addDerivedColumn` does.

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

Returns the named column's values in `__rowid__` order for `scope: 'all'` and `'filtered'`, and in the sorted, filtered view's order for `scope: 'selected'`. Every value is exact (`src/core/Actions.ts`, `getColumnValues`). The return type narrows by data type:

| Column                                                                      | Returned as                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'integer'`: `TINYINT` … `INTEGER`, `UTINYINT` … `UINTEGER`                 | `Int32Array`; `unknown[]` of numbers when a `UINTEGER` passes 2^31 − 1                                                                                                                                                            |
| `'integer'`: `BIGINT`, `UBIGINT`, `HUGEINT`, `UHUGEINT` (incl. `__rowid__`) | `BigInt64Array`, every digit kept; `unknown[]` of numbers (exact) and bigints (beyond ±(2^53 − 1)) when a value does not fit 64 bits                                                                                              |
| `'float'` / `'decimal'`                                                     | `Float64Array`; a `DECIMAL` is the double nearest its value                                                                                                                                                                       |
| `'nested'`                                                                  | `unknown[]` of JS values, as [`getCellValue`](#getcellvalue) returns them: arrays, objects, `Map`s, `{ [tag]: value }`                                                                                                            |
| Everything else                                                             | `unknown[]`. `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY`, `TIME WITH TIME ZONE` and `TIME_NS` are DuckDB's text; a `BLOB` is a `Uint8Array`; `DATE` and `TIMESTAMP` are epoch milliseconds; `VARCHAR`, `UUID` and `JSON` text |

Notes:

- A `NULL` anywhere in the result makes it an `unknown[]` holding `null`, whatever the type: a typed array would read it as `0`.
- Empty selection + `scope: 'selected'` returns an empty array of the column's kind (no throw).
- `__rowid__` is queryable by name even though it's hidden in the grid by default.
- Pagination is enforced by SQL (`LIMIT` / `OFFSET`) — not slicing afterwards.
- A nested column's values are read as JSON text and skip the query cache; `BIGINT`-family columns are read as text and parsed, which is slower than reading numbers.
- A `DATE` or `TIMESTAMP` is epoch milliseconds, a timestamp's digits past the millisecond as a fraction, and DuckDB's `infinity` and `-infinity` are `Infinity` and `-Infinity`. Past ±2^53 ms, after year 287396 or before 283458 BC, the number is the nearest one.

Errors (`QueryError`, except the last):

| Code                 | When                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `COLUMN_NOT_FOUND`   | `name` is not in `state.schema`. Before any load the schema is empty, so a call then rejects with this code.       |
| `INVALID_PAGINATION` | `limit` or `offset` is negative or non-integer.                                                                    |
| `INVALID_ROWID`      | `scope: 'selected'` and a row in `state.selectedRows` is not a non-negative integer.                               |
| `NO_TABLE`           | No table is loaded while the schema still names the column, which a table built by `createDataTable` never leaves. |
| `QUERY_ABORTED`      | `opts.signal` aborted the read.                                                                                    |
| `DESTROYED`          | `DestroyedError`: the table was destroyed before or during the call.                                               |

See [`examples/10-column-export/`](../examples/10-column-export/) for a runnable demo, including `BigInt64Array` ergonomics for `__rowid__`.

#### `getCellValue`

```ts
async getCellValue(
  rowId: number | bigint,
  column: string,
  options?: GetCellValueOptions, // { signal?: AbortSignal }
): Promise<unknown>;
```

Reads one cell exactly: the value in `column` of the row whose `__rowid__` is `rowId`, from the current effective table (the derived-column VIEW when there is one). One query by `__rowid__`, which skips the query cache and runs ahead of queued chart and stats queries, though behind the grid's row fetches (`priority: 'elevated'`), so a loop of reads leaves scrolling alone. `rowId` is the row's `__rowid__`, not its position in the sorted view.

A nested column's value is read as exact JSON text and turned into JS values (`src/core/jsonTree.ts`, `materialize`):

| DuckDB value                                          | Returned as                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LIST, ARRAY                                           | An array.                                                                                                                                                                                              |
| STRUCT                                                | An object keyed by field name, every key an own property (`__proto__`, `constructor`, `toJSON` and `''`, a field named with the empty string, included); an unnamed struct, an array.                  |
| MAP                                                   | A `Map`, entries in order. Integer keys are numbers (bigints beyond ±(2^53 − 1)), FLOAT, DOUBLE and DECIMAL keys numbers, BOOLEAN keys booleans, other keys their text (`'2024-01-02'`, `"{'k': 1}"`). |
| UNION                                                 | `{ [tag]: value }`.                                                                                                                                                                                    |
| Integers inside                                       | A number when exact, a `bigint` beyond ±(2^53 − 1).                                                                                                                                                    |
| DECIMAL, FLOAT, DOUBLE inside                         | A number, `NaN`, `±Infinity` and `-0` kept. A FLOAT is its float32 value: `0.10000000149011612` for `0.1`.                                                                                             |
| Dates, times, UUIDs, INTERVAL, BLOB, ENUM, BIT inside | DuckDB's text: `'2024-01-02'`, `'1 year 2 months'`, `'\xAA\xBB'`.                                                                                                                                      |
| VARIANT, or JSON inside a value                       | What its JSON holds.                                                                                                                                                                                   |

Any other column's value is the one `getColumnValues` returns for the row: a `bigint` for `BIGINT` to `UHUGEINT`, however small (where `getColumnValues` falls back to an `unknown[]`, for a NULL or a value past 64 bits, it holds the small ones as numbers: `[12, null, 18446744073709551615n]`), a number for the other integers and for `FLOAT`, `DOUBLE` and `DECIMAL`, epoch milliseconds for `DATE` and `TIMESTAMP` (`Infinity` and `-Infinity` for DuckDB's `infinity` and `-infinity`), DuckDB's text for `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY`, `TIME WITH TIME ZONE` and `TIME_NS`, a JSON column's text, a `Uint8Array` for a `BLOB`. SQL NULL, at the top or anywhere inside, is `null`. Test object keys with `Object.hasOwn`: a field named `hasOwnProperty` hides the method.

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.getCellValue(10, 'point'); // { x: 1.5, y: -0.5, tier: 'gold' }

// attrs: MAP(VARCHAR, INTEGER): keys in order, `size` a key like any other
const attrs = (await table.actions.getCellValue(11n, 'attrs')) as Map<string, number>;
attrs.get('size'); // 1
```

Errors (`QueryError`, except the last):

| Code               | When                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `COLUMN_NOT_FOUND` | `column` is not in `state.schema`; also a call before any load, when the schema is empty.                                                 |
| `INVALID_ROWID`    | `rowId` is not a non-negative integer (a safe integer, or a bigint within the BIGINT range), or no row has it. `details.rowId` echoes it. |
| `NO_TABLE`         | No table is loaded while the schema still names the column, which a table built by `createDataTable` never leaves.                        |
| `QUERY_ABORTED`    | `options.signal` aborted the read.                                                                                                        |
| `DESTROYED`        | `DestroyedError`: the table was destroyed before or during the call.                                                                      |

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

| Method           | Signature                                                          | Notes                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectRow`      | `(index: number, mode?: 'replace' \| 'toggle' \| 'range') => void` | `index` is a 0-based position in the filtered, sorted view. Default mode `'replace'`; `'range'` runs from the last row selected or toggled, or selects the row alone when there is none or it is past the end of the view. |
| `clearSelection` | `() => void`                                                       | Also forgets where a `'range'` starts.                                                                                                                                                                                     |
| `selectAll`      | `() => void`                                                       | Positions `0 … n−1` of the current view: `n` is `filteredRows` while a filter is active, else `totalRows`. After a filter change, call it once `filterChange` has fired.                                                   |

A filter or sort change keeps the positions, which then name other rows, and fires no `selectionChange`; exports, `Ctrl/Cmd+C` and `getColumnValues({ scope: 'selected' })` skip positions past the end of the view.

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
| `loadProgress`    | `ProgressInfo`                                                                                                       | The worker's progress through a load, between `loadStart` and `loadComplete` or `loadError`: `stage` `reading` (`percent` 0), `parsing` (25), `indexing` (90).                                                                                      |
| `loadComplete`    | `{ tableName, rowCount, schema }`                                                                                    | Data loaded and schema known.                                                                                                                                                                                                                       |
| `loadError`       | `{ error: Error }`                                                                                                   | Load failed.                                                                                                                                                                                                                                        |
| `error`           | `{ error: DataTableError; source: TableErrorSource }`                                                                | Any recoverable typed error. `source` discriminates the subsystem. A `'visualization'` or `'stats-panel'` error names its column in `details.column`.                                                                                               |
| `warning`         | `{ code: string; message: string; details?: Record<string, unknown> }`                                               | Non-fatal degradation (e.g., `STYLESHEET_MISSING`, `PERSISTENCE_UNAVAILABLE`).                                                                                                                                                                      |
| `filterChange`    | `{ filters, filteredRowCount, totalRowCount }`                                                                       | Any filter-list change.                                                                                                                                                                                                                             |
| `sortChange`      | `{ sortColumns }`                                                                                                    | Sort changed.                                                                                                                                                                                                                                       |
| `selectionChange` | `{ selectedRows: Set<number> }`                                                                                      | The selected positions changed. Not fired by filter or sort changes.                                                                                                                                                                                |
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
| `CHUNK_LOAD_FAILED`       | `ConfigurationError`    | `src/table/TableContainer.ts`                                                      | The value inspector's or extract panel's chunk did not download. `details.panel`, the import's error as `cause`; `source: 'unknown'`.                |
| `WORKER_UNSUPPORTED`      | `WorkerInitError`       | `src/DataTable.ts`                                                                 | `strictBrowserCheck: true` and at least one required API is missing. `details.missing: string[]`.                                                    |
| `WORKER_CRASHED`          | `WorkerInitError`       | `src/data/WorkerBridge.ts`                                                         | Worker error, at init or later. Every pending and later request rejects; a table emits one `error` event (`source: 'query'`).                        |
| `WORKER_INIT_TIMEOUT`     | `WorkerInitError`       | `src/data/WorkerBridge.ts`                                                         | Worker init did not complete within `initializeTimeoutMs` (default 30s).                                                                             |
| `WORKER_TERMINATED`       | `WorkerTerminatedError` | `src/data/WorkerBridge.ts`                                                         | Worker terminated mid-flight.                                                                                                                        |
| `BRIDGE_NOT_READY`        | `ConfigurationError`    | `src/core/Actions.ts`, `src/worker/duckdb.ts`, `src/data/WorkerBridge.ts`          | Bridge used before init (`await createDataTable()` not yet resolved).                                                                                |
| `QUERY_RUNTIME`           | `QueryError`            | various viz + query sites                                                          | DuckDB returned an error at query time.                                                                                                              |
| `QUERY_ABORTED`           | `QueryError`            | `src/data/WorkerBridge.ts`                                                         | Query aborted via `AbortSignal` or bridge teardown.                                                                                                  |
| `SQL_SYNTAX`              | `SQLValidationError`    | `src/core/Actions.ts`                                                              | Raw-SQL filter / derived-column expression failed WHERE-clause validation.                                                                           |
| `LOAD_PARSE_FAILED`       | `LoadError`             | `src/worker/loaders/common.ts`                                                     | CSV/JSON/Parquet parse failed during timestamp/date/time coercion.                                                                                   |
| `LOAD_INVALID_TIMEZONE`   | `LoadError`             | `src/data/sourceOptions.ts`, `src/worker/loaders/common.ts`                        | `sourceOptions.timezone` is not a zone name, or one DuckDB does not know; the message lists the zones it suggests.                                   |
| `LOAD_INVALID_OPTIONS`    | `LoadError`             | `src/data/sourceOptions.ts`, `src/worker/loaders/{csv,json,parquet}.ts`            | A `sourceOptions` value out of range, an unknown key, or Parquet `columns` the file lacks. `details.option` names it.                                |
| `LOAD_FORMAT_UNSUPPORTED` | `LoadError`             | `src/worker/worker.ts`                                                             | Unknown/unsupported file format.                                                                                                                     |
| `LOAD_MEMORY_EXCEEDED`    | `LoadError`             | `src/worker/loaders/memoryBudget.ts`                                               | A Parquet load would not fit in browser memory (`details.stage`: `'estimate'`, with `details.check`, or `'load'`, with `details.duckdbMessage`).     |
| `FETCH_FAILED`            | `LoadError`             | `src/data/DataLoader.ts`                                                           | URL fetch failed.                                                                                                                                    |
| `PARSE_FAILED`            | `LoadError`             | `src/DataTable.ts`                                                                 | Generic parse fallback.                                                                                                                              |
| `EXPRESSION_INVALID`      | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`                                              | Derived-column expression rejected by DuckDB; or an `unnest(…)` or an aggregate, refused with what to write instead.                                 |
| `CIRCULAR_DEPENDENCY`     | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`                                              | Derived column references itself (directly or transitively).                                                                                         |
| `DEPENDENTS_INCOMPATIBLE` | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts`                       | `replaceDerivedColumn` would break one or more dependent columns. `details.dependentsAffected: string[]`, `details.reasons: Record<string, string>`. |
| `NOT_FOUND`               | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts`                       | Derived column missing on update / replace / remove.                                                                                                 |
| `DUPLICATE_NAME`          | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts` (`restoreColumns`)                           | A restore, undo or redo brings back a derived column whose name another column has, ignoring ASCII case: it is left out, in a `console.warn`.        |
| `VECTOR_LENGTH_MISMATCH`  | `DerivedColumnError`    | `src/derived/DerivedColumnManager.ts`                                              | Vector length doesn't match row count.                                                                                                               |
| `RESERVED_COLUMN_NAME`    | `LoadError`             | `src/worker/loaders/{csv,json,parquet}.ts`                                         | Source contains a column named `__rowid__`, which is reserved for the synthetic row id.                                                              |
| `COLUMN_NOT_FOUND`        | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`, `getCellValue`)                          | Column does not exist on the loaded schema.                                                                                                          |
| `INVALID_PAGINATION`      | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`)                                          | `limit` or `offset` is negative or non-integer.                                                                                                      |
| `INVALID_ROWID`           | `QueryError`            | `src/core/Actions.ts`, `src/data/cellValue.ts`                                     | A selected row in `getColumnValues({ scope: 'selected' })`, or `getCellValue`'s `rowId`, is not a non-negative integer, or no row has that `rowId`.  |
| `NO_TABLE`                | `QueryError`            | `src/core/Actions.ts` (`getColumnValues`, `getCellValue`)                          | No table is loaded while the schema names the column. Before any load the schema is empty, and `COLUMN_NOT_FOUND` comes first.                       |
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
  /**
   * 'interval': the bounds are INTERVAL literals. 'time': compare the column's
   * time of day, CAST(col AS TIME), as a TIME WITH TIME ZONE column's chart and
   * filter panel do. Not for TIME_NS, which the cast rounds to microseconds.
   */
  valueType?: 'interval' | 'time';
}

table.actions.addFilter({
  type: 'range',
  column: 'age',
  min: 18,
  max: 65,
  maxInclusive: true,
});
// A TIME WITH TIME ZONE column, 01:30 up to 06:00 as written, whatever the offsets
table.actions.addFilter({
  type: 'range',
  column: 'pickup_time',
  min: '01:30:00',
  max: '06:00:00',
  valueType: 'time',
});
```

### `PointFilter`

```ts
interface PointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | Date | null;
  /** 'text': compare the column's DuckDB text, CAST(col AS VARCHAR), with the value as text. */
  valueType?: 'text';
}

table.actions.addFilter({ type: 'point', column: 'sku', value: 'A-42' });
```

#### `valueType: 'text'`

Point, set and not-set filters compare the column's value by default: `"col" = 'x'`, where DuckDB reads the literal as the column's type. With `valueType: 'text'` they compare the column's DuckDB text instead, `CAST("col" AS VARCHAR)`, the text the grid shows, and take every value as text (a number or boolean by its `String()` form, a `Date` by its ISO string). That is how a nested column is matched exactly; the filter panel's "exact" mode sets it on `'nested'` columns and on JSON columns. Compared as a value, text that does not read as a list, struct or map is a Conversion Error, a UNION finds only the member the text reads as, and a VARIANT fails on values of another type. A `null` value, and `includeNull`, still test `"col" IS NULL` (`src/filters/FilterTypes.ts`, `src/filters/FilterSQL.ts`).

```ts
// tags: VARCHAR[], a cell that reads [red, green]
table.actions.addFilter({
  type: 'point',
  column: 'tags',
  value: '[red, green]',
  valueType: 'text',
});
// Every row but the empty lists, NULL rows included
table.actions.addFilter({
  type: 'not-set',
  column: 'tags',
  values: ['[]'],
  includeNull: true,
  valueType: 'text',
});
```

The field is kept by `serializeFilter`, sessions, presets and undo. On preset import, a range, point, set or not-set filter whose `valueType` is not one its type reads (`'interval'` or `'time'` for a range, `'text'` for the others) is dropped, like a filter of an unknown type, and the rest of the preset imports, though a preset left with no valid filter is skipped (`src/filters/FilterPresets.ts`); a `valueType` on any other filter type is ignored. An exact filter on a JSON column needs `valueType: 'text'` too: compared as JSON, any text that is not JSON is a Conversion Error (`Malformed JSON`). The filter panel sets it on nested and JSON columns. A range filter on a `TIME WITH TIME ZONE` column that a session restore or `loadFilterPreset` brings back without a `valueType` gets `valueType: 'time'` when both its bounds are times without an offset (`'01:30:00'`, or open); one with an offset (`'20:00:00+00'`) keeps comparing instants. Both take `valueType: 'time'` off a range filter whose column is not `TIME` or `TIME WITH TIME ZONE`, where `CAST(col AS TIME)` would fail every query (`src/filters/timeFilters.ts`).

### `SetFilter`

```ts
interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  /** When true, NULL rows are included — generates `col IN (...) OR col IS NULL`. */
  includeNull?: boolean;
  /** 'text': CAST(col AS VARCHAR) IN (…), the values as text. See valueType above. */
  valueType?: 'text';
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
  /** 'text': CAST(col AS VARCHAR) NOT IN (…), the values as text. See valueType above. */
  valueType?: 'text';
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

`isApplicable` receives the column's `DataType`, `'nested'` for a LIST, ARRAY, STRUCT, MAP, UNION or VARIANT column: a registration that accepts `'string'` does not receive those. Pass via `createDataTable({ statsPanelRegistry })`; or register on the module-scoped `defaultStatsPanelRegistry` to share across every table that doesn't pass a per-instance registry. To restrict a panel to a specific column **name** rather than a `DataType`, subclass `StatsPanelRegistry` and override `create()` (same pattern as `examples/08-custom-visualization`'s `StateAwareRegistry`).

### Panel constructor and lifecycle

```ts
abstract class BaseStatsPanel {
  protected readonly container: HTMLElement;
  protected readonly column: ColumnSchema;
  protected options: StatsPanelOptions;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions);

  /**
   * Required. Receives on mount the stats the column's chart last emitted,
   * or `null` without a live chart; `null` whenever the chart is removed;
   * and each ColumnStatsData the chart emits (and on data reload). Columns
   * without a visualization receive `update(null)` only.
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

Quoted from `src/visualizations/BaseStatsPanel.ts:108-139`:

- The constructor is called with an empty `container` element (the `.dt-col-stats` slot inside a column header), when the column comes within about a viewport of the view and the columns there have held still for 150 ms: a scroll builds no panel for the columns it passes. Those near the view on load, new data or a derived-column change, and a column just shown, get theirs at once. A panel lives while its column is near the view, through hides, shows and moves of other columns.
- `update()` fires on mount, with the stats the column's chart last emitted if it has one, `null` otherwise; with `null` whenever the chart is removed; and with each `ColumnStatsData` the chart emits (and on data reload). Columns without a visualization receive `update(null)` only.
- `updateFilters(filters)` fires every time the table's active filter array changes, before any subsequent `update(stats)` call from a viz refetch. While a derived-column change that can drop or rebuild the relation runs, it waits for the change to settle, then fires once, with the filters in force then; a change that succeeds replaces the panel instead.
- `setHoverStats(html | null)` fires when the column's visualization emits a hover snippet (and again with `null` to clear), and on mount with the snippet its chart shows then, if any. Columns without a viz never trigger this.
- `destroy()` is called exactly once: when the column moves away from the view or is hidden, before the container is reused for a freshly-constructed panel (new data, a derived column changed), or when the table is destroyed.

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
(`src/sql-editor/CodeMirrorExpressionEditor.ts:71-73`).

Wrap the result in a `Compartment` to enable schema swaps via
`Compartment.reconfigure()` without rebuilding the editor — preserves undo
history, focus, selection, and scroll position. The bundled
`CodeMirrorExpressionEditor` uses the same pattern internally
(`src/sql-editor/CodeMirrorExpressionEditor.ts:143-147`).

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

Top-level groups: `common`, `filters`, `presets`, `export`, `derived`, `a11y`, `statistics`, `values`, `errors`. `values` says nested types in words for a column header's accessible name ("list of integer") and holds the value inspector's and the extract panel's strings; see the [i18n guide](./guides/i18n.md#nested-column-types), its [value inspector table](./guides/i18n.md#value-inspector) and [Extract panel and "add as column"](./guides/i18n.md#extract-panel-and-add-as-column).

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
