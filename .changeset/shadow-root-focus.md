---
'@jeyabbalas/data-table': patch
---

### Fixed

- In a table mounted inside a shadow root, the panels and dialogs keep `Tab` inside them and give focus back to the control that opened them. They took the focused element from `document.activeElement`, which there is the shadow root's host, so `Tab` jumped to a panel's first control every time and `Shift+Tab` to its last, and closing one gave focus back to nothing inside the table. The filter, preset and derived-column panels, the SQL filter and the export dialog all did this.
