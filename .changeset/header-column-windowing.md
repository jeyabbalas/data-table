---
'@jeyabbalas/data-table': minor
---

The header row renders only the columns you can see. It now carries the pinned columns, the columns whose pixel span intersects the horizontal viewport, and the same two presentational spacers the body already used — from the same window model, so the two axes cannot disagree about where a column starts. With the body windowed in this release and the header windowed alongside it, the whole grid pays for a viewport rather than for a schema.

Measured on macOS in Chromium at 1,280 × 720, against the body-windowed build that preceded it:

| Metric (300 columns × 20,000 rows)       | Before | After                     |
| ---------------------------------------- | ------ | ------------------------- |
| Elements under `.dt-root`                | 11,136 | 970 at rest, 1,511 peak   |
| Column headers in the DOM                | 300    | 17 at rest, 28 mid-scroll |
| DuckDB queries per keyboard column move  | 2      | 0                         |
| Canvases at load under `{ eager: true }` | 300    | 17                        |
| Queries at load under `{ eager: true }`  | 604    | 38                        |
| `dt:load:total`                          | ~1.1 s | 854 ms                    |

| Metric (1,000 columns × 60,000 rows) | Before | After |
| ------------------------------------ | ------ | ----- |
| Elements under `.dt-root`            | 36,356 | 970   |
| Column headers in the DOM            | 1,000  | 17    |

The two "after" columns are the same "after" column. 17 headers and 970 elements at 60 columns, at 300, and at 1,000 — what the grid costs is now a function of the viewport on both axes, and of the column count on neither.

Signal subscriptions flattened with it. Every header used to register seven of its own — `sortColumns`, `totalRows`, `pinnedColumns`, `filtersByColumn`, `visibleColumns`, the tooltip signal and the annotation store — so a wide table's fan-out grew with its column count, and a horizontal scroll sweep churned hundreds of registrations in and out as headers mounted and unmounted. The container now holds one subscription per signal and fans it out to the mounted headers: `sortColumns` went from 305 subscribers at 300 columns and 1,005 at 1,000 — every one of them notified on every sort — to 5 at both, unchanged by an eight-stop horizontal sweep.

**Changed**

- **Column headers for horizontally off-screen columns are not in the DOM.** Anything selecting a header by `[data-column="…"]`, counting `.dt-col-header`, or reading `TableContainer.getColumnHeaders()` sees the mounted window, not one entry per column. Scroll the column into view first — `TableBody.getColumnSpan(column)` gives you where to scroll to, and `TableContainer.refreshColumnWindow()` makes both axes' elements for a freshly written `scrollLeft` exist synchronously. See **Migration** below.
- **The header row carries two presentational spacer children**, the same `div.dt-col-spacer[data-col-spacer="left"|"right"]` elements the body rows use: `role="presentation"`, `aria-hidden="true"`, not `.dt-col-header`. Header row children are `[pinned headers][left spacer][window headers][right spacer]`.
- **Three columns get extra reach, up to ten columns past the window.** It is widened to cover the keyboard cursor's column, any header holding real DOM focus, and the column of an open Shift+F2 layout gesture, so an ordinary scroll does not destroy the element focus was sitting on. The ten-column cap is deliberate — a cursor parked far off screen must not drag its neighbourhood into the DOM — and past it the grid degrades rather than breaks: `aria-activedescendant` is removed rather than left naming a missing element, and real focus is moved to `.dt-grid` before its header is detached, so keyboard navigation continues instead of dying on `<body>`.
- **Hiding, showing, pinning and reordering a column no longer rebuild the header row.** It is reconciled keyed by column name, so a surviving column keeps the very same element, and with it its chart, its listeners, its open popover and its stats panel. A column move costs one `insertBefore` and two attribute writes rather than a teardown and a rebuild — and, because a survivor's chart container identity does not change, no visualization queries at all.
- **A custom stats panel's lifetime is its header's too.** `BaseStatsPanel` subclasses were constructed once per applicable column and destroyed only on a schema change or table destroy; they are now constructed when their column's header mounts and `destroy()`d when it unmounts. A panel holding expensive per-instance state should move it into a cache keyed by column name — the same advice `exportDataSnapshot()` already gives visualizations.
- **A visualization's lifetime is its header's.** A chart is created when its column's header mounts and destroyed when the header unmounts, so scrolling past a column reclaims its canvas instead of leaving it live off screen. `visualizations: { eager: true }` still means "do not wait for the visibility gate", but the columns it applies to are the mounted ones — an eager load on 300 columns builds the ~17 charts on screen, not 300.
- **`aria-colcount` and `aria-colindex` are unchanged in meaning and now ascend in DOM order.** A windowed header row reports a gapped, non-1-based `aria-colindex` run against an `aria-colcount` of the full schema length, which is what the ARIA grid pattern prescribes for a partially rendered row. Verified with axe-core in both jsdom and a real browser, including `aria-required-children`.
- **The horizontal scroll extent, and every header's x-position, are unchanged at every offset.** The spacers sum to exactly the width of the headers they replace.
- **The grid chunk grew 76.95 → 78.99 kB brotli, and the root entry 10.86 → 11.12 kB.** That is the window arithmetic, the keyed reconcile and the incremental header refreshes, and every table pays it whether or not it is wide enough to benefit. Stated rather than absorbed, as the previous release did for its own 2.7 kB.
- No new options. The overscan, the window and the anchor set are internal.

**Changed** · **Migration**

- **Do not read the header DOM to learn what columns exist.** Code that walked `.dt-col-header` elements, or `getColumnHeaders()`, to enumerate columns, count them, or find one by name will now see only the mounted window and will be wrong on any table wider than a viewport. Read the state signals instead — `table.state.schema.get()` for every column in the table, `table.state.visibleColumns.get()` for the ones on the grid in order, `table.state.columnOrder.get()` for the full order including hidden columns — or listen for the `columnChange` event, which already carries all three. `getColumnHeaders()` remains the right call when you want the live elements, and its contract is now explicitly "the headers currently mounted".

**Fixed**

- **A header scrolled into view under an active filter showed the unfiltered row count.** With `visualizations: false` the stats line under a freshly mounted header was populated from the table-wide row count and only ever corrected on the next filter write, so a column scrolled in while a filter was active read `1,000 rows` where the rest of the row read `0 / 1,000 rows`. The count is now attached at mount, whether or not charts are enabled.

**Added**

- `TableContainer.refreshColumnWindow(): void` — recompute both axes' column windows and re-render whichever moved. Synchronous, so after writing `scrollLeft` yourself the headers and cells for the new offset exist before the next statement; cheap when nothing moved. On `@jeyabbalas/data-table/advanced`.
