---
'@jeyabbalas/data-table': patch
---

A nested or JSON column is 168 px wide until it is resized, and a column header's controls keep at least 2 px between them, so their centres are 24 px apart, as WCAG 2.2's target spacing asks (SC 2.5.8).

- **Why 168 px.** A nested or JSON column's header has six 22 px controls: pin, hide, filter, extract, sort and the drag handle. At the 150 px every column had, they needed 132 px where the bar had 128: they touched, and the drag handle lost the last 4 px of its box until hover or `F2` showed the bar whole. At 168 px and the default 16 px root font, all six show whole, 2 px or more apart. The header's side padding is `0.75rem`, so at a larger root font they need more room and clip at rest until pointed at or focused, still 2 px apart. A derived nested or JSON column counts too, and so does one whose header has no extract button (`derivedColumns: false`).
- **Only the default changes.** A width set by dragging, by the keyboard, by `setColumnWidth` or in a saved session is kept. Resetting a nested column's width (double-click the resize handle, or `Backspace` in column layout mode) brings it back to 168 px, and `ColumnHeader.getWidth()` reports 168 for one without a width of its own. Other columns stay 150 px wide, and their five controls stay where they were.
- **Narrow columns.** A column narrower than its controls still clips them at its edge until pointed at or focused: at the default 16 px root font, now below about 143 px for five (it was 135) and 167 px for six. Shown whole, they are 2 px apart, where they used to touch.
