---
'@jeyabbalas/data-table': patch
---

### Fixed

- The last column header is no longer cut off at the far right. The space kept beside the header for the body's vertical scrollbar was a fixed 17px, but overlay scrollbars (the macOS default) take no width, and neither does a table with too few rows to scroll. The header's viewport was then narrower than the body's by the difference, so the last header could not be scrolled fully into view, and moving the keyboard cursor onto a header at the right edge left part of it hidden. The space now matches the body's scrollbar as measured. `--dt-scrollbar-width` sets it only until the table has measured it.
