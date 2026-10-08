---
'@jeyabbalas/data-table': patch
---

Scrolling deep into a sorted or filtered table no longer runs DuckDB out of memory, and an interval column sorts by duration.

- Scrolling deep into a sorted or filtered table no longer runs DuckDB out of memory. Each block of rows used to be fetched by sorting every visible column down to the block's position, so DuckDB held all the rows above it in full; halfway down a sorted 5-million-row, 40-column table that exceeded the browser's WASM memory limit and the rows never loaded. The table now sorts only the sort columns and row ids to find the block, then reads that block's rows, which takes under a second at that size. Scrolls still slow down with depth when sorted or filtered.
- Sorting the grid by an interval column now orders rows by duration. While the column was displayed, the grid sorted it by its text, so `100 days` came before `9 days`.
