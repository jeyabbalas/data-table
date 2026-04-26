---
'@jeyabbalas/data-table': patch
---

Phase 2 — public API & packaging audit. Locks the published surface ahead of subsystem deep-dives in later phases.

**Packaging**

- Advertise `dist/advanced.cjs` via `package.json#exports["./advanced"].require` so Node CommonJS consumers (`require('@jeyabbalas/data-table/advanced')`) actually resolve. The CJS file was already emitted by `vite build` but was unrouted — a latent `ERR_PACKAGE_PATH_NOT_EXPORTED` for any CJS consumer of the advanced surface.
- `tsconfig.build.json` now sets `stripInternal: true`, so JSDoc-tagged `@internal` symbols (e.g., `__resetModalHostForTests`) are dropped from emitted `.d.ts` declarations.

**Documentation surface**

- Resolved every typedoc warning (`docs:api:check` goes from 20 warnings → 0). Internal types referenced by public types but never publicly exported (`Signal`, `Computed`, `HistogramColors`, `AnnotationBase`, `EventCallback`) are listed in `typedoc.json#intentionallyNotExported`. Cross-tier `{@link}` references that typedoc cannot resolve (e.g., `{@link DataTable}` from a `/advanced` symbol) were swapped for plain backtick text following the precedent set in Phase 1. The `@media (prefers-color-scheme: dark)` reference in `dataTableTheme`'s JSDoc was wrapped in backticks so it renders as code instead of being parsed as a JSDoc tag.
- Backfilled JSDoc on every top-level public symbol that was missing or thin: `VERSION`, the per-filter shape interfaces (`RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`, `RawSQLFilter`), `Filter`, `FilterType`, `ColumnSchema`, `SortDirection`, `SortColumn`, `Strings`, `TableEvents`, `DataTableErrorOptions`, `DataFormat`, `LoadResult`, `LoadOptions`, `LoadDataResult`, `QueryCacheOptions`, `FilterPreset`, `FilterPresetCollection`, `SerializedRangeFilter` / `SerializedPointFilter` / `SerializedSetFilter` / `SerializedNotSetFilter` / `SerializedFilter`, `defaultStrings`, `DUCKDB_FUNCTIONS`, `DUCKDB_FUNCTION_DETAILS`, `dataTableTheme`, `dataTableHighlighting`, plus class-level docs on every `/advanced` class (`EventEmitter`, `AnnotationStore`, `AutoSave`, `CrossfilterCoordinator`, `StatsPanelCoordinator`, `VisualizationFactory`, `Histogram` / `DateHistogram` / `TimeHistogram` / `IntervalHistogram` / `ValueCounts`, `InteractionManager`, `FilterPanel` / `FilterPresetPanel` / `SQLFilterModal`, `DerivedColumnEditPanel` / `DerivedColumnModal` / `DerivedColumnManager` / `DefaultExpressionEditor` / `AddColumnButton`, `ExportDialog`, `AnnotationPopover`, `ColumnHeaderTooltipPopover`, `KeyboardNavigator`, `VirtualScroller`).

**New exports**

- Root entry (`@jeyabbalas/data-table`): `LoadDataResult`, `QueryCacheOptions` (referenced by the existing `WorkerBridge.loadData` and `WorkerBridgeOptions.cache`); the per-filter `Serialized*` union members (`SerializedRangeFilter`, `SerializedPointFilter`, `SerializedSetFilter`, `SerializedNotSetFilter`) plus `DateWrapper` so consumers round-tripping individual filters can name the shape directly instead of indexing into `SerializedFilter`.
- `/advanced`: `BrushCapable`, `SelectionCapable` (the capability markers that compose `InteractiveVisualization`), `LoadJSONOptions` (`AnnotationStore.loadJSON` parameter shape), `ListenerErrorHandler` (`EventEmitter` constructor parameter shape).

All additions are type-only; the runtime keys exposed by `Object.keys(rootModule)` and `Object.keys(advancedModule)` are unchanged, so the existing `tests/api-surface.exports.test.ts` deny / allow lists and the snapshot at `tests/__snapshots__/api-surface.snapshot.test.ts.snap` are still green without modification.

**Source-only deduplication**

- Removed the duplicate `ExpressionColumnDef` / `VectorColumnDef` re-exports in `src/persistence/types.ts`; `SerializedDerivedColumnDef` now references the canonical declarations from `src/derived/types.ts` directly. The original interfaces remain exported from the root entry.
- Replaced the local `ContainerColorScheme` type in `src/table/TableContainer.ts` with a type-only import of the public `ColorScheme` from `src/DataTable.ts`. The two were structurally identical; consolidation removes a duplicate name from the public `.d.ts` surface.

**Bundle-size budgets**

- New `size-limit` dev dependency (`size-limit` + `@size-limit/file`) gates the brotli-compressed size of every published artifact. Phase 2 baselines (raw → brotli) were captured at 2026-04-26 and budgets were set with ~10–15 % headroom so unrelated peer churn does not trip the gate. Run `npm run size` locally; Phase 9 will tighten the caps and wire size-limit into CI.

**No runtime behavior changes.** Tests: 2693 → 2946 (+253). `npm run docs:api:check`: 20 → 0 warnings.
