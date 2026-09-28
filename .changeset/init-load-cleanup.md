---
'@jeyabbalas/data-table': patch
---

### Fixed

- A `createDataTable({ source })` whose load fails no longer leaves the table behind. It used to reject with the table still mounted in the container and, when it had created them, its worker running and its session store open, and the caller never got a handle to `destroy()` them. It now tears the table down as `destroy()` would, then rejects with the load's error. A `bridge` or `persistence.sessionStore` passed in stays open, though a table the load created in that bridge is dropped. The container is left ready for another `createDataTable`.
