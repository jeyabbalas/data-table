---
'@jeyabbalas/data-table': patch
---

### Fixed

- The SQL filter modal shows its Remove section when it edits an expression filter. The stylesheet hid the section in both modes, and opening a filter for editing only cleared an inline style, so the modal never offered Remove; the filter's chip was the only way to remove it. Removing it from the keyboard now keeps focus in the modal: the confirmation hides the Remove button, and focus moves to the confirmation's Cancel, and back to Remove if you cancel, instead of dropping to the page, where `Escape` no longer closed the modal.
- Two tables on one page no longer share the radio buttons of their dialogs. The export dialog's format and scope, and the derived-column modal's mode, were named after the class prefix alone, and radio buttons that share a name form one group across the page: adding the second table's export dialog, with its defaults checked, unchecked the first's, which then opened with no format or scope checked. Each dialog now names its radio groups after its table's instance id, or after an id of its own when constructed without one.
