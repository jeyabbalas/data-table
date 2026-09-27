---
'@jeyabbalas/data-table': patch
---

### Fixed

- A `TableBody` used without `TableContainer` (from `/advanced`) fetches its rows again when the schema changes. Editing a derived column's expression used to leave the values fetched before it on screen.
