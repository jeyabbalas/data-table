---
'@jeyabbalas/data-table': patch
---

### Fixed

- Header histograms no longer show "No data" before their first query returns. Every histogram built at load, or as its column scrolled into view, showed it until its data arrived, which on a large table could take seconds. A chart's area now stays blank until its data lands, and "No data" appears only for a column with no values.
- A histogram whose query fails now stays blank, as value counts already did, instead of showing "No data". The error still reaches the `error` event with `source: 'visualization'`.
