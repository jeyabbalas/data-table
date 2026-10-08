---
'@jeyabbalas/data-table': patch
---

A column width under 50 px is drawn 50 px wide, which keeps the cells after it in line with their headers.

**Changed**

- A column width under 50 px is drawn 50 px wide, the same minimum as resizing by drag or keyboard. Only `setColumnWidth` or a restored session can set such a width. A cell cannot be narrower than its padding and border, so a smaller width took more room than it said. With rows rendering only some columns, that left the cells after it out of line with their headers.
