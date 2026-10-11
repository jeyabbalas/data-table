# Scaling lessons from `feat/large-scale-support`

Maintainer notes, not user documentation. They distill Phases 0–5 of the first attempt at large-dataset
support, archived at tag `archive/large-scale-support-v1` (commit `bfe1c09`, branched from `c326e9e`).
The archive's `plans/scaling/STATUS.md` holds the full records; this page keeps what the next attempt
needs.

## Target

About 200M cells in any shape, Parquet first: up to ~1,000 columns × ~200K rows, or ~5M rows × a few
dozen columns. The first attempt aimed at 1,000 × 5M (5 billion cells, ~40 GB uncompressed), which no
user asked for and which only a direct-scan mode could reach.

The memory spike ([memory-envelope.md](./memory-envelope.md)) dropped the direct-scan mode: no target
shape needs one (revisit only above ~250M cells). The re-scoped plan drops three more pieces of the
first attempt: converting CSV sources to Parquet and the synthetic 1,000 × 5M TARGET tier, which
served the old target, and the Phase 8 selection model. Arrow IPC for row blocks is deferred until a
measured case needs it, though converting blocks to JS objects dominates their fetch time (below).

## Measured facts worth keeping

Reference machine: macOS, 10 cores, Chromium. "WIDE" is 1,000 columns × 60,000 rows; "DEEP" is 20
columns × 5,000,000 rows.

| Measurement                         | Main at `c326e9e`       | Archived branch                           |
| ----------------------------------- | ----------------------- | ----------------------------------------- |
| WIDE, charts on: queries at load    | 2,004                   | 20 (lazy charts)                          |
| WIDE, charts on: `loadData` resolve | 18.9 s                  | 3.7 s                                     |
| WIDE, charts on: one sort           | 10.5 s (upper bound)    | 0.45 s (lazy charts)                      |
| WIDE, charts off: one sort / filter | 392 / 381 ms            | 19 / 22 ms (column windowing + clipping)  |
| WIDE: DOM nodes under `.dt-root`    | ~52,000                 | ~1,000 (body + header windowing)          |
| WIDE, charts off: load              | 8.3 s                   | 4.1 s (single-pass load)                  |
| DEEP: load / sort / filter          | 11.2 s / 125 ms / 39 ms | 4.2 s load                                |
| One 128-row block, 1,000 columns    | 95 ms (every column)    | 11 ms (padded column window, Node DuckDB) |

- On main, 1,000 columns cost ~2 queries per column at load and again on every filter, hide, show
  and pin, because every chart is created eagerly and rebuilt on column changes. Charts dominate; DOM
  (~50 nodes per column) comes second.
- Deep unsorted scrolling already works at 5M rows. Sorted or filtered deep scrolling pays
  `LIMIT … OFFSET k`, which grows with depth.
- Converting a row block from Arrow to JS objects is 77% of its fetch time unclipped, and still 64–70%
  after clipping.
- In-memory footprint was **estimated** at ~1 GB per 100M cells and never measured in the worker. The
  default WASM heap is ~3.1 GiB. The test harness could not export 1,000 columns past ~85K rows in one
  Parquet row group, and loading was only ever validated at 60K × 1,000. Treat 200K × 1,000 as unproven
  until measured.

## Implicit contracts behind most defects

Phases 2–5 each found 6–11 defects after their suites were green. Almost all came from code relying on
one of these, usually without saying so:

1. **Every visible column has a live `ColumnHeader` in the DOM.** Focus rescue, filter and
   derived-column panels, tooltip popovers, `ColumnReorder` (reads headers from the DOM),
   `getColumnHeaders()`, stats panels and eager charts all assume it.
2. **Body cells are found by position** (`children[i]`, `:nth-child`), not by `data-column`.
3. **Related state is written in separate signal writes.** `toggleColumnPin` writes `pinnedColumns`
   before `columnOrder`, and `showColumn`'s restore index can put an unpinned column between pinned ones.
4. **Charts and stats panels hold per-instance state**, so creating and destroying them on scroll
   loses it unless something outside the instance keeps it. The archive's `VizDataController`
   snapshots chart data (a re-created chart issues no query) and the host restores brushes and
   selections; stats panels have no such seam and re-query DuckDB on every mount.
5. **`__rowid__` is `row_number() OVER ()` over a single-threaded scan.** A threaded (cross-origin
   isolated) build would make row identity depend on scan order.

## Checklist for any change to the column axis

Test each with the affected column scrolled out of view, and again after it scrolls back:

- Keyboard: arrows, Home/End, `Enter` (sort), `F2` control cycle, `Shift+F2` layout mode (resize,
  move, `Escape`), `aria-activedescendant` always resolving to a mounted element.
- Programmatic focus (`focusedCell` set directly) and hiding the column the cursor is on.
- Pointer: drag-reorder, including wheel-scrolling mid-drag; resize drag; double-click width reset.
- Pin and unpin, including hide → pin → show sequences; `aria-colindex` stays ascending.
- Open filter panel or derived-column editor with DOM focus inside it, then scroll its column away.
- Tooltips, annotations (cell, column, row) and custom stats panels on columns that mount mid-session.
- Charts: brush and selection survive a column scrolling away and back; charts appear during
  **smooth** scrolling, not only after a jump.
- Derived column add, edit (cached cells must refresh) and remove; undo and redo of each.
- A viewport that grows (sidebar collapse, window resize) recomputes what is rendered.

## Known defects in the archived code

Fix these when harvesting the corresponding piece:

- **Lazy charts:** the `IntersectionObserver` has only a 400 px `rootMargin` and no `threshold`, so a
  header crossing that edge during smooth scroll lands outside the 200 px create band, is skipped, and
  gets no further callback. Charts appear only after jumps. The test double emits callbacks a browser
  never sends. Also: stats panels are built and destroyed with no hysteresis (40 queries for a ±1 px
  wobble), `vizReady` can fire early on a second attach, `syncExistingFilters` runs twice per load,
  `loadMarks` uses page-global names, and the palette cache ignores runtime CSS-variable changes.
- **Load path:** type detection reads a 4,096-row head sample and converts with `TRY_CAST`, so later
  values that don't parse become NULL. The docs say so, but the load raises no warning. Caller-owned
  `ArrayBuffer`s are detached by the transfer; that was a deliberate, documented contract rather than
  a defect, so decide it again instead of inheriting it. BOM stripping is missing on the
  `ArrayBuffer`/`Blob` path. `memory_limit` is a hard-coded `'2.5GB'`.
- **Column windowing:** header and body each keep their own copy of the window, its widening and its
  index maps. Correctness depends on subscriber order and on every `scrollLeft` writer calling
  `refreshColumnWindow()`. Headers are created and destroyed at scroll speed.

## Measurement rules

- Measure DuckDB memory **inside the worker** (`duckdb_memory()`, the WASM memory size). The archive's
  `heapMB` read `performance.memory` on the main thread, which cannot see DuckDB.
- Use high-entropy data and realistic Parquet row groups (122,880 rows and ~1M). The archive's
  1,000 × 5M tier was 98% run-length filler.
- Drive browser tests with real input (wheel, pointer drag) as well as programmatic `scrollLeft`
  jumps.
- Chrome pauses `requestAnimationFrame` in a hidden tab, and the grid renders on rAF. Confirm
  `document.visibilityState === 'visible'` before believing a rendering failure.
- Default test runs assert machine-independent counts (queries, DOM nodes, observers). Keep wall-clock
  budgets behind the `RUN_*_PERF` gates.

## Process rules

- Validate the user need and measure the memory envelope before building mechanism.
- Merge each slice to main behind its tests; don't accumulate a long-lived branch.
- Plan one slice at a time. Keep a short findings log, reference symbols rather than line numbers, and
  keep plan references out of source comments.
- Write the feature-interaction tests (the checklist above) before the mechanism they protect.

## Annotations at a million (0.10.0)

Annotations had been tested at 10,000. Measured at 100,000 and 1,000,000 on
0.9.0's code, they were the slowest part of a table at the target shapes,
though nothing about them touched DuckDB:

| At 1M annotations (store: Node 22, M1 Pro) | 0.9.0                        | 0.10.0                |
| ------------------------------------------ | ---------------------------- | --------------------- |
| `addMany`                                  | 4.95 s                       | 0.77–0.88 s           |
| Heap per annotation                        | 572 B                        | 258 B                 |
| `getByCell` / `getByRow`, median           | 856 µs / 48 ms               | 2–2.6 µs / about 2 µs |
| `removeMany` of 100                        | 5.4 s                        | 0.38–0.45 ms          |
| `clear('all')`                             | `RangeError` from about 125K | 0.1 ms                |
| A save after a sort change                 | about 1.2 s (Node)           | 0.2–0.3 ms (Chromium) |

| At 100K annotations, a scroll step | 0.9.0 (Chrome, demo) | 0.10.0 (headless Chromium) |
| ---------------------------------- | -------------------- | -------------------------- |
| 10K rows × 1,000 columns           | 1.3 s                | 5.8 ms (4.7 ms with none)  |
| 10M rows × 9 columns               | 1.43 s               | 2.9 ms (2.2 ms with none)  |

The two harnesses differ (the 0.9.0 figures include the demo's dev server),
so read the ratio, not the milliseconds. At a million, the 0.10.0 scroll step
stays within 2 ms of the table with none. [Performance → Annotations at a
million](../performance.md#annotations-at-a-million) has the full tables.

What made them slow, and the rule each one gives:

1. **A per-cell renderer query must be O(1) in the store's size.** Every
   render asked the store for `getByRow`, `getByColumn` and `getByCell` per
   mounted cell, then filtered the arrays by scope and severity, and each
   lookup collected and sorted from an insertion-order array of the whole
   store. A 1,000-column table renders some 350 cells. The renderer now asks
   for an O(1), allocation-free summary per row, per column (cached per store
   revision) and per cell, and writes only the class tokens that differ. A
   change touches the rendered elements with its keys, an off-screen one none.
2. **One subscription per table, not per header.** The body and every
   column header subscribed to the store: 1,001 listeners per change on a
   1,000-column table, each re-reading its share. One `AnnotationOverlay` per
   table now routes each change to the parts it touches.
3. **Persistence must not re-clone unchanged data.** The session record
   carried `annotations.toJSON()`, so a filter, sort or width change cloned
   every annotation again a second later (104 ms per 100,000 in Chrome). The
   annotations now live in their own database, written only when the
   store's content is not what the session store last wrote or read.
   Telling is O(1): a token per content revision and table name, which a
   snapshot carries without the file; the file is built only when a write,
   or a custom store, reads it, and nothing keeps it after. Two databases
   cannot be written atomically, so the order makes up for it: the
   annotations first, then the session record naming them, with the record
   it named before as its fallback, then a cleanup. A reload restores the
   last annotations that landed.
4. **Know the platform's ceilings.** `push(...ids)` spreads its argument onto
   the stack and threw `RangeError` from about 125,000 ids; a V8 `Map` holds
   2²⁴ (about 16.7 million) entries; Chromium refuses an IndexedDB value over
   133,169,152 bytes (127 MiB), which a million annotations in one value
   pass; and V8 keeps a string built by concatenation as a rope of its parts
   for as long as it lives (264 bytes per 30-character id, against 56 flat).
5. **Removing must not renumber.** Removing one annotation spliced the
   insertion-order array and renumbered what followed it: 43 ms a remove at a
   million, 430 s for `clear('column')`. Insertion order is now the `Map`'s
   own, and a remove is O(1).
6. **Yield to the next task without a timer.** The grid's fetches, the row
   count, the stats panels, navigation and the chunked build of the
   annotated rows waited for the next task with `setTimeout(0)`, after a
   derived-column change or at the annotated filter's read gate. Chrome
   throttles a background tab's timers to one a second, and a chain of them
   to one a minute after five minutes hidden: a million-annotation session
   restored in a hidden tab with the annotated filter on waited about 18 s
   on them. They post to a `MessageChannel` instead (`src/core/nextTask.ts`),
   which is not throttled.

How it was held: a seeded model test runs random operations against a
brute-force model of the documented behaviour and compares every lookup,
summary, payload and `toJSON` after each; scan guards swap `Map` and `Set`
for counting subclasses to show a lookup, update or remove visits only what
it returns; the browser spec checks every rendered cell and header against
an in-page oracle built from `getAll()`. Default runs assert those counts,
and wall-clock budgets sit behind `RUN_ANNOTATION_PERF=1`, as above. Manual
checks ran in a hidden Chrome window, where a message-channel scheduler stood
in for `requestAnimationFrame`, so they timed script, style and layout but
not paint; the headless Chromium tables are the reference.

## Worth harvesting from the archive

- `f0b10d6`: the end of Phases 0–2 (harness, single-pass load, lazy charts). It merged into main
  without conflicts at 0.8.0 and does not depend on the column-windowing hooks.
- `src/table/ColumnWindow.ts` (window model, prefix sums) and `src/table/RowCache.ts`: pure and
  heavily tested.
- The `QueryCache` byte bound (`4b9bd9e`), with its fix in `dcf3300`: `estimateBytes` sampled only the
  head of a result.
- Role-based DOM lookups instead of positional ones (`803c0f3`, `38583b4`).
- The harness: `tests/fixtures/tiers.ts` (tier generators, cell oracle), `tests/budgets.ts`,
  `demo/perf.ts`.
- Ported to main in #115: `6b4d9b6` (`setOnFilterRemove` on every filter-removal path).
