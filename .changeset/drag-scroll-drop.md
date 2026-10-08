---
'@jeyabbalas/data-table': patch
---

A column dragged by its handle drops where the pointer is after the table scrolls beneath it.

- A column dragged by its handle now drops where the pointer is after the table scrolls beneath it. Wheeling or swiping sideways with the button held takes a column somewhere out of view; letting go without moving the pointer used to drop it where the pointer had been before the scroll, usually right back where it started. The drop indicator now stays under the pointer as the headers scroll, including in a table inside a shadow root.
