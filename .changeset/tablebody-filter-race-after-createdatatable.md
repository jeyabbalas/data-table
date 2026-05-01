---
'@jeyabbalas/data-table': patch
---

Fix: filters added immediately after `await createDataTable(...)` no longer briefly render unfiltered rows.

`TableBody.fetchRows` had no way to drop late-arriving results when state changed mid-fetch. The body's initial unfiltered SELECT (kicked off during `initialize()`) could land in `rowDataCache` *after* `invalidateCacheAndRefresh()` had cleared it, and `checkNeedsFetch` would then short-circuit because the cache appeared "full" — leaving the unfiltered rows on screen with no follow-up filtered query to correct them.

- `fetchRows` now bumps a monotonic `fetchSequence` on entry and re-checks it after the worker resolves; superseded results are dropped *before* they touch `rowDataCache`. The same counter is bumped in `invalidateCacheAndRefresh` and `destroy()` so cache invalidation and teardown both win against any in-flight fetch.
- `fetchRows` now returns `boolean` — `true` when fresh rows landed, `false` when the fetch was dropped (superseded, no table, no visible columns, or destroyed). `fetchAndRender` skips the immediate render on `false` because the `finally` block has already queued a follow-up fetch that will paint the correct result.

Symptom this fixes: code that does `const t = await createDataTable({ source }); t.actions.addFilter(...)` could see the unfiltered dataset render briefly before being replaced — and on some interleavings the filtered re-fetch was skipped entirely, so the unfiltered rows stayed on screen.
