---
'@jeyabbalas/data-table': minor
---

The table body renders only the columns you can see. A row used to carry one cell per visible column no matter how wide the table was; it now carries the pinned columns, the columns whose pixel span intersects the horizontal viewport, and two presentational spacers standing in for everything else.

Measured on 300 columns × 20,000 rows (macOS, Chromium, 1,280 × 720), before → after:

| Metric                             | Before                   | After                     |
| ---------------------------------- | ------------------------ | ------------------------- |
| Elements under `.dt-root`          | 15,051                   | 11,136                    |
| Cells in one body row              | 300                      | 17 at rest, 28 mid-scroll |
| `.dt-cell` elements in the body    | ~4,500                   | 255–420                   |
| Cells per row at 60 columns        | 60                       | 17 — the same number      |
| Header ↔ cell horizontal agreement | (one cell per column)    | 0.000 px at every offset  |

The last two rows are the point. What a row costs is now a function of the viewport, not of the column count: five times the columns renders the same number of cells. What is left at 300 columns is dominated by the 300 eagerly built column headers, which a following release windows the same way.

**Changed**

- **Body cells for horizontally off-screen columns are not in the DOM.** Anything selecting inside the body by `[data-column="…"]` — a test, a screenshot script, a custom integration — has to scroll the column into view first. `TableBody.getColumnSpan(column)` gives you where to scroll to. Header cells are unaffected: the header row is still built in full.
- **`aria-colcount` and `aria-colindex` stay absolute.** A windowed row reports a gapped, non-1-based `aria-colindex` run — say 11…34 against an `aria-colcount` of 60 — which is what the ARIA grid pattern prescribes for a partially rendered row, and what assistive technology needs in order to say "column 11 of 60". Screen-reader column announcements are unchanged. Verified with axe-core in both jsdom and a real browser, including `aria-required-children`.
- **Each body row carries two presentational spacer children**, `div.dt-col-spacer[data-col-spacer="left"|"right"]`, `role="presentation"`, `aria-hidden="true"`, `pointer-events: none`. They are not `.dt-cell`, so a `.dt-cell` selector never picks one up, and a click that lands on one resolves to no column. Row children are `[pinned cells][left spacer][window cells][right spacer]`; the row's `data-window="P:W"` attribute states that shape.
- **The horizontal scroll extent is unchanged at every offset.** The spacers sum to exactly the width of the columns they replace, so `scrollWidth`, the scrollbar thumb, and every cell's x-position are what they were.
- No new options. Nothing needs configuring; the overscan and the window are internal.

**Changed** · **Migration**

- **Grid cells are now `box-sizing: border-box`.** `.dt-cell` and `.dt-col-header` previously used the inherited box model, so a column configured at 150 px actually occupied 175 px — the declared width plus 0.75rem of side padding and a 1 px border. It now occupies 150 px, and text truncates about 25 px earlier.

  **Hosts that apply a global `* { box-sizing: border-box }` reset see no change at all**, which includes most applications and the demo. Without such a reset, columns render narrower than before; adding 25 to a configured width restores the previous look per column.

  This is a precondition for the windowing above — a spacer can only stand in for a column whose configured width _is_ its occupied width — and it fixes a resize bug on the way: `ColumnResizer` seeds a drag from `header.offsetWidth`, so under the old box model every mousedown silently inflated the column by 25 px before the pointer moved, and the mouse and keyboard resize paths disagreed by that amount.

  The two `:last-child { border-right: none }` rules on cells and headers are gone with it. Under `border-box` the last column's right border sits inside its declared width like every other, so the rule only made the final column's content 1 px wider than the rest.

**Fixed**

- **Pinned sticky offsets and the pinned demarcation line no longer count pinned-then-hidden columns.** `hideColumn` does not remove a column from the pinned set, so a column that was pinned and then hidden kept consuming a slot in the cumulative left offset — pushing every later pinned column, and the demarcation line, one column too far right. The header and the body made the same mistake, so they agreed with each other and disagreed with the layout, which is why it went unnoticed. Both now sum over the visible pinned run.
- **Keyboard navigation scrolls to the right place.** `scrollFocusedCellIntoView` summed raw column widths over the pinned list rather than rounded widths over the visible pinned run, so one hidden pinned column sent every horizontal scroll 150 px too far.
- **No blank body after a re-render at a scrolled position.** Hiding, showing, pinning, or reordering a column rebuilds the grid and restores `scrollLeft` a frame later; the body now recomputes its window at the same moment instead of waiting for a scroll event that a property write does not reliably produce.

**Added**

- `TableBody.refreshColumnWindow(): void` — recompute the window and re-render if it moved. Synchronous, so after writing `scrollLeft` yourself the cells for the new offset exist before the next statement. Cheap when nothing moved.
- `TableBody.getColumnWindow(): ColumnWindow` — which columns the rendered rows were built for, plus both spacer widths and the total content width.
- `TableBody.getColumnSpan(column): { left, width } | null` and `TableBody.getPinnedWidthPx(): number` — where a column sits on the horizontal content axis, from the same rounded sums the body draws with.

  All four are on `@jeyabbalas/data-table/advanced`, along with the `ColumnWindow` type.
