# Glossary

Alphabetical reference for the domain terms used across `@jeyabbalas/data-table`.
Each entry links to the guide or concept doc where the term is covered in depth.

For an end-to-end API reference see [api-reference.md](./api-reference.md); for
grouped walkthroughs see the [guides](./README.md#guides-task-oriented) and
[concepts](./README.md#concepts-deep-dives) indices.

---

### Annotation

App-authored overlay metadata attached to a `row`, `column`, or `cell` of a
loaded table. Each annotation carries a `severity` (`error` / `warning` /
`info`), a `message`, and optional `code` / `source` / `metadata` /
`createdAt` / `updatedAt`. Annotations live outside [`TableState`](#tablestate)
and do not participate in undo/redo — they are app-injected validation /
quality-control output, not user-driven view changes. JSON-serialisable;
auto-persisted to the [`SessionSnapshot`](#sessionsnapshot).
See: [Annotations](./guides/annotations.md) · Source: `src/annotations/types.ts`

### AnnotationStore

Programmatic CRUD store on `table.annotations`. Indexes annotations by id,
row, column, and cell so `getByRow` / `getByColumn` / `getByCell` are O(1).
`getByCell(rowId, column)` returns the union of row + column + cell
annotations sorted by severity, then `createdAt`, then insertion order.
Emits a single `change` event (`kind: 'added' | 'updated' | 'removed' |
'cleared' | 'filterChanged'`) on every mutation; `setSeverityFilter` /
`getSeverityFilter` toggle which severities the rendering layer paints
without removing data. Round-trips via `toJSON` / `loadJSON('replace' |
'merge')`; preserves unknown top-level and per-annotation fields.
See: [Annotations](./guides/annotations.md) · Source: `src/annotations/AnnotationStore.ts`

### AutoSave

Opt-in helper that writes a [`SessionSnapshot`](#sessionsnapshot) to a
[`SessionStore`](#sessionstore) on a debounce timer and on `visibilitychange` /
`beforeunload`. Enabled by default when `persistence: true`; can be constructed
manually from `/advanced` for apps that manage their own save cadence.
See: [Session persistence](./guides/session-persistence.md) · Source: `src/persistence/AutoSave.ts`

### BaseStatsPanel

Abstract class for custom column-stats panels (Tier-2,
`@jeyabbalas/data-table/advanced`). Mounts in the `.dt-col-stats` slot
inside a column header and replaces the library's built-in
`formatDefaultStats` rendering with downstream-app DOM and DuckDB queries.
Subclasses implement `update(stats: ColumnStatsData | null)`; everything else
has a default. Receives the same `ColumnStatsData` the visualization for that
column emits, plus filter-aware `updateFilters(filters: Filter[])` callbacks
the panel can use to issue its own queries via `options.bridge`. Default
`updateFilters` only refreshes `this.options.filters`; default `setHoverStats`
is a no-op. The library guarantees `update(null)` once on mount,
`updateFilters(filters)` on every filter change before any subsequent
`update`, `setHoverStats(html | null)` on visualization hover in / out, and
`destroy()` exactly once. Errors route through `options.onError(err, {
source: 'stats-panel', column, phase: 'construct' | 'update' | 'hover' |
'fetch' | 'destroy' })`. Registered via [`StatsPanelRegistry`](#statspanelregistry);
filter-broadcast plumbed by [`StatsPanelCoordinator`](#statspanelcoordinator).
See: [Stats panels](./guides/stats-panels.md) · [API reference](./api-reference.md#stats-panels) · Source: `src/visualizations/BaseStatsPanel.ts`

### BrowserSupport

Result shape returned by `checkBrowserSupport()` — `{ supported: boolean, missing: string[] }`.
Probes `Worker`, `WebAssembly`, `indexedDB`, `ResizeObserver`, `BigInt`, and
`structuredClone`. Pair with `strictBrowserCheck: true` on `createDataTable` for
fail-fast initialisation on unsupported browsers.
See: [API reference](./api-reference.md) · Source: `src/core/checkBrowserSupport.ts`

### Class Prefix

The `dt-` prefix on every CSS class the library emits (e.g. `.dt-table`,
`.dt-filter-chip`). Keeps styles isolated from host-app CSS and namespaces the
[`--dt-*` CSS variables](./guides/theming.md) that drive theming. Not user-overridable —
downstream themes override CSS variables, not class names.
See: [Theming](./guides/theming.md)

### Color Scheme

One of `'light' | 'dark' | 'auto'`, passed as `createDataTable({ colorScheme })`
or toggled at runtime via `table.setColorScheme()`. `'auto'` follows
`prefers-color-scheme`; the explicit values pin the theme regardless of OS
setting. Body-portalled modals observe the `data-dt-color-scheme` attribute via
`MutationObserver` so theme flips stay in sync across portals.
See: [Theming](./guides/theming.md) · [API reference](./api-reference.md)

### Column Header Tooltip

Library-rendered popover anchored on the column-name span (`.dt-col-name`).
Holds structured content — optional `title`, optional `description` (whitespace
preserved), and optional `items[]` with `{ label, value: string | string[] }`
where a `string[]` value renders as wrapping enum chips. Set via
`table.actions.setColumnHeaderTooltip(column, content | string | null)`; a
plain string is shorthand for `{ description }`, and `null` (or any input that
normalises to empty) removes the override. XSS-safe by construction — every
text field is rendered via `.textContent`; HTML strings, DOM nodes, and render
functions are not accepted. Persisted into
[`SessionSnapshot`](#sessionsnapshot)`.columnHeaderTooltips` by default;
embedding apps that already own a column registry typically opt out via
`persistence: false`. Distinct DOM anchor and z-index from the annotation
popover — both can be visible simultaneously.
See: [Column-header tooltips](./guides/column-header-tooltips.md) · Source: `src/core/columnHeaderTooltip.ts`

### CompletionContext

The schema-and-functions snapshot that drives autocomplete in the SQL
expression / filter editors. Shape: `{ columns: Array<{ name, type,
isDerived }>; functions?: string[] }`. Two canonical entry points: the
Tier-1 `actions.getCompletionContext()` reads live state and filters the
synthetic `__rowid__`; the Tier-2 `buildCompletionContext(columns,
options?)` (from `/advanced`) normalizes any column-like input
(`ColumnSchema[]`, ad-hoc `[{name, type, originalType?, isDerived?}, …]`,
…) into the same shape — `originalType` wins over `type` when both are
present, unknown types fall back to `''`, system columns are _not_
filtered automatically. Consumed by the bundled
`CodeMirrorExpressionEditor` and by the public
[`createSqlExtensions`](#sql-editor-primitives) helper.
See: [SQL editor primitives](./guides/sql-editor-primitives.md) · [API reference](./api-reference.md#sql-editor-primitives) · Source: `src/derived/types.ts`, `src/sql-editor/extensions.ts`

### Computed

A read-only reactive primitive derived from one or more [Signals](#signal).
Recomputes lazily when a dependency changes and caches the result until the
next invalidation. Used throughout `TableState` for derived views like
filtered-row counts; not exposed at the root entry.
See: [State model](./concepts/state-model.md) · [Architecture](./concepts/architecture.md) · Source: `src/core/Signal.ts`

### Crossfilter

The coordination pattern in which a click on one visualization installs a
filter that every _other_ visualization respects. The library implements this
via a `CrossfilterCoordinator` (on `/advanced`) that drives `fetchData()`
whenever the active filter set changes. Inside a `DataTable` the fan-out is
sparse: the visualizations currently on screen refetch immediately, and
offscreen columns are marked stale and refetch when scrolled back into view.
A coordinator composed standalone from `/advanced` fans out to every
registration, as before.
See: [Visualizations](./guides/visualizations.md) · [Architecture](./concepts/architecture.md) · Source: `src/visualizations/CrossfilterCoordinator.ts`, `src/visualizations/VizDataController.ts`

### DataTableError

Base class for every error the library throws. Subclasses (`WorkerInitError`,
`LoadError`, `QueryError`, `DerivedColumnError`, `PersistenceError`,
`ExportError`, `ConfigurationError`, `DestroyedError`, …) carry a
`SCREAMING_SNAKE_CASE` `code`, optional `details`, and native `Error.cause`
chaining. Also emitted as the `error` event with a `source` discriminator.
See: [API reference](./api-reference.md) · [Troubleshooting](./troubleshooting.md) · Source: `src/core/errors.ts`

### Derived Column

A user-added column whose values are computed from existing columns. Comes in
two shapes: [`ExpressionColumnDef`](#expressioncolumndef) — a SQL expression
evaluated by DuckDB as a VIEW; [`VectorColumnDef`](#vectorcolumndef) — a
pre-computed array the library registers as a DuckDB table function. Changes
kick off [Reconciliation](#reconciliation) so the UI stays aligned with the
underlying view.
See: [Derived columns](./guides/derived-columns.md) · Source: `src/derived/types.ts`

### DuckDBFunctionInfo / DuckDBFunctionCategory

Curated metadata used by the [SQL editor primitives](#sql-editor-primitives)
(Tier-2, `@jeyabbalas/data-table/advanced`) to populate function
autocomplete. `DuckDBFunctionInfo` is `{ name; category; description }`;
`category` becomes the autocomplete `detail` chip (`'aggregate' |
'numeric' | 'string' | 'date/time' | 'casting' | 'conditional' | 'list' |
'struct' | 'window' | 'utility'`) and `description` becomes the
side-panel `info` tooltip. The exported `DUCKDB_FUNCTION_DETAILS` array
is `Object.freeze`-d at both array and entry level (176 entries); pass it
or a filtered subset through `createSqlExtensions(ctx, { functions:
subset })` to scope the dropdown, pass a `string[]` for names-only
completions, or pass `[]` to disable function autocomplete entirely. The
older names-only `DUCKDB_FUNCTIONS` constant is now derived from
`DUCKDB_FUNCTION_DETAILS` so the two cannot drift.
See: [SQL editor primitives](./guides/sql-editor-primitives.md) · [API reference](./api-reference.md#sql-editor-primitives) · Source: `src/sql-editor/duckdbFunctionDetails.ts`

### ExpressionColumnDef

A [Derived Column](#derived-column) definition whose values come from a SQL
expression (`ax + b`, `CASE WHEN …`, `REGEXP_EXTRACT(url, …)`). Evaluated by
DuckDB inside the worker — no JavaScript round-trip per row. Shapes: `{ kind:
'expression', name, expression, dataType }`.
See: [Derived columns](./guides/derived-columns.md) · Source: `src/derived/types.ts`

### Filter

A discriminated-union object describing an active constraint on the dataset.
Seven variants — [RangeFilter](#rangefilter), [PointFilter](#pointfilter),
[SetFilter](#setfilter--notsetfilter), [NotSetFilter](#setfilter--notsetfilter),
[NullFilter](#nullfilter), [PatternFilter](#patternfilter),
[RawSQLFilter](#rawsqlfilter) — each carrying a `type` tag. Applied as a
`Filter[]` on `TableState.filters`; converted to a `WHERE` clause via
`filtersToWhereClause` (exported at the root).
See: [Filters](./guides/filters.md) · [API reference](./api-reference.md) · Source: `src/filters/FilterTypes.ts`

### FilterPreset

A named, JSON-serialisable snapshot of a [Filter](#filter) array plus optional
sort / visibility / derived-column state. Managed by
[FilterPresetManager](#filterpresetmanager); saved to the
[SessionStore](#sessionstore) or exported to a file for sharing across
browsers.
See: [Filter presets](./guides/filter-presets.md) · Source: `src/filters/FilterPresetTypes.ts`

### FilterPresetManager

Root-entry class that owns the list of saved [FilterPresets](#filterpreset):
`save()`, `load()`, `delete()`, `list()`, `import()`, `export()`. Instances can
be shared across multiple tables — useful for dashboards where every panel
should surface the same named views.
See: [Filter presets](./guides/filter-presets.md) · [Multi-table dashboards](./guides/multi-table.md) · Source: `src/filters/FilterPresets.ts`

### Instance ID

A short unique string mixed into the DOM element IDs a table publishes: grid
cell and column-header ids (what `aria-activedescendant` points at) and modal
titles (what `aria-labelledby` points at). Two tables on the same page would
otherwise mint identical ids, leaving both references ambiguous — a screen
reader resolves an IDREF document-wide and lands in whichever table comes first.
Auto-generated. You may pass one to `createDataTable({ instanceId })` to make
those ids recognisable, but a random suffix is always appended, so the value in
the DOM is never exactly what you passed; `DataTable.instanceId` reports the
resolved one. Not a persistence key — session snapshots are keyed by table name.
See: [Multi-table dashboards](./guides/multi-table.md) · [API reference](./api-reference.md) · Source: `src/core/instanceId.ts`

### ModalHost

Shared primitive (on `/advanced`) that every modal and side panel uses:
focus-trap, Escape to close, scroll-lock (modals only, reference-counted),
focus-restore to the opener, and stack-index-aware z-indexes. `ModalHost` is
what lets the SQL filter modal, the derived-column editor, the export dialog,
and the preset panel coexist without fighting over focus or layering.
See: [Architecture](./concepts/architecture.md) · Source: `src/table/ModalHost.ts`

### Mount Container

The `HTMLElement` handed to `createDataTable({ container })`. The library
appends its own `.dt-root` into it and takes full ownership of the contents,
but never styles the element itself — selector strings are not accepted, and
sizing is the host page's job. It must have a **bounded height**: `.dt-root`
is `height: 100%`, so a content-sized container lets the scroll viewport grow
to the dataset's full scroll height — capped at 15,000,000 px — and
[Virtual Scrolling](#virtual-scrolling) degrades to rendering every row under
the cap (~468,750 rows at the default 32 px), with no error and no warning.
A container that is zero-tall at mount renders nothing and logs a one-shot
console warning; an unbounded one is not detected at all.
See: [Sizing the container](../README.md#sizing-the-container) · [Architecture](./concepts/architecture.md#virtual-scroller) · [API reference](./api-reference.md#createdatatableoptions) · Source: `src/table/TableContainer.ts`

### NullFilter

[Filter](#filter) variant matching rows where a column is `NULL` (or
non-`NULL`, when `mode: 'notnull'`). Use for "show me the missing-data rows" or
the inverse.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### PatternFilter

[Filter](#filter) variant matching a column against a string pattern — `contains`,
`startsWith`, `endsWith`, or a regex. Case-insensitive by default; pass
`caseSensitive: true` to opt in.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### PointFilter

[Filter](#filter) variant matching rows where a column equals a single value.
Use for a dashboard drill-down where the user clicked one bar of a histogram.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### Portal Target

Where body-portalled UI (modals, dropdowns, tooltips) is appended. Defaults to
`document.body`; override via `createDataTable({ portalTarget })` when the table
lives inside a shadow root, a scroll-locked dialog, or a route-scoped mount.
The [ModalHost](#modalhost) observes the host for theme changes so portals stay
in sync with the owning table's [Color Scheme](#color-scheme).
See: [Theming](./guides/theming.md) · [API reference](./api-reference.md)

### Preset

Informal shorthand for [FilterPreset](#filterpreset) throughout the
documentation and UI copy ("Save preset", "Load preset", "Presets"). The
concrete type is `FilterPreset`; the manager is
[FilterPresetManager](#filterpresetmanager).
See: [Filter presets](./guides/filter-presets.md)

### RangeFilter

[Filter](#filter) variant matching rows where a numeric, date, or time column
falls within `[min, max]`. Bounds are inclusive; `null` on either side means
unbounded.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### RawSQLFilter

[Filter](#filter) variant carrying a user-authored SQL `WHERE` fragment.
Powerful escape hatch for constraints the other filter types cannot express
(window functions, correlated subqueries, `JOIN` conditions). Validated by the
worker before application; malformed SQL surfaces as a `SQLValidationError` on
the `error` event. Use `quoteIdentifier` / `formatSQLValue` (both root exports)
to build the fragment safely.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### Reconciliation

The async process that rebuilds DuckDB VIEWs and re-validates dependent
filters / sorts whenever a [Derived Column](#derived-column) is added,
removed, or edited. Reconciliation is what keeps the UI consistent when a
user renames a derived column that a saved [Preset](#preset) references.
See: [Derived columns](./guides/derived-columns.md)

### `__rowid__` (synthetic row id)

A reserved `BIGINT` column the loader synthesizes on every CSV / JSON /
Parquet source as `row_number() OVER () - 1` (0-indexed). Stable across
sort, filter, and derived-column add / remove — only a fresh load
reassigns it. Hidden from the rendered grid by default (toggle with
`actions.showColumn('__rowid__')`) and excluded from default exports
(opt-in via the export-dialog "Include system columns" checkbox or by
explicit `columns: ['__rowid__', …]`). Sources that already contain a
column named `__rowid__` reject with `LoadError('RESERVED_COLUMN_NAME')`.
The constant is exported as `ROWID_COLUMN`; the row-id type is `RowId =
number`. Both [annotations](#annotation) and the read-only
`actions.getColumnValues` API key on this column for app-side row
alignment. `getColumnValues('__rowid__')` returns a `BigInt64Array`;
convert with `Number(rowIds[i])` before passing back as a `rowId: number`.
See: [`actions.getColumnValues`](./api-reference.md#column-values-read-only-export) · [Annotations](./guides/annotations.md) · Source: `src/core/types.ts`, `src/worker/loaders/`

### Scroll-Space Compression

How [Virtual Scrolling](#virtual-scrolling) keeps the scrollbar honest past
browser height limits. The scroll spacer is written as
`min(totalRows × rowHeight, 15,000,000 px)` — browsers silently clamp
element heights (Blink/WebKit at ≈33,554,431 px, Gecko at ≈17,895,697 px),
so an uncapped spacer would break first. Below the cap (~468,750 rows at the
default 32 px) physical and virtual scroll positions coincide and behavior
is identical to an uncapped spacer. Above it, a dual-mode mapping translates
between the two spaces: wheel-scale deltas move the virtual position
linearly for native feel, thumb-scale jumps map proportionally across the
full range, and exact reconciliation at the top and bottom edges keeps the
first and last rows reachable — the scrollbar stays correct to 50M+ rows.
The cap (`maxVirtualHeight`, primarily a test hook) is reachable only by
constructing a `VirtualScroller` from `/advanced`, not through
`createDataTable`.
See: [Architecture](./concepts/architecture.md#virtual-scroller) · Source: `src/table/VirtualScroller.ts`

### SessionSnapshot

The JSON document written to the [SessionStore](#sessionstore) by
[AutoSave](#autosave). Captures [Filters](#filter), sort columns, column
visibility / order / widths / pinning, hidden-column metadata, and
[Derived Column](#derived-column) definitions (with pooled vector payloads).
Distinct from [StateSnapshot](#statesnapshot) — `SessionSnapshot` is the
serialised form used for persistence; `StateSnapshot` is the in-memory form
used for undo/redo.
See: [Session persistence](./guides/session-persistence.md) · Source: `src/persistence/types.ts`

### SessionStore

The persistence layer. Default implementation wraps IndexedDB keyed by
[Instance ID](#instance-id); callers can inject any object implementing the
`SessionStore` contract (save / load / delete) via
`createDataTable({ sessionStore })` to back up to `localStorage`, a remote API,
or a cloud sync tier. Degrades gracefully in private-browsing / no-IDB
environments.
See: [Session persistence](./guides/session-persistence.md) · Source: `src/persistence/SessionStore.ts`

### SetFilter / NotSetFilter

Companion [Filter](#filter) variants. `SetFilter` matches rows where a column
value is in a set of allowed values; `NotSetFilter` matches rows where it is
_not_ in a set of excluded values. Used for categorical "select many" UIs and
their inverses.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### Signal

Reactive primitive that holds a mutable value and notifies subscribers on
change. Underpins `TableState` — every public field (`filters`, `sortColumns`,
`visibleColumns`, …) is a signal that UI components read and `actions.*`
methods write. Batched writes use `batch(() => { … })` to coalesce notifications.
See: [State model](./concepts/state-model.md) · [Architecture](./concepts/architecture.md) · Source: `src/core/Signal.ts`

### SQL editor primitives

Building blocks (Tier-2, `@jeyabbalas/data-table/advanced`) for assembling
a CodeMirror SQL editor _outside_ the data table — for filter-preset
composers, derived-column wizards, query-template forms.
`createSqlExtensions(context, options?)` returns a CodeMirror
`Extension[]` carrying the PostgreSQL grammar, the schema/function
autocomplete _source_, and (optionally) the library's theme;
`buildCompletionContext(columns, options?)` normalizes any column-like
array into the [`CompletionContext`](#completioncontext) shape. Function
autocomplete defaults to the curated 176-entry `DUCKDB_FUNCTION_DETAILS`
list (see [DuckDBFunctionInfo](#duckdbfunctioninfo--duckdbfunctioncategory))
— `options.functions` overrides; `[]` disables (does _not_ fall through).
The bundled `CodeMirrorExpressionEditor` uses the same primitives
internally for the in-table case. The helper ships the autocomplete
_source_, not the autocomplete UI — hosts must add `autocompletion()`
from `@codemirror/autocomplete` themselves
(`src/sql-editor/extensions.ts:156-158`). Live-schema refresh uses
CodeMirror `Compartment.reconfigure()` so undo history, focus, and
scroll position survive schema swaps.
See: [SQL editor primitives](./guides/sql-editor-primitives.md) · [API reference](./api-reference.md#sql-editor-primitives) · Source: `src/sql-editor/extensions.ts`, `src/sql-editor/duckdbFunctionDetails.ts`, `src/sql-editor/theme.ts`

### StateSnapshot

The lightweight in-memory capture of user-manipulable view state (filters,
sorts, column order / widths / pinning, derived columns) used by
[UndoManager](#undomanager). Stores values in their native
[Signal](#signal) formats — distinct from [SessionSnapshot](#sessionsnapshot),
which is the serialised JSON form used for persistence.
See: [State model](./concepts/state-model.md) · Source: `src/core/UndoManager.ts`

### StatsPanelCoordinator

Filter-broadcast coordinator for [`BaseStatsPanel`](#basestatspanel)
instances. Composed by `createDataTable`; subscribes to `state.filters` and
calls `panel.updateFilters(filters)` on every registered, non-destroyed
panel whenever the filter array changes. Parallels
[`CrossfilterCoordinator`](#crossfilter) for visualizations, and is a
sibling rather than a hook on it because a stats panel can exist for a
column with no visualization (e.g. `uuid`). Stamps a monotonic
`filterSequence` per broadcast and short-circuits per-panel
`updateFilters()` calls whose tag has been superseded — without this the
base-class default's last-write-wins on `this.options.filters` could land
stale data on a panel mid-fan-out. Bounded fan-out
(`DEFAULT_PANEL_CONCURRENCY = 4`) keeps panel-issued queries from flooding
the single-threaded worker on wide tables. Exposed at `/advanced` for
power users orchestrating panels manually outside the facade.
See: [Architecture concepts](./concepts/architecture.md#stats-panel-coordination-statspanelcoordinator) · Source: `src/visualizations/StatsPanelCoordinator.ts`

### StatsPanelRegistry

Per-instance registry of [`BaseStatsPanel`](#basestatspanel) subclasses
scoped by `DataType`. Mirrors [`VisualizationRegistry`](#visualizationregistry)
for the column-stats slot. Empty by default; when no registration matches a
column's type, the library falls back to `formatDefaultStats` (the built-in
HTML two-line display). Pass via `createDataTable({ statsPanelRegistry })`;
the module-scoped `defaultStatsPanelRegistry` is the implicit fallback when
omitted (also empty by default — register on it to share custom panels
across every table that doesn't specify its own registry). Same-name
re-register replaces; `priority` resolves multi-match ties (descending). To
restrict by column **name** rather than type, subclass and override
`create()` (same pattern as `examples/08-custom-visualization`'s
`StateAwareRegistry`). Public exports: `StatsPanelRegistration` (the
registration record) and `StatsPanelConstructor` (the constructor signature
type).
See: [Stats panels](./guides/stats-panels.md) · Source: `src/visualizations/StatsPanelRegistry.ts`

### TableState

The root reactive store — a record of [Signals](#signal) holding every piece
of user-manipulable view state: filters, sort columns, column visibility,
widths, pinning, hidden-column metadata, derived columns, selection. Exposed
as `table.state` for _reads_; mutations go through `table.actions`.
See: [State model](./concepts/state-model.md) · Source: `src/core/State.ts`

### UndoManager

The undo/redo history stack on `/advanced`. Stores up to 50
[StateSnapshots](#statesnapshot) by default; `captureSnapshot()` / `applySnapshot()`
bridge between `TableState` signals and the snapshot shape. Instantiated
automatically by `createDataTable({ undoRedo: true })` (default).
See: [State model](./concepts/state-model.md) · Source: `src/core/UndoManager.ts`

### VectorColumnDef

A [Derived Column](#derived-column) definition whose values are supplied as a
pre-computed array matching the row order. Useful when a column's value comes
from JavaScript logic (a geocoding lookup, a cached ML score) that DuckDB SQL
cannot express. The library registers the vector as a DuckDB table function
internally; it behaves like any other column afterwards.
See: [Derived columns](./guides/derived-columns.md) · Source: `src/derived/types.ts`

### Virtual Scrolling

Rendering only the rows that fit the scroll viewport rather than the whole
result set. `VirtualScroller` measures `clientHeight` on the internal
`.dt-body-scroll` container and renders
`⌈clientHeight / rowHeight⌉ + 2 × bufferRows` rows — `bufferRows` is 5 above
and below, and is reachable only by constructing a `VirtualScroller` from
`/advanced`, not through `createDataTable`. The DOM row count stays constant
regardless of dataset size, and rows arrive in aligned blocks of
`fetchBlockSize` rows (default 128) fetched with a `LIMIT` of the block size
— via a [`__rowid__`](#__rowid__-synthetic-row-id) range predicate instead
of `OFFSET` when the view is unsorted and unfiltered — which is what keeps
multi-million-row tables interactive. Rows whose block has not arrived yet
render as placeholders; fetched blocks land in a row cache capped at
`rowCacheRows` rows (default 2048). Block size, cache size, and
direction-aware prefetch are tunable via the `createDataTable` options
`fetchBlockSize`, `rowCacheRows`, and `prefetch`. Assumes a fixed `rowHeight`
(default 32 px) and requires the [Mount Container](#mount-container) to have
a bounded height; measured against a content-sized container the visible
range becomes every row under the
[Scroll-Space Compression](#scroll-space-compression) cap and the
optimisation silently disappears.
See: [Sizing the container](../README.md#sizing-the-container) · [Architecture](./concepts/architecture.md#virtual-scroller) · [Performance](./performance.md) · Source: `src/table/VirtualScroller.ts`, `src/table/TableBody.ts`

### Visualization

A per-column summary widget — histogram, date histogram, value-counts bar,
time histogram — rendered in the column header. Implements `BaseVisualization`
(on `/advanced`); participates in [Crossfilter](#crossfilter) via
`fetchData()`. Custom visualizations are registered through
[VisualizationRegistry](#visualizationregistry). Created **lazily**: an
instance exists only while its column header is at or near the viewport, its
data survives across destroy/recreate as a snapshot, and the `vizReady` event
(or `table.whenVizReady()`) reports when the wave visible at load has
finished fetching.
See: [Visualizations](./guides/visualizations.md) · Source: `src/visualizations/BaseVisualization.ts`, `src/visualizations/VizDataController.ts`

### VisualizationRegistry

Per-instance registry for [Visualizations](#visualization). Construct via `new
VisualizationRegistry()` and pass to `createDataTable({ visualizationRegistry })`,
or use `defaultVisualizationRegistry` for a shared default across tables.
Replaces the deprecated static `VisualizationFactory` (still reachable on
`/advanced` for backwards compatibility).
See: [Visualizations](./guides/visualizations.md) · Source: `src/visualizations/VisualizationRegistry.ts`

### WorkerBridge

The RPC layer between the main thread and the DuckDB Web Worker.
Promise-based (`initialize()`, `loadData()`, `query()`,
`exportToBuffer()`, `clearQueryCache()`, `dropTable()`,
`terminate()`); supports abort signals, progress callbacks, and query
caching. One bridge can be shared across multiple `DataTable` instances via
`createDataTable({ bridge })` to keep a single DuckDB context for all tables on
a page.
See: [Multi-table dashboards](./guides/multi-table.md) · [CSP and offline deployments](./guides/csp-and-offline.md) · Source: `src/data/WorkerBridge.ts`
