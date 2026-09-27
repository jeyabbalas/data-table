# Column virtualization

Maintainer notes for rendering only the columns near the view, the fourth step of the large-table work.
It rebuilds what the archived branch did (see [scaling-lessons.md](./scaling-lessons.md)) in slices that
each merge to main. This page holds the plan for the current slice and a findings log. It is not user
documentation.

## Slices

1. **4a: one column geometry.** No windowing yet. Every reader of column positions (header, body,
   keyboard navigation, pinned offsets) gets them from one place, cells are found by column name
   rather than by position, and the column actions keep the pinned columns first. Merged: #125
   (border-box geometry), #126 (cells by column name), #127 (pinned columns first), #128 (the
   layout model).
2. **4b: feature × off-screen column tests.** The checklist in scaling-lessons.md, written as tests
   against the unwindowed grid before any windowing exists.
3. **4c: one `ColumnWindowController`,** owned by `TableContainer`: it owns the geometry, the scroll
   and resize drivers and the set of columns to keep mounted. Header and body render what it
   publishes.
4. **4d: persistent header shells,** with the heavy parts built lazily. Spike first.

## 4b plan

**Tests first, against the grid as it is.** Before any windowing, browser tests pin down what each
column feature does when its column scrolls out of view and back. They run on the unwindowed grid,
where every header and cell stays in the DOM, and 4c has to keep them green. A test that fails on
main has found a bug in main: the bug gets its own PR, which adds the test.

**Harness.** `tests/browser/helpers/table.ts` mounts a table in-page through the public API, in a
fixed-position host whose size, column count, charts, stats panel, extra CSS and `box-sizing`
reset a spec chooses. Every cell is a function of its row and column. Probes on `window.__dtTest`
report where the cursor is and what `aria-activedescendant` names (on demand, or every frame of a
scroll), where a column sits against the viewport and whether its header is mounted, and
`aria-colindex` along the header and a row. Column order and geometry come from the table's state,
never from the header row: a check that needs a header for every column would stop testing anything
the moment 4c renders only some of them. Expectations do the same, so `aria-colindex` is checked
against `columnOrder`, with a column hidden so that numbering the rendered cells from 1 would fail.
Scrolling uses real wheel events, including with a mouse button held.

**Matrix.** 300 columns; the target is near column 150, scrolled about 20,000 px away and back.

| Spec                         | Covers                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen-keyboard.spec.ts` | Cursor through a wheel sweep; Home, End, Ctrl+End with pinned columns; Enter, F2, Escape and Shift+F2 on a header scrolled back; a cursor set in code; hiding the cursor's column |
| `offscreen-columns.spec.ts`  | Drag-reorder with a wheel scroll mid-drag; resize drag and double-click reset; pin far right and unpin; hide → pin → show; `aria-colindex` ascending                              |
| `offscreen-panels.spec.ts`   | Derived-column editor open while its column scrolls away; tooltip, annotations and a custom stats panel set off-screen                                                            |
| `offscreen-charts.spec.ts`   | Charts on columns a growing container reveals                                                                                                                                     |
| `offscreen-derived.spec.ts`  | Edit, remove, undo and redo of a derived column while it is off-screen                                                                                                            |

That charts appear during a smooth wheel sweep is `lazy-charts.spec.ts`.

**Bugs the matrix found on main,** each fixed in its own PR with the tests that caught it:

- The header's scrollbar gutter was a fixed 17 px (#130).
- The table's own scroll writers undo other scrolls. For a second after a filter change,
  `TableContainer` resets `scrollLeft` every frame, so a brush followed by a sideways wheel goes
  nowhere. `render()` restores the scroll position a frame late, undoing a scroll made right after
  it (a `Shift+F2` move to the edge) and losing the position across two renders in a row (adding a
  derived column). `scrollToRightEnd` ends its smooth scroll after a fixed 600 ms, which a wide
  table outlasts, so a column added from the + button is never scrolled to.
- A panel whose first control is hidden by CSS never takes focus: the filter panel's Clear button is
  `display: none` until the column has a filter, so opening the panel from the keyboard leaves focus
  on the header button.
- Keys that act on the cursor (`F2`, `Shift+F2`, `Enter`) leave an off-screen cursor off-screen, and
  a `Shift+F2` resize grows a column past the right edge. Hiding the cursor's column moves the cursor
  to the first column, far from where the user was.
- A drag-reorder takes its drop position from the last pointer move, so a wheel scroll mid-drag with
  the pointer still drops the column where it would have gone before the scroll.

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
  `tests/browser/column-geometry.spec.ts` mounts a table with the reset overridden. Nor does any spec
  have a scrollbar: Playwright starts headless Chromium with `--hide-scrollbars`, which takes them
  out of layout. `tests/browser/scrollbar-gutter.spec.ts` turns the flag off, which only works for a
  whole file.
- **The header's scrollbar gutter is a fixed 17 px** (`--dt-scrollbar-width`), whatever the body's
  vertical scrollbar measures: 0 with overlay scrollbars (macOS default), 0 when the body has too few
  rows to scroll, 15 px for classic macOS scrollbars. Scroll sync copies `scrollLeft` one to one, so
  at the far right the header is clipped by the difference. A scrollbar wider than 17 px did the
  opposite: the header clamped short of the body, and the header-to-body scroll sync pulled the body
  back with it. Fixed at the start of 4b (#130), where the keyboard tests hit it: `TableContainer`
  measures the scrollbar whenever the body scroller resizes, which includes the scrollbar coming or
  going, and the header drops the echo of a sync that it could not follow, which still happens for
  the frame before a new scrollbar is measured.
- **A filter change holds the body's horizontal position for a second.** `TableContainer` resets
  `scrollLeft` every frame for 1 s after `filters` changes, to undo the clamps a filter causes. It
  also undoes any scroll made in that second: a keyboard move or wheel scroll right after applying a
  filter snaps back. Pre-existing; one of the `scrollLeft` writers 4c's controller should own.
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
