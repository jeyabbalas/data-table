---
'@jeyabbalas/data-table': patch
---

Visualizations & stats hardening (review-plan Phase 6).

- All five `BaseVisualization` subclasses (`Histogram`, `DateHistogram`,
  `TimeHistogram`, `IntervalHistogram`, `ValueCounts`) now route
  `fetchData` failures through `options.onError({ stage: 'fetch' })`
  instead of swallowing them with `console.error`. The facade re-emits
  these as `error` events with `source: 'visualization'`. The empty-canvas
  rendering after error is unchanged. See
  `docs/migration-guides/phase-6-viz-fetch-error-routing.md` for the
  consumer-side impact (consumers branching on the `error` event will
  start seeing fetch failures they could previously only observe in the
  developer console).
- Added ~85 new test cases across 9 new files + 3 extensions:
  histogram math correctness against real DuckDB (numeric, date /
  timezone-stable, time, interval), value-counts top-N + "Other" cap with
  high cardinality, `BaseVisualization` lifecycle / in-flight destroy /
  onError contract, registry tie-break determinism, full fall-through to
  `PlaceholderVisualization`, `CrossfilterCoordinator` filter-flow
  integration, `StatsFormatters` line-2 edge cases.
- Strict-TS slice cleanup for `src/visualizations/` + `src/statistics/`:
  `noPropertyAccessFromIndexSignature` (4 sites in
  `IntervalHistogramData.ts`) and `noUncheckedIndexedAccess` (~146 sites)
  are now clean for the slice. Both flags remain disabled globally; the
  remaining slices land in Phases 7 / 8 / 9.
