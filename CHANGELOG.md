# Changelog

All notable changes to `@jeyabbalas/data-table` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project adheres to [Semantic Versioning](https://semver.org/).

Planned work and discussion lives in GitHub Issues under the
[`roadmap`](https://github.com/jeyabbalas/data-table/issues?q=is%3Aissue+label%3Aroadmap)
label. Releases with breaking changes also get a dedicated walkthrough under
[`docs/migration-guides/`](./docs/migration-guides/) alongside the entry below.

## [Unreleased]

### Added

- **Custom column-stats panels.** A new `BaseStatsPanel` abstract class
  (Tier-2, `@jeyabbalas/data-table/advanced`) plus a per-instance
  `StatsPanelRegistry` (Tier-1, root) lets downstream apps replace the
  library's built-in two-line stats display in a column header — the
  `.dt-col-stats` slot — with their own DOM and DuckDB queries. The
  registry is empty by default; when no registration matches a
  column's `DataType`, the library falls back to `formatDefaultStats`,
  so existing apps see no behavior change. Per-instance via
  `createDataTable({ statsPanelRegistry })`; the module-scoped
  `defaultStatsPanelRegistry` is the implicit fallback when omitted.
  Lifecycle: `constructor(container, column, options)` → `update(stats:
  ColumnStatsData | null)` (called with `null` once on mount, then
  with each `ColumnStatsData` the column's visualization emits) →
  `updateFilters(filters: Filter[])` (called on every filter change
  before any subsequent `update` from a viz refetch; default
  implementation only refreshes `this.options.filters`) →
  `setHoverStats(html: string | null)` (HTML string from the
  visualization's hover snippet; default no-op) → `destroy()`. Panel
  options carry `{ tableName, bridge, filters, messages, onError }`;
  errors route through `onError(err, { source: 'stats-panel', column,
  phase: 'construct' | 'update' | 'hover' | 'fetch' | 'destroy' })`
  and are re-emitted on the facade's `error` event with `source:
  'stats-panel'` (a new discriminant in `TableErrorSource`). Tier-1
  exports: `StatsPanelRegistry`, `defaultStatsPanelRegistry`,
  `StatsPanelRegistration`, `StatsPanelConstructor`. Tier-2
  (`/advanced`): `BaseStatsPanel`, `StatsPanelOptions`,
  `StatsPanelErrorContext`, `StatsPanelErrorPhase`,
  `StatsPanelCoordinator`. The coordinator stamps a monotonic
  `filterSequence` on every broadcast and bounds fan-out to
  `DEFAULT_PANEL_CONCURRENCY = 4` so panel-issued queries don't
  flood the single-threaded worker on wide tables. Example 13
  (`examples/13-custom-stats-panel/`) demos numeric (`n · μ · σ`
  from a custom `AVG` / `STDDEV_POP` query) and categorical
  (`top: <value> (<pct>%)` from a `GROUP BY ... ORDER BY COUNT
  DESC LIMIT 1`) panels with the recommended per-panel `fetchSeq`
  stale-result guard.
- **Stable synthetic `__rowid__` + read-only column export.** A
  `BIGINT` `__rowid__` column is synthesized at load time on every CSV /
  JSON / Parquet source (`row_number() OVER () - 1`) and survives sort,
  filter, and derived-column add / remove. The column is reserved —
  loading a source that already contains `__rowid__` rejects with
  `LoadError('RESERVED_COLUMN_NAME')`. It is hidden from the grid by
  default and excluded from default exports unless the user ticks
  "Include system columns" in the export dialog. New
  `table.actions.getColumnValues(name, opts?)` returns a column as a
  typed JS array — `Int32Array` (INTEGER), `Float64Array` (FLOAT /
  DECIMAL), `BigInt64Array` (BIGINT including `__rowid__`), or
  `unknown[]` (strings / dates / booleans). Options: `scope: 'all' |
  'filtered' | 'selected'`, `limit`, `offset`, `signal`. Throws
  `QueryError` with `COLUMN_NOT_FOUND` / `INVALID_PAGINATION` /
  `NO_TABLE`. Public exports: `ROWID_COLUMN` constant,
  `RowId` type, `GetColumnValuesOptions` type. Example 10 (`examples/
  10-column-export/`) demos every option and the `BigInt64Array`
  ergonomics for `__rowid__`.
- **`actions.replaceDerivedColumn` with dependent re-validation.** A
  same-name replacement variant that pre-flight-validates every
  dependent against the proposed new definition and reports affected
  dependents on failure. Discriminated return: `{ success: true; info
  } | { success: false; error: DerivedColumnError }`. New error code
  `DEPENDENTS_INCOMPATIBLE` carries `details.dependentsAffected:
  string[]` and `details.reasons: Record<string, string>`. The
  `derivedChange` event payload widened to carry a `kind: 'added' |
  'removed' | 'replaced' | 'updated'` discriminator and the affected
  `columnName`. Use `replaceDerivedColumn` when an end-user edits an
  expression whose dependents you want to re-validate atomically;
  continue using `updateDerivedColumn` for renames.
- **`table.annotations` namespace — programmatic CRUD + JSON I/O +
  session persistence.** A new `AnnotationStore` exposed on
  `table.annotations` (constructed by `createDataTable`; the class
  itself lives on `/advanced`). Three scopes (`row` / `column` /
  `cell`) discriminated by `scope`, three severities (`error` /
  `warning` / `info`). Public surface: `add`, `addMany` (atomic),
  `update` (`scope` / `rowId` / `column` immutable), `get`, `getAll`,
  `getByRow`, `getByColumn`, `getByCell` (intersection sorted by
  severity → `createdAt` → insertion), `remove`, `removeMany`,
  `clear(scope?)`, `count`, `toJSON`, `loadJSON(file, mode?: 'replace'
  | 'merge')`, `on('change', handler)`, `setSeverityFilter`,
  `getSeverityFilter`. JSON file format documented at
  `docs/api-reference.md#annotation-json-format` with
  `ANNOTATION_FILE_VERSION = 1`; unknown top-level and per-annotation
  fields round-trip verbatim. Auto-persisted into
  `SessionSnapshot.annotations`; `SNAPSHOT_VERSION` bumped to 5
  (back-compat — pre-v5 snapshots load with empty store). New
  `AnnotationError` (codes `DUPLICATE_ID` / `NOT_FOUND` /
  `INVALID_SHAPE` / `VERSION_UNSUPPORTED`). Annotations live outside
  `TableState` and do **not** participate in undo/redo. Example 11
  (`examples/11-annotations/`) demos full CRUD, JSON round-trip,
  severity filter, and IndexedDB persistence.
- **Annotation rendering — row / cell / header tint + intersection
  popover.** DOM classes applied at render time:
  `dt-row--annotated`, `dt-cell--annotated`, `dt-header--annotated`
  with severity modifiers (`dt-*--annotation-error` / `-warning` /
  `-info`). Highest-severity-wins per element. Shared
  `AnnotationPopover` (single instance, anchored on hover / focus,
  dismissed on Escape / blur / scroll / click outside; `role="tooltip"`
  + `aria-live="polite"`) renders the `getByCell` intersection grouped
  by scope. Severity filter (`setSeverityFilter`) is a view concern —
  data is unchanged; the rendering layer reads the flags and hides
  non-matching annotations. CSS tokens: `--dt-annotation-{error,
  warning, info}-{fg,bg,bdr}` plus derived `-bg-hover` variants in
  light + dark; new z-index `--dt-z-annotation-popover: 55` between
  floating panels and CodeMirror autocomplete.
- **Programmatic column-header tooltip popover.** New
  `table.actions.setColumnHeaderTooltip(column, content | string |
  null)` and `getColumnHeaderTooltip(column)`. Structured content
  shape: `{ title?, description?, items?: Array<{ label, value:
  string | string[] }> }`. String shorthand normalises to `{
  description }`; `null` (or any input that normalises to empty)
  clears the override. Every text field is rendered via
  `.textContent` — HTML strings, DOM nodes, and render functions are
  not accepted. Persisted into `SessionSnapshot.columnHeaderTooltips`
  by default (legacy string entries from in-flight sessions are
  normalised on restore). Anchored on the column-name span (distinct
  DOM node from the annotation popover) with `tabindex="0"` added
  only when an override is set, so the keyboard tab order stays
  clean for tables that don't use the feature. New z-index
  `--dt-z-col-tooltip: 56` above the annotation popover. Public type
  exports: `ColumnHeaderTooltipContent`, `ColumnHeaderTooltipItem`.
  Tier-2 export (`/advanced`): `ColumnHeaderTooltipPopover`. Example
  12 (`examples/12-column-header-tooltips/`) demos rich, enum, string
  shorthand, clearing, the XSS-safety contract, and the recommended
  no-persistence pattern (`persistence: false`).
- **Typed error model and event bus.** A new `DataTableError` base class plus
  focused subclasses (`WorkerInitError`, `WorkerTerminatedError`, `QueryError`,
  `LoadError`, `SQLValidationError`, `DerivedColumnError`, `PersistenceError`,
  `ExportError`, `ConfigurationError`, `DestroyedError`). Every throw site
  across the library now raises one of these with a `SCREAMING_SNAKE_CASE`
  `code`, optional `details`, and native `Error.cause` chaining. `TableEvents`
  gains `error` (typed `DataTableError` + a `source` discriminator) and
  `warning` (`code` / `message` / `details`) events.
- **Lifecycle hardening.** `DataTable` exposes `isDestroyed()` and
  `isPersistenceActive()` getters. Post-destroy method calls now throw
  `DestroyedError`. `EventEmitter` isolates listener errors via an optional
  `onListenerError` hook and reroutes them through the `error` event with
  `source: 'listener'` so one throwing subscriber no longer breaks later ones.
  The `ready` event replays once per late subscriber so
  `const t = await createDataTable(…); t.on('ready', …)` always fires.
- **Worker configurability.** `WorkerBridgeOptions` gains `workerFactory`,
  `workerUrl`, and `duckdbBundles`. Strict-CSP (`worker-src 'self'`) and
  air-gapped embedders can now self-host the worker script and DuckDB WASM
  bundles without patching the library.
- **`/advanced` subpath entry.** Lower-level building blocks (low-level state,
  table/filter/derived-column UI components, export helpers, visualization
  internals, persistence snapshot serializers, `AutoSave`, and the deprecated
  `VisualizationFactory` wrapper) are re-exported from
  `@jeyabbalas/data-table/advanced`. Most consumers should stay on the root
  entry; reach for `/advanced` only when the `createDataTable()` facade does
  not expose what you need. API-surface snapshot test
  (`tests/api-surface.snapshot.test.ts`) and explicit Tier-1 / Tier-2 / Tier-3
  guards (`tests/api-surface.exports.test.ts`) lock the exported symbol list;
  future changes require intentional snapshot updates.
- **`VisualizationRegistry`.** Per-instance visualization registry (via
  `createDataTable({ visualizationRegistry })`) replaces the global
  `VisualizationFactory` registration pattern. `defaultVisualizationRegistry`
  is available for apps that still want a shared default across tables.
- **Modal & panel infrastructure.** Shared `ModalHost` primitive (exported
  from `/advanced`) drives every modal and panel: focus trap, Escape to
  close, scroll lock (modals only, reference-counted), focus restore to the
  opener, and stack-index-aware z-indexes. New CSS variables
  `--dt-z-modal-stack-step` (layer step between simultaneous modals) and
  `--dt-panel-width` (filter / preset / derived-column panel width).
- **Grid accessibility.** `role="grid"` on the root with live
  `aria-rowcount` / `aria-colcount`; `role="columnheader"` / `row` /
  `gridcell` with `aria-sort` / `aria-rowindex` / `aria-colindex`;
  `aria-selected` on selected rows; roving `tabindex`; keyboard navigation
  (arrow keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter on
  header sorts, Enter on cell selects); a polite `aria-live` region
  announcing filter / sort / row-count changes. `axe-core` runs in the
  test suite.
- **Programmatic color scheme.** New `colorScheme?: 'light' | 'dark' | 'auto'`
  option on `createDataTable` and `DataTable.setColorScheme()` /
  `getColorScheme()` methods. Dark-mode styles are dual-scoped across
  `@media (prefers-color-scheme: dark)` and
  `[data-dt-color-scheme="dark"]` attribute selectors; body-portalled modals
  observe the attribute via `MutationObserver` so they stay in sync when
  the theme flips while a modal is open. A new `<!-- dt-vars -->` auto-
  generated variable reference table in the README is kept in sync with
  `src/styles/` via `scripts/check-css-vars.mjs` (wired into `npm run build`).
- **Internationalization hook.** New `messages?: DeepPartial<Strings>` option
  on `createDataTable` overrides every user-facing string (button labels,
  placeholders, `aria-label` copy, live-region templates, stats formatters).
  `defaultStrings` and `mergeStrings` are exported for consumers who want to
  build a fallback chain. No locales bundled — ship your own.
- **Stylesheet presence detection.** New `isStylesheetLoaded(root?)` sync
  getter pairs with the `warning` event (`code: 'STYLESHEET_MISSING'`) — the
  getter is useful for pre-mount checks, the event for logging.
- **`filtersToWhereClause` re-exported from the root.** The canonical
  `Filter[] → SQL` converter (already used internally by every built-in
  visualization, stats computer, and the export path) is now part of the
  public API, alongside `quoteIdentifier` and `formatSQLValue`. Enables
  custom `BaseVisualization` subclasses to rescope against active filters
  in one line. Example 08 (custom choropleth) now demonstrates this:
  `fetchData()` composes `filtersToWhereClause(this.options.filters)`
  into its aggregation, so the map re-shades whenever filters change.
- **Browser feature detection.** New `checkBrowserSupport(): { supported,
  missing }` sync probe of `Worker`, `WebAssembly`, `indexedDB`,
  `ResizeObserver`, `BigInt`, and `structuredClone`. New
  `strictBrowserCheck?: boolean` option on `createDataTable` — when `true`,
  rejects with `WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`,
  `details.missing: string[]`) before touching the worker. Default remains
  best-effort init (real failures surface later via the `error` event).
- **Documentation — Phase 2 depth content.** Task-oriented guides under
  `docs/guides/` (loading data, filters, derived columns, events,
  visualizations, session persistence, theming, i18n, accessibility,
  multi-table, CSP/offline, filter presets), architecture and state-model
  concept docs under `docs/concepts/`, framework and bundler integration
  guides under `docs/integrations/` (React, Vue, Svelte, Solid, Next.js,
  Nuxt, Vite, Webpack, CDN), a methodology-first performance playbook at
  `docs/performance.md`, and a docs landing index at `docs/README.md`. New
  `llms.txt` at the repo root follows the [llmstxt.org](https://llmstxt.org)
  convention for coding-agent indexing. Two new runnable examples —
  `09-multi-table` (shared `FilterPresetManager` + `SessionStore` across
  instances) and `10-filter-presets` (save / load / export / import
  preset JSON). README's theming section trimmed to a summary + link;
  the complete `--dt-*` CSS variable reference (60 tokens with light /
  dark defaults side-by-side) now lives in `docs/guides/theming.md`, and
  `scripts/check-css-vars.mjs` validates sync against that file. AGENTS.md
  §9 Pointers expanded with links to every new guide, concept, and
  integration doc.

### Changed

- `ready` event now emits inside a microtask after `createDataTable()`
  resolves, and replays exactly once per late subscriber so the event is
  no longer missed by `const t = await createDataTable(...); t.on('ready',
  …)`.
- `EventEmitter` wraps each listener in try/catch so one throwing
  subscriber no longer blocks the rest.
- The `ConfigurationError` subclass now surfaces option-validation failures
  (`code: 'OPTIONS_INVALID'`) that previously threw plain `Error`s.
- `derivedChange` event payload widened (additive) — now carries
  `kind: 'added' | 'removed' | 'replaced' | 'updated'` and an optional
  `columnName: string` alongside the existing `derivedColumns` array.
  Existing handlers that only read `derivedColumns` keep working.
- `SNAPSHOT_VERSION` bumped from 4 → 5 to accommodate the new
  `annotations` and `columnHeaderTooltips` fields. Back-compat — older
  snapshots load with empty `annotations` and absent
  `columnHeaderTooltips`, no error.

### Fixed

- `AbortSignal` leak on the worker-bridge abort path:
  `signal.removeEventListener` is now called on every resolved / rejected /
  aborted query, and on bridge teardown for any in-flight request.
- `AutoSave.enable()` is idempotent — repeat calls no longer stack
  `visibilitychange` / `beforeunload` listeners.
- `ColumnResizer` clears its `transitionend` fallback `setTimeout` on detach
  so abandoned animations don't fire against removed elements.
- **Stats-panel filter-broadcast race.** `StatsPanelCoordinator` now
  stamps a monotonic `filterSequence` per broadcast and short-
  circuits per-panel `updateFilters()` calls whose tag has been
  superseded, so a fresh filter change can no longer land stale
  data on a panel mid-fan-out (the base-class default's last-write-
  wins on `this.options.filters` previously made this possible). The
  `setHoverStats` contract is also tightened: the argument is an
  **HTML string** (the same pre-formatted markup the library's
  built-in panel renders in place of line 2); the bundled
  `Histogram` / `ValueCounts` visualizations escape every user-
  derived value before producing it, and custom visualizations are
  responsible for escaping any user-derived text before passing it
  to `onStatsChange`.

### Changed (breaking)

- **Post-destroy method calls now throw `DestroyedError`.** Previously
  silent no-ops; now they throw. Framework-integration cleanup paths should
  either `await table.destroy()` in the unmount handler or guard with
  `if (!table.isDestroyed()) …` — see the README's "Framework integration"
  section.
- **`getDefaultBridge()` removed.** Migrate to `new WorkerBridge()`
  (optionally share via `createDataTable({ bridge })`).
- **Static `VisualizationFactory` deprecated.** Still exported from
  `/advanced` for source-compatibility; migrate to `VisualizationRegistry`
  (per-instance) or `defaultVisualizationRegistry` (shared default). The
  static wrapper will be removed in a future minor.
- **Root entry pruned.** The public surface (`@jeyabbalas/data-table`) now
  exports only the facade, typed error classes, essential types, and a
  small set of power-user hooks. Tier-2 symbols moved to
  `@jeyabbalas/data-table/advanced`. Tier-3 implementation internals
  (`createSignal` / `computed` / `batch`, `PerfMonitor`, `QueryCache`,
  `DataLoader`, schema / type-inference / pattern-detection helpers,
  `filterToSQL` / `filtersToWhereClause`, crossfilter splitter,
  state-snapshot serializers, progress formatters, worker message types,
  and others) were removed from the public surface entirely.
- `quoteIdentifier` and `formatSQLValue` remain public at the root —
  elevated from their previous classification so consumers authoring raw
  SQL (for example the downstream data-quality rule authoring app) have a
  stable, safe helper instead of re-implementing identifier/literal
  escaping.
- Legacy `DataTableOptions` interface removed from `src/core/types.ts` —
  it was unused by the façade. Use `CreateDataTableOptions` instead.

### Migration

- `import { EventEmitter, StateActions, createTableState, UndoManager,
  TableContainer, FilterBar, ExportDialog, AutoSave, BaseVisualization,
  ... } from '@jeyabbalas/data-table'`
  → update the specifier to `'@jeyabbalas/data-table/advanced'`.
- Tier-3 symbols are no longer exported. If you relied on one, please file
  an issue describing the use case so it can be re-evaluated.
- `import { getDefaultBridge } from '@jeyabbalas/data-table'` →
  `import { WorkerBridge } from '@jeyabbalas/data-table'; const bridge =
  new WorkerBridge(); await bridge.initialize();`. Pass the bridge into
  `createDataTable({ bridge })` if you want to share one across tables.
- `VisualizationFactory.register({ … })` →
  `defaultVisualizationRegistry.register({ … })` for the shared default, or
  construct a per-instance registry and pass it via
  `createDataTable({ visualizationRegistry: new VisualizationRegistry() })`.
- Framework cleanup code relying on post-destroy silent no-ops should call
  `if (!table.isDestroyed()) await table.destroy()` in the unmount handler
  (React `useEffect` return, Vue `onBeforeUnmount`).

## [0.1.0]

Initial prerelease.
