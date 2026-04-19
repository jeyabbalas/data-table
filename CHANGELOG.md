# Changelog

All notable changes to `@jeyabbalas/data-table` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- New subpath entry `@jeyabbalas/data-table/advanced` exposing lower-level
  building blocks (low-level state store, table/filter/derived-column UI
  components, export helpers, visualization internals, persistence snapshot
  serializers, `AutoSave`, and the deprecated `VisualizationFactory`
  wrapper). Most consumers should stay on the root entry; reach for
  `/advanced` only when the `createDataTable()` facade does not expose what
  you need.
- API-surface snapshot test (`tests/api-surface.snapshot.test.ts`) and
  explicit Tier-1 / Tier-2 / Tier-3 guards (`tests/api-surface.exports.test.ts`)
  lock the exported symbol list; future changes require intentional
  snapshot updates.

### Changed (breaking)
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

## [0.1.0]

Initial prerelease.
