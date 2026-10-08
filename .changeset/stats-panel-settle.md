---
'@jeyabbalas/data-table': patch
---

A smooth sideways scroll builds custom stats panels only once the view has held still for 150 ms, not for every column it passes.

**Fixed**

- A smooth sideways scroll no longer builds a custom stats panel for every column it passes. The scroll to a derived column just added, across a 1,000-column table, built about 500 panels, and the charts at the far end waited more than 10 seconds behind their queries. A panel is now built once the columns near the view have held still for 150 ms. A column that scrolls away still loses its panel at once.

**Changed**

- While a column's panel waits to be built, its stats slot shows the table-wide row count, and its chart keeps its stats out of the slot. The panel's first `update()` receives them, and `setHoverStats()` the detail the chart shows then, such as a committed selection's. The slot no longer shows the chart's stats just before the panel replaces them.
- A column that leaves the view's reach gets its stats slot back as it is without a panel, its chart's stats or the table-wide count, instead of whatever the destroyed panel left.
