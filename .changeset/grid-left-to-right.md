---
'@jeyabbalas/data-table': patch
---

### Changed

- The table's grid is laid out left to right on a right-to-left page too. Pinned columns, keyboard scrolling and sideways scrolling all place columns by their left offsets, which a right-to-left grid reversed. Right-to-left layouts are still not supported; text inside cells is unaffected.
