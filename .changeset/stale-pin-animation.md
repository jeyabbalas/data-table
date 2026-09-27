---
'@jeyabbalas/data-table': patch
---

### Fixed

- The first time a column was hidden, shown or moved after scrolling sideways, every column header slid in from where it was when the data loaded. The pin animation's saved positions are now used only by the change that saved them.
