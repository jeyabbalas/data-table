---
'@jeyabbalas/data-table': patch
---

### Fixed

- `filterChange` now fires as soon as the filtered row count is known, instead of waiting for every column chart to refetch, which took seconds on a 10M-row table.
