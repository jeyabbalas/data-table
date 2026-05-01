---
'@jeyabbalas/data-table': patch
---

Fix: histograms and value-counts no longer paint with stale aggregates when an in-flight fetch is superseded.

The no-filter branch of `fetchData` in `Histogram`, `DateHistogram`, `TimeHistogram`, `IntervalHistogram`, and `ValueCounts` assigned `this.data = await fetch...()` *before* running its post-await `seq !== this.fetchSequence || this.destroyed` guard. A stale result therefore wrote into `this.data`, repainted the canvas, and was only corrected when the newer fetch completed — producing a visible flash of outdated bins or category counts.

Each subclass now stores the awaited result in a local variable, runs the guard, and only mutates `this.data` if the fetch is still current. This matches the existing guard already in place on the filtered branch and mirrors the `filterSequence` pattern in `CrossfilterCoordinator`.

Symptom this fixes: rapidly toggling filters that hit a column's histogram (or value-count chart) caused a brief flash of outdated bin counts or category aggregates before the latest query corrected the canvas.
