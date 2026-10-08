---
'@jeyabbalas/data-table': patch
---

After two quick filter changes, charts and their row counts show the second change's filters, not the first's.

- After two filter changes in quick succession, such as **Clear all** and a new filter, a column chart and its row count could keep the first change's filters until the next one. A filter change's chart refetches that are still waiting for their turn are now dropped once a newer change starts, as the stats panels' already were.
