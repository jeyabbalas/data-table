---
'@jeyabbalas/data-table': patch
---

Column headers no longer slide in from their load-time positions the first time a column is hidden, shown or moved after a sideways scroll.

- The first time a column was hidden, shown or moved after scrolling sideways, every column header slid in from where it was when the data loaded. The pin animation's saved positions are now used only by the change that saved them.
