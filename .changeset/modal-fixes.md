---
'@jeyabbalas/data-table': patch
---

### Fixed

- The SQL filter modal shows its Remove section when it edits an expression filter. The stylesheet hid the section in both modes, and opening a filter for editing only cleared an inline style, so the modal never offered Remove; the filter's chip was the only way to remove it. The section is also `hidden` outside edit mode, so a table with a class prefix of its own never shows it when creating a filter.
- Closing the SQL filter modal after editing a filter gives focus back to the filter bar's Expression button. Focus used to drop to the page: the filter's chip, which opened the modal, takes no focus, and updating or removing the filter rebuilds it. `SQLFilterModal.openForEdit()` takes an optional `returnFocus` for hosts that open it themselves.
- Delete confirmations keep keyboard focus in their dialog, in the SQL filter modal, the derived-column editor and the filter-preset panel. The Remove or Delete button hides itself to show the confirmation, which took focus with it to the page, where `Tab` and `Escape` no longer reached the dialog. Focus now moves to the confirmation's Cancel or No, and back to Remove or Delete if you cancel, or if deleting a derived column fails.
- Two tables on one page no longer share the radio buttons of their dialogs. The export dialog's format and scope, and the derived-column modal's mode, were named after the class prefix alone, and radio buttons that share a name form one group across the page: adding the second table's export dialog, with its defaults checked, unchecked the first's, which then opened with no format or scope checked. Each dialog now names its radio groups after its table's instance id. An export dialog or derived-column modal constructed without an `instanceId` generates its own, for its element ids too.
