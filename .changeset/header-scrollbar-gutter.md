---
'@jeyabbalas/data-table': patch
---

### Fixed

- The column header now scrolls exactly as far as the body. The header keeps a gap beside it for the body's vertical scrollbar, and the gap was a fixed 17px whatever the scrollbar measured. Overlay scrollbars (the macOS default) take no width, and neither does a table with too few rows to scroll, so the header's viewport was up to 17px narrower than the body's (2px with classic 15px scrollbars). At the far right the last header was cut off, and moving the keyboard cursor onto a header at the right edge left part of it hidden. A scrollbar wider than 17px did the opposite: the header could not scroll as far as the body and pulled it back, so the last few pixels of the table could not be reached. The gap now matches the body's scrollbar as measured, before the first paint, so `--dt-scrollbar-width` no longer has a visible effect.
