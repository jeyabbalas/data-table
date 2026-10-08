---
'@jeyabbalas/data-table': patch
---

A filter's row count no longer waits behind queued chart queries, exports are named after their table instead of the derived columns' VIEW, and `Strings` gains two messages.

**Added**

- `Strings` gains `derived.nameReserved(name)`, the message for a new column name that spells `__rowid__`, and `statistics.otherSegmentLabel`, the label drawn inside a value-count bar's "Other" segment, which was always English.

**Fixed**

- Above the 15,000,000 px height cap (about 470,000 rows at 32 px), moving the cursor with `↑`, `↓`, `PageUp` or `PageDown` onto a partly shown row next to the top or bottom edge of the table left it partly out of view, by up to a row height, until the next key.
- The row count of a filter change no longer waits behind the chart and stats queries queued before it. On a 10M-row table, a filter added while Clear all's charts rebuilt took up to 7 s to show its count; it now takes about a second.
- The derived-column panels and the extract panel refused `__ROWID__` with `A column named "__rowid__" already exists`. They now say the name is reserved for the synthetic row id, as `addDerivedColumn` does.
- An export of a table with derived columns was named after their VIEW, `__dt_view_<table>___export.csv`. It is now named after the table, `<table>_export.csv`.
