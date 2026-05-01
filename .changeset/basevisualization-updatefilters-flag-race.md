---
'@jeyabbalas/data-table': patch
---

Fix: overlapping `BaseVisualization.updateFilters` calls no longer leave the brush / selection overlay desynced from the chart's data.

`BaseVisualization` used a shared `isFilterUpdate` boolean to gate `syncVisualStateFromFilter`. When two `updateFilters` calls overlapped, the *first* call's `finally` block reset the flag to `false` while the *second* was still mid-await — so the second call's post-await read saw a stale `false` and skipped the brush / selection reset that should have happened for the latest filter state.

`updateFilters` now bumps a `filterUpdateSequence` counter on entry, captures the local sequence, and the `finally` block only clears `isFilterUpdate` when its captured sequence still matches the current counter. Older calls' `finally` blocks become no-ops, so the flag stays `true` across the entire overlap window and every concurrent call observes the correct value after its await.

Symptom this fixes: rapid brush-then-clear-then-brush gestures on a histogram (or any pattern that fired two `updateFilters` calls before the first resolved) could leave the brush rectangle painted on top of a chart whose underlying query had already moved on, so the visual selection no longer matched what was filtered in the table.
