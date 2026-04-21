# Glossary

Alphabetical reference for the domain terms used across `@jeyabbalas/data-table`.
Each entry links to the guide or concept doc where the term is covered in depth.

For an end-to-end API reference see [api-reference.md](./api-reference.md); for
grouped walkthroughs see the [guides](./README.md#guides-task-oriented) and
[concepts](./README.md#concepts-deep-dives) indices.

---

### AutoSave
Opt-in helper that writes a [`SessionSnapshot`](#sessionsnapshot) to a
[`SessionStore`](#sessionstore) on a debounce timer and on `visibilitychange` /
`beforeunload`. Enabled by default when `persistence: true`; can be constructed
manually from `/advanced` for apps that manage their own save cadence.
See: [Session persistence](./guides/session-persistence.md) · Source: `src/persistence/AutoSave.ts`

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

### Computed
A read-only reactive primitive derived from one or more [Signals](#signal).
Recomputes lazily when a dependency changes and caches the result until the
next invalidation. Used throughout `TableState` for derived views like
filtered-row counts; not exposed at the root entry.
See: [State model](./concepts/state-model.md) · [Architecture](./concepts/architecture.md) · Source: `src/core/Signal.ts`

### Crossfilter
The coordination pattern in which a click on one visualization installs a
filter that every *other* visualization immediately respects. The library
implements this via a `CrossfilterCoordinator` (on `/advanced`) that drives
`fetchData()` across registered visualizations whenever the active filter set
changes.
See: [Visualizations](./guides/visualizations.md) · [Architecture](./concepts/architecture.md) · Source: `src/visualizations/CrossfilterCoordinator.ts`

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
A short unique string stamped on every `DataTable` instance. Prefixes the
DuckDB catalogue names, the [IndexedDB](./guides/session-persistence.md) keys,
and the CSS custom-property scope (`[data-dt-instance="<id>"]`) so multiple
tables on the same page do not collide. Auto-generated; override via
`createDataTable({ instanceId })` when persistence keys need to be stable
across reloads.
See: [Multi-table dashboards](./guides/multi-table.md) · [API reference](./api-reference.md)

### ModalHost
Shared primitive (on `/advanced`) that every modal and side panel uses:
focus-trap, Escape to close, scroll-lock (modals only, reference-counted),
focus-restore to the opener, and stack-index-aware z-indexes. `ModalHost` is
what lets the SQL filter modal, the derived-column editor, the export dialog,
and the preset panel coexist without fighting over focus or layering.
See: [Architecture](./concepts/architecture.md) · Source: `src/table/ModalHost.ts`

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
*not* in a set of excluded values. Used for categorical "select many" UIs and
their inverses.
See: [Filters](./guides/filters.md) · Source: `src/filters/FilterTypes.ts`

### Signal
Reactive primitive that holds a mutable value and notifies subscribers on
change. Underpins `TableState` — every public field (`filters`, `sortColumns`,
`visibleColumns`, …) is a signal that UI components read and `actions.*`
methods write. Batched writes use `batch(() => { … })` to coalesce notifications.
See: [State model](./concepts/state-model.md) · [Architecture](./concepts/architecture.md) · Source: `src/core/Signal.ts`

### StateSnapshot
The lightweight in-memory capture of user-manipulable view state (filters,
sorts, column order / widths / pinning, derived columns) used by
[UndoManager](#undomanager). Stores values in their native
[Signal](#signal) formats — distinct from [SessionSnapshot](#sessionsnapshot),
which is the serialised JSON form used for persistence.
See: [State model](./concepts/state-model.md) · Source: `src/core/UndoManager.ts`

### TableState
The root reactive store — a record of [Signals](#signal) holding every piece
of user-manipulable view state: filters, sort columns, column visibility,
widths, pinning, hidden-column metadata, derived columns, selection. Exposed
as `table.state` for *reads*; mutations go through `table.actions`.
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

### Visualization
A per-column summary widget — histogram, date histogram, value-counts bar,
time histogram — rendered in the column header. Implements `BaseVisualization`
(on `/advanced`); participates in [Crossfilter](#crossfilter) via
`fetchData()`. Custom visualizations are registered through
[VisualizationRegistry](#visualizationregistry).
See: [Visualizations](./guides/visualizations.md) · Source: `src/visualizations/BaseVisualization.ts`

### VisualizationRegistry
Per-instance registry for [Visualizations](#visualization). Construct via `new
VisualizationRegistry()` and pass to `createDataTable({ visualizationRegistry })`,
or use `defaultVisualizationRegistry` for a shared default across tables.
Replaces the deprecated static `VisualizationFactory` (still reachable on
`/advanced` for backwards compatibility).
See: [Visualizations](./guides/visualizations.md) · Source: `src/visualizations/VisualizationRegistry.ts`

### WorkerBridge
The RPC layer between the main thread and the DuckDB Web Worker.
Promise-based (`initialize()`, `load()`, `query()`, `export()`,
`terminate()`); supports abort signals, progress callbacks, and query
caching. One bridge can be shared across multiple `DataTable` instances via
`createDataTable({ bridge })` to keep a single DuckDB context for all tables on
a page.
See: [Multi-table dashboards](./guides/multi-table.md) · [CSP and offline deployments](./guides/csp-and-offline.md) · Source: `src/data/WorkerBridge.ts`
