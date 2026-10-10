---
'@jeyabbalas/data-table': minor
---

The hidden-columns gutter keeps its chips in one row that scrolls sideways, as the filter bar does, and both bars scroll to the chips a change adds.

**Changed**

- The hidden-columns gutter lays its chips out in one row that scrolls sideways once it is wider than the table, however many columns are hidden. It wrapped them onto rows, up to 200px of the table's height, so hiding a few dozen columns left the grid a row or two.
- Hiding a column whose chip lands out of view scrolls the gutter to it, smoothly. Columns hidden together, as code that hides them in a loop does, make one scroll, to the right-most of their chips. A filter added does the same in the filter bar. Under `prefers-reduced-motion: reduce` the row jumps instead.
- The filter bar scrolls only for a chip a filter adds. It glided to its end on every filter change, so changing or removing a filter took the bar away from the chip in hand.
- Both bars keep their buttons ("Show all"; "Clear all", "Expression" and "Presets") pinned at the end of the row, which scrolls beneath them. The buttons moved into the row's new scroller, `.dt-hidden-scroll` or `.dt-filter-scroll`, in a group, `.dt-hidden-actions` or `.dt-filter-actions`. `.dt-hidden-chips` and `.dt-filter-chips` still hold the chips alone, but no longer scroll: a stylesheet that styled the bars by their structure, or the chips' scrollbar, may need its selectors updated.
- `←` and `→` move the gutter's keyboard stop, as in the filter bar; `↑` and `↓` no longer do, now that the chips sit in one row.

**Fixed**

- With its chips overflowing, the filter bar failed axe's `scrollable-region-focusable` (WCAG 2.1.1) whenever its one tab stop rested beside the chips, on "Expression", "Presets" or "Clear all", as it does by default. Its buttons are inside the row that scrolls now, so its tab stop always is.
- Removing a filter, or restoring a column, with its chip's own button hands focus to the chip after it, or before it at the end of the row. Focus went to the first chip, which scrolled the row back to its start.
- Tab and the arrow keys show the whole chip they move to, clear of the pinned buttons. Only the chip's button was brought into view, which could leave the chip's name cut off or under the buttons.
- The bars' labels, "Active filters" and "Hidden columns", line up with the chips' text when a scrollbar shows under the chips.
- The filter bar no longer clips the scrollbar under its chips at a root font size above 16px.
