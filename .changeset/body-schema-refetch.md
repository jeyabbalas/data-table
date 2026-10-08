---
'@jeyabbalas/data-table': patch
---

A `TableBody` used without `TableContainer` refetches its rows when the schema changes, so an edited derived column no longer shows its old values.

- A `TableBody` used without `TableContainer` (from `/advanced`) fetches its rows again when the schema changes. Editing a derived column's expression used to leave the values fetched before it on screen.
