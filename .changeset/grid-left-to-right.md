---
'@jeyabbalas/data-table': patch
---

The grid is laid out left to right on a right-to-left page too, which keeps pinned columns and scrolling in place there.

**Changed**

- The table's grid is laid out left to right on a right-to-left page too. Pinned columns, keyboard scrolling and sideways scrolling all place columns by their left offsets, which a right-to-left grid reversed. On a page marked right to left with a `dir` attribute, each cell value and column name still takes its direction from its own text, as with `dir="auto"`. Right-to-left layouts are still not supported.
