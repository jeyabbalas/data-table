---
'@jeyabbalas/data-table': minor
---

Row fetches now `SELECT` the columns you can see. A 128-row block used to project every visible column — 1,001 of them on a 1,000-column table, drained out of Arrow row by row, structured-cloned across the worker boundary and cached whole, to paint the couple of dozen columns on screen. It now projects the rendered column window padded by one full span on each side, and a horizontal scroll fetches what it exposes.

Measured against a real DuckDB on macOS, 128-row blocks over a 1,000-column table, with `conn.send()` (execution) timed apart from the batch drain (Arrow → JS materialization):

| Per block fetch      | Every column | Padded window | Typical window |
| -------------------- | ------------ | ------------- | -------------- |
| Columns projected    | 1,001        | 113           | 41             |
| Values per block     | 128,128      | 14,464        | 5,248          |
| Execution            | 22.3 ms      | 3.4 ms        | 1.6 ms         |
| Drain / serialization | 74.9 ms      | 7.5 ms        | 2.8 ms         |
| **Total**            | **97.2 ms**  | **10.9 ms**   | **4.5 ms**     |

In Chromium at 1,280 × 720 the widest `SELECT` list across a full horizontal sweep is 97 columns — the same number at 300 columns as at 1,000, where before it was 301 and 1,001. What a block fetch costs is now a function of the viewport, not of the schema.

Serialization is 63–77 % of a block fetch at every width, so clipping the projection cuts the dominant term rather than working around it.

**Changed**

- **A row fetch projects the padded visible column window, not every visible column.** The window is extended by one full span on each side and quantized outward to multiples of 16, so ordinary scrolling stays inside what is already cached — measured zero queries for a one-viewport horizontal move, one for a jump past the pad. Nothing about the SQL shape changed otherwise: the `__rowid__` fast path, the `ORDER BY` tiebreaker, `LIMIT`/`OFFSET` and the INTERVAL casts are all as they were.
- **A cell whose column has not arrived yet renders empty, marked `.dt-cell--pending` with `data-pending` and `aria-busy="true"`.** It is a real data row — `data-row-id`, annotations, selection and the cursor all keep working — with individual cells awaiting values. Whole-row `[data-placeholder]` still means what it meant: the row itself is not in hand. If you poll for "the grid has finished loading", select `[data-placeholder], .dt-cell[data-pending]` rather than the first alone.
- **`rowCacheRows` is a multiplier rather than a hard row cap.** The budget is `rowCacheRows × the columns the viewport currently needs`, counted in values. Below one window of columns — where a fetch covers everything visible — that is exactly `rowCacheRows` rows, unchanged. Above it, the same option no longer means 50× more memory on a 1,000-column table than on a 20-column one. No migration; the default is still 2048.
- **The grid chunk grew 79.52 → 80.87 kB brotli and the stylesheet 19.65 → 19.85 kB.** The coverage-tracking row cache, the fetch-set arithmetic, the per-cell pending markers and their one CSS rule — paid for by every table whether or not it is wide enough to benefit. The root entry is unchanged at 11.1 kB. Stated rather than absorbed, as the previous two releases did for theirs.
- No new options for any of this. The pad factor, the quantum and the coverage bookkeeping are internal.

**Added**

- `cache.maxBytes` on `bridgeOptions.cache`, default 33554432 (32 MiB). A companion bound to `maxEntries`, which cannot tell a 20-column result from a 1,000-column one — 100 entries is a few hundred KB on a narrow table and hundreds of MB on a wide one. Over budget, entries are dropped least-recently-used first; a result whose own estimate exceeds the budget is not stored rather than emptying the cache for it. `maxEntries` and the TTL are unchanged, and `maxEntries: 0` still disables caching entirely.

**Fixed**

- **`docs/performance.md` documented `bridgeOptions.cache: { size: 200 }`.** There is no `size` option and never was; the field is `maxEntries`, and `{ size: 200 }` silently did nothing.
