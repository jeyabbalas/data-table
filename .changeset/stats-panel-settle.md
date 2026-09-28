---
'@jeyabbalas/data-table': patch
---

### Fixed

- A smooth sideways scroll no longer builds a custom stats panel for every column it passes. The scroll to a derived column just added, across a 1,000-column table, built about 500 panels, and the charts at the far end waited more than 10 seconds behind their queries. A panel is now built once the columns near the view have held still for 150 ms. A column that scrolls away still loses its panel at once.

### Changed

- While a column's panel waits to be built, its chart keeps its stats out of the stats slot, and the panel's first `update()` receives them. The slot no longer shows the chart's stats just before the panel replaces them.
