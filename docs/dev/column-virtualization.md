# Column virtualization

Maintainer notes for rendering only the columns near the view, the fourth step of the large-table work.
It rebuilds what the archived branch did (see [scaling-lessons.md](./scaling-lessons.md)) in slices that
each merge to main. This page holds the plan for the current slice and a findings log. It is not user
documentation.

## Slices

1. **4a: one column geometry.** No windowing yet. Every reader of column positions (header, body,
   keyboard navigation, pinned offsets) gets them from one place, cells are found by column name
   rather than by position, and the column actions keep the pinned columns first.
2. **4b: feature × off-screen column tests.** The checklist in scaling-lessons.md, written as tests
   against the unwindowed grid before any windowing exists.
3. **4c: one `ColumnWindowController`,** owned by `TableContainer`: it owns the geometry, the scroll
   and resize drivers and the set of columns to keep mounted. Header and body render what it
   publishes.
4. **4d: persistent header shells,** with the heavy parts built lazily. Spike first.

## 4a plan

**Geometry is the declared width.** `.dt-cell` and `.dt-col-header` declare `box-sizing: border-box`,
so a column's width in `columnWidths` (150 px when unset) is the width it occupies. Until now the
occupied width depended on the host page: with a global `box-sizing` reset (the demo has one) it was
the declared width; without one it was the declared width plus 25 px of padding and border. Every
reader that adds widths up assumed the first. On a page without a reset that put keyboard
scroll-into-view, pinned offsets, the pinned divider, the scroll extent of an empty result and the
resize drag off by 25 px per column, and at container widths under 550 px, where the header padding
shrinks, headers drifted 8 px per column from their cells.

**Cells are found by column name.** `TableBody`, `TableContainer.updatePinnedColumnStyles` and
`ColumnHeader.getColumnCells` read `data-column` instead of child position or `:nth-child`, so a row
may later hold a subset of the columns.

**The pinned columns stay first.** `toggleColumnPin` writes `pinnedColumns`, `columnOrder` and
`visibleColumns` in one `batch()`, so no subscriber sees a pinned column outside the pinned block.
`showColumn` clamps the restored column out of the pinned block (into it, for a pinned column) and
keeps `visibleColumns` a subsequence of `columnOrder`, which `aria-colindex` relies on.

**One layout model.** `src/table/ColumnLayout.ts` is a pure, read-only snapshot computed from state:
visible order, resolved widths, prefix sums, pinned offsets over the _visible_ pinned columns, total
width and the `aria-colindex` numbering. Header, body and keyboard navigation read it instead of
summing `columnWidths.get(c) ?? 150` in seven places. That fixes pinned offsets after a pinned
column is hidden or resized, and the width of a column whose stored width is not a finite,
non-negative number.

PRs, in order: border-box geometry (#125); cells by column name (#126); pinned columns first (#127);
the layout model (#128, stacked on #126). Each has tests that fail on the old code, a changeset and
docs, and was reviewed by a separate agent before merging.

## Findings log

- **2026-09-27, Chrome on `0.9.0-next.0`, page without a reset.** A 150 px column occupies 175 px.
  Starting a resize drag widened the column by 26 px before the pointer moved (`ColumnResizer`
  seeded from `offsetWidth`, a border-box width, and wrote a content width). Hiding the first of two
  pinned columns left the second at `left: 150px` over its neighbour, and the divider at 300 px.
  Resizing a pinned column left the next pinned column's offset stale. Hide c00 → pin c01 → show c00
  put c00 before the pinned c01, and `aria-colindex` read 3, 1, 4. With a filter matching no rows,
  the body scroll width was 6,000 px against a 6,999 px header, so the last six headers could not be
  scrolled into view. At a 500 px container the fourth header sat 24 px left of its cells.
- **Rows had the same bug.** `.dt-row` took `rowHeight` plus its 1 px bottom border without a reset,
  so rows drifted 1 px per row from where the scroller put them, and `.dt-root` / `.dt-table-wrapper`
  (`height: 100%` plus a border) overflowed the container by 2 px. Fixed with the columns.
- **The browser suite could not see any of it.** Every spec runs on the demo, whose global
  `* { box-sizing: border-box }` reset hid the content-box arithmetic.
  `tests/browser/column-geometry.spec.ts` mounts a table with the reset overridden.
- **The header's scrollbar gutter is a fixed 17 px** (`--dt-scrollbar-width`), whatever the body's
  vertical scrollbar measures: 0 with overlay scrollbars (macOS default), 0 when the body has too few
  rows to scroll, 15 px for classic macOS scrollbars. Scroll sync copies `scrollLeft` one to one, so
  at the far right the header is clipped by the difference. Not fixed in 4a; the window controller
  in 4c should size the gutter from `offsetWidth - clientWidth` of the body scroller.
- **Header controls spill out of narrow columns.** `.dt-col-header` does not clip, and its five
  22 px action buttons do not shrink, so a column under about 135 px (110 px of buttons plus padding
  and border) lets them overflow into the next header, which paints over them. A narrow _pinned_
  column is worse: its sticky header sits on top, and its buttons take clicks meant for the first
  unpinned header. Pre-existing; the resize minimum is 50 px.
- **A width under the padding and border (25 px at a 16 px root) still occupies that much.** Only
  `setColumnWidth` can set one; the resize paths clamp to 50–500 px. The layout would then disagree
  with the DOM by the difference.
- **`--dt-col-width` sizes nothing but loading placeholders.** Every header and cell gets an inline
  width from `columnWidths` (150 px default), which wins over the variable. The theming guide and the
  state-model page said it was the default column width.
- **2026-09-27, Chrome, the four 4a PRs merged locally, page without a reset.** Every bug above is
  gone: columns and cells take 150 px and rows 32 px; hiding the first pinned column closes the block
  up; resizing a pinned column moves the next one and the divider; hide → pin → show keeps the shown
  column after the pinned block with `aria-colindex` ascending; a real 40 px resize drag gives 190;
  at 500 px headers sit over their cells; an empty result scrolls exactly as far as the header. On
  the 50K × 1,000 Parquet file, `End` lands on `col_999` fully in view, and two pinned columns stay
  side by side 40,000 px into the table. A mistyped name passed to `toggleColumnPin` was spliced into
  `columnOrder` as a phantom column; fixed in #127.
- **For 4b/4c, from the reviews.** Body cell ids are keyed by the column's layout index (#128), so
  `aria-activedescendant` stays right once a row holds a window of columns; a 4b test should assert
  that it always names the ringed cell. `TableBody.renderVisibleRows` still rebuilds any row whose
  cell count differs from `visibleColumns.length`, which a windowed row always does. `ColumnReorder`
  takes the drop index and the new order from the header DOM, which will hold only mounted headers.
