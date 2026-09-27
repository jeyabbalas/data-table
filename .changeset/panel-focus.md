---
'@jeyabbalas/data-table': patch
---

### Fixed

- Opening a filter panel now moves focus into it. The panel gave focus to its first control, the Clear button, which is hidden until the column has a filter, and focusing a hidden button does nothing, so focus stayed on the header's filter button, outside the panel. With the hidden button counted as the panel's first control, `Shift+Tab` from the Close button also walked out of the panel. Panels and dialogs now skip controls that a stylesheet hides, using `checkVisibility()` where the browser has it and computed styles where it does not.
- `Tab` no longer walks out of an open filter panel from its last control. The panel ends with the null filter's three radio buttons, which the browser treats as one stop, at the checked radio. The focus trap waited for focus on the group's last radio instead, so from any other one `Tab` left the panel.
- Clearing a column's filter with the keyboard no longer drops focus out of the filter panel. The Clear button hides itself, and it took focus with it to the page, where `Escape` no longer closed the panel; focus now moves to the Close button first.
