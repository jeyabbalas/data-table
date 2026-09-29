---
'@jeyabbalas/data-table': patch
---

### Fixed

- `createDataTable`'s documentation now says what it does with `source`: it awaits that first load, and the first fetches of its rows and of the charts in view, and rejects with the load's error if the load fails, without tearing down the table it mounted. The API reference and AGENTS.md said the initial load was not awaited. The `tableName` and `sourceFormat` options now say they apply to `source` only, and the docs that recommend loading with `loadData()` instead pass them to it.
- The loading guide's rules for string sources: a string is fetched when it looks like a URL or path (a scheme, `//`, `/`, `./` or `../`), loaded inline when it spans lines or starts with `[` or `{`, and otherwise rejected with `SOURCE_AMBIGUOUS`. It said any string not starting with `http` was parsed as CSV or JSON.
- The loading guide's `ProgressInfo` details: `percent` runs 0–100 (it said 0–1), and the worker's stages are `reading`, `parsing` and `indexing` (it listed `analyzing` too).
