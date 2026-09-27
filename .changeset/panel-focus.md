---
'@jeyabbalas/data-table': patch
---

### Fixed

- Opening a filter panel now moves focus into it. The panel gave focus to its first control, the Clear button, which is hidden until the column has a filter; focusing a hidden button does nothing. Focus stayed on the header's filter button, and the next `Tab` skipped the panel entirely. Panels and dialogs now skip controls that a stylesheet hides, both for the first focus and for the focus trap.
- `Tab` no longer leaves an open filter panel. The panel ends with the null filter's three radio buttons, and the browser stops on a radio group once. The focus trap waited for focus on the group's last radio, where `Tab` never lands, so `Tab` from the group walked out of the panel. Any dialog with a radio group at either end had the same gap.
