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

### Fixed

- `AbortSignal` leak on the worker-bridge abort path:
  `signal.removeEventListener` is now called on every resolved / rejected /
  aborted query, and on bridge teardown for any in-flight request.
- `AutoSave.enable()` is idempotent — repeat calls no longer stack
  `visibilitychange` / `beforeunload` listeners.
- `ColumnResizer` clears its `transitionend` fallback `setTimeout` on detach
  so abandoned animations don't fire against removed elements.

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
