---
'@jeyabbalas/data-table': patch
---

Fix: `await createDataTable({ source })` and `await table.loadData(...)` now resolve only after the first table-body paint completes.

Previously the public load promise resolved as soon as `loadDataImpl` returned, which happened *before* the body's `initialize()` chain settled. The first SELECT was therefore still in flight when consumer code resumed after the `await`, so any action issued in that window (most visibly an `addFilter`) raced the unfiltered first fetch — and could be undone by the unfiltered result landing afterwards.

- `TableContainer` now tracks `currentBodyInit: Promise<void>` (capturing each `TableBody.initialize()` chain, with a `.catch` that swallows transient body-init errors so they don't reject the public load promise) and exposes `whenBodyReady(): Promise<void>`.
- `DataTable.loadDataImpl` awaits `tableContainer.whenBodyReady()` before emitting `loadComplete`, with a final `if (this.destroyed)` guard so a torn-down table fails loudly rather than leaking events to detached subscribers.
- `TableBody.initialize` reorders work — subscribe to state first, run the manual `handleScroll` (when data is present), *then* attach the virtual scroller's `onScroll` callback. Stops the scroller's auto-fired callback from racing the first manual fetch during `initialize`'s own await.

This strictly tightens the existing timing contract — consumers can now rely on the first paint having happened by the time `await` returns. Callers that did not depend on the previous (looser) timing are unaffected.

Symptom this fixes: code that did `const t = await createDataTable({ source }); t.actions.<...>` could observe the table empty for a few hundred ms after the await, and any actions issued in that window raced the first SELECT — most visibly, filters added before the body's initial fetch landed could be undone by the unfiltered result.
