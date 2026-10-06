---
'@jeyabbalas/data-table': minor
---

### Fixed

- A session restore, an undo and a redo apply the name rule an added derived column does. A derived column named as a column of the table in any letter case, as a column restored before it, or as `__rowid__`, is not brought back: a console warning gives a `DerivedColumnError` coded `DUPLICATE_NAME`, and the filters, sort and layout saved for it are dropped.
  - **Before:** the VIEW renamed such a column, `Total` beside `total` to `Total_1`, and every read of `"Total"`, the grid's included, returned `total`'s values. A derived `Total` saved on one file and restored on another that has a column `total` did this, and so did a 0.8 session that holds `LABEL` beside `label`.
- A derived column that a restore, an undo or a redo cannot bring back no longer takes a base column of the same name out of the grid. Its filters, sort, order, width and visibility were dropped by name, so a column of exactly that name in the new data stayed in the schema but left the column order and the visible columns, and lost its width.
- An undo or a redo that cannot bring a derived column back drops the filters, sort and layout it had, as a session restore already did.

### Added

- `DerivedColumnManager.restoreColumns(defs, columnNames?)` (`/advanced`) takes the names of the table's own columns, and skips a derived column named as one of them, ignoring ASCII letter case, with the `DUPLICATE_NAME` warning.
