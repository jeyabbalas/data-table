---
'@jeyabbalas/data-table': patch
---

### Fixed

- A column dragged by its handle now drops where the pointer is after the table scrolls beneath it. Wheeling or swiping sideways with the button held, to take a column somewhere out of view, and letting go without moving the pointer, dropped the column where the pointer had been before the scroll, usually right back where it started. The drop indicator also stays under the pointer as the headers scroll.
