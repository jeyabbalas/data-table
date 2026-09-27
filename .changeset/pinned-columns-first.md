---
'@jeyabbalas/data-table': patch
---

### Fixed

- Showing a hidden column no longer puts it in front of a column pinned while it was hidden. It went back next to the neighbours it had when hidden; if one of them had been pinned since, the restored column landed before the pinned block, the pinned divider cut through it, and `aria-colindex` stopped ascending along the header row (3, 1, 4). An unpinned column now goes after the pinned columns, and a pinned one back to its place in pin order among them.
- A column shown back next to its old neighbours also moves there in `columnOrder` when a reorder since then had filed it elsewhere, so `visibleColumns` always follows `columnOrder`. `aria-colindex` is numbered from `columnOrder` and could descend after such a show.
- Pinning or unpinning a column changes `pinnedColumns`, `columnOrder` and `visibleColumns` in one update. A `pinnedColumns` subscriber no longer sees the pinned column outside the pinned block, and a `TableBody` used directly no longer fetches its rows again on a pin change.
- `toggleColumnPin` ignores a column name the table does not have. It pinned it and added it to `columnOrder`, where the phantom shifted every later column's `aria-colindex`. A stale pinned name is unpinned without being added.
