---
'@jeyabbalas/data-table': patch
---

Fix: filters issued right after `await createDataTable(...)` no longer race visualization init, and recycled placeholder rows no longer render with empty trailing cells.

Two coupled fixes that both protect the post-`createDataTable` window when header visualizations are attached:

- **Visualization first-paint barrier.** `attachVisualizations` now collects the initial `fetchData` promises from every visualization (via a new `BaseVisualization.waitForData(): Promise<void>`) and from both coordinators' `syncExistingFilters` calls (now `Promise<void>`-returning). `loadDataImpl` awaits `Promise.all([tableContainer.whenBodyReady(), pendingVizInit])` before emitting `loadComplete`, so a consumer's `addFilter` issued synchronously after `await createDataTable(...)` can no longer race viz init or land while a coordinator's filter-sync is still in flight.
- **Placeholder row shape mismatch.** `TableBody.rowElementMap` could hold two structurally incompatible row shapes — full data rows (`visibleColumns.length` cells) and 1-cell loading placeholders. When a placeholder was promoted in place via `updateRowContent`, the loop's `min(columns, cells)` bound only rendered column 0, leaving columns 1..N empty and stripped of event listeners. `renderVisibleRows` now detects the cell-count mismatch, swaps in a fresh pool element with the correct shape, and refuses to return placeholder-shaped rows to the pool so they cannot contaminate later renders.

Symptom this fixes: with header visualizations enabled, an `addFilter` issued synchronously after `await createDataTable(...)` could be silently ignored or applied against stale viz state. Separately, when a brush change rapidly grew the visible row count (e.g. 4 → 64), the new rows showed only the first column with empty space across the rest until the next render pass.
