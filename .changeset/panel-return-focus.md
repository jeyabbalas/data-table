---
'@jeyabbalas/data-table': patch
---

### Fixed

- Closing a filter panel or a derived-column editor gives focus back to the header button that opened it for the column it shows. After switching the panel to another column by clicking that column's button, focus used to go back to the first column's button, which could be far out of view.
