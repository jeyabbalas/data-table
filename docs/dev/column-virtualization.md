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
   against the unwindowed grid before any windowing exists: `tests/browser/offscreen-*.spec.ts`, on
   the harness in `tests/browser/helpers/table.ts`. Merged: #131 (the matrix) and #130, #132–#136 (the
   bugs it found on main, in the findings log).
3. **4c: one `ColumnWindowController`,** owned by `TableContainer`: it owns the geometry, the scroll
   and resize drivers and the set of columns to keep mounted. Header and body render what it
   publishes.
4. **4d: persistent header shells,** with the heavy parts built lazily. Spike first.

## 4c plan

**One owner for the column axis.** Five pieces of code wrote `scrollLeft` on their own: the
header↔body sync, the hold after a filter change, `render()`'s restore, the smooth scroll to a new
column and the keyboard's scroll into view. 4b found three bugs where one undid another. Nothing
knows which columns a row needs, either. 4c moves all of it into a `ColumnWindowController` that
`TableContainer` creates once and keeps across renders. It listens to both scrollers and to the body's
size, it is the only code that writes the grid's `scrollLeft` (a unit test greps `src/` for any
other), and it publishes the columns to mount as a signal. The body renders what it publishes. The
header keeps every column until 4d.

**What is mounted:** the pinned block, a run of columns around the view, and the columns something
is holding on to.

- The run covers the view and one viewport either side. A scroll recomputes it only when the view
  comes within half a viewport of its edge, so a scroll of a few columns re-renders nothing.
- The cursor's column, header or body, so `aria-activedescendant` always resolves: a cursor wheeled
  out of view keeps its cell.
- The column holding DOM focus (a clicked cell, a header button in `F2` mode), so a scroll cannot
  take focus with it.
- Until the body has a width (not laid out, hidden, jsdom), every column, which is what every
  existing unit test sees.

The layout-mode column, the column being dragged and an open panel's anchor join in 4d, when headers
start to depend on the set. Until then they are all in the header, which 4c never windows.

**PRs,** each stacked on the one before:

1. **The controller owns horizontal scrolling.** No windowing. The sync and its echo guard, the gutter
   measurement, the restore, the filter hold, the smooth scroll and the keyboard's reveal move into
   it, with `revealColumn(column)` the one way to scroll a column into view. Only one thing changes:
   the header now moves with the body in the same task when the keyboard reveals a column. The 4b
   matrix is the regression suite. The browser's own scrolls are not writes and stay: a wheel, and
   `ModalHost` focusing a header button as its panel closes, which scrolls the header.
2. **It publishes the columns to mount.** The window arithmetic from the archive's `ColumnWindow.ts`,
   on `ColumnLayout`'s offsets instead of prefix sums of its own, plus the hysteresis and the keep
   set, unit-tested against a stubbed viewport and exposed to the browser probes. Nothing renders
   from it yet.
3. **Body rows render only those columns.** A row is its mounted cells in layout order, with a spacer
   for each gap. Cells are keyed by column, so a scroll adds and removes cells around the ones that
   stay and never moves a cell that holds focus. The row-shape check compares shapes, not
   `visibleColumns.length`. Browser tests: the cell count stays within the mounted set through a
   wheel sweep of 1,000 columns, every cell a sweep leaves in view shows its value, and the 4b matrix
   stays green.
4. **Row fetches select only those columns,** padded by a window either side and rounded out to
   16-column steps, so that small scrolls reuse the block. Each cached block records its columns. A
   block missing a mounted column is fetched again, and its cells show as pending until it lands. The
   archive measured 95 ms → 11 ms for one 128-row block at 1,000 columns.

**Not in 4c:**

- For 4d: windowing the header; the drag, panel and layout-mode keeps; and `render()` rebuilding the
  body and every header on each column change.
- Dropping the filter hold. It needs Firefox and WebKit, which this machine's Playwright lacks.

**Done when** the whole browser suite passes on each PR, and a 1,000-column table keeps the body's
cell count within the mounted set through a wheel sweep. A Chrome pass on the 50K × 1,000 Parquet
file must show no console errors, with values, cursor, focus, reorder and panels right across a
trackpad sweep.

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
  filter snaps back. Pre-existing. The hold now ends at the first user input in the table. Its review
  found no filter path in Chromium that still clamps `scrollLeft` (the body's width no longer
  depends on its rows), so it probably protects nothing now; 4c's controller, which should own every
  `scrollLeft` writer, can drop it once other engines agree.
- **Header controls spill out of narrow columns.** `.dt-col-header` does not clip, and its five
  22 px action buttons do not shrink, so a column under about 135 px (110 px of buttons plus padding
  and border) lets them overflow into the next header, which paints over them. A narrow _pinned_
  column is worse: its sticky header sits on top, and its buttons take clicks meant for the first
  unpinned header. Pre-existing; the resize minimum is 50 px.
- **A width under the padding and border (25 px at a 16 px root) still occupies that much.** Only
  `setColumnWidth` can set one; the resize paths clamp to 50–500 px. The layout would then disagree
  with the DOM by the difference, which a windowed row's spacers turn into cells 25 px off their
  headers. Widths are drawn at 50 px at least since #139.
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
  that it always names the ringed cell. `TableBody.renderVisibleRows` rebuilt any row whose cell
  count differed from `visibleColumns.length`, which a windowed row always does; it compares row
  shapes since #139. `ColumnReorder` takes the drop index and the new order from the header DOM,
  which will hold only mounted headers.
- **Found in review, outside this work, not fixed.** The SQL filter modal's Remove section never
  shows in edit mode: the stylesheet hides it and `openForEdit` only clears an inline style. The
  export dialog's and derived-column modal's radio groups are named per prefix, not per instance, so
  with two tables on a page the first table's export dialog opens with no format or scope checked.
- **Bugs the 4b matrix found on main,** each fixed in its own PR with the tests that caught it. The
  header's scrollbar gutter was a fixed 17 px (#130). The table's own scroll writers undid other
  scrolls (#132): the filter hold undid a wheel, `render()` restored the position a frame late and
  lost it across two renders in a row, and the smooth scroll to a new column (`scrollToRightEnd`,
  now the controller's `scrollToEnd`) stopped after a fixed 600 ms. A panel whose first control is hidden by CSS never took focus (#133). Keys that act on the
  cursor left an off-screen cursor off-screen (#134). Hiding the cursor's column sent the cursor to
  the first column (#135). A drag dropped where the last pointer move said, whatever a wheel had done
  since (#136).
- **A file-header `@internal` breaks the emitted declarations.** With `stripInternal`, TypeScript
  attaches a tag in the file's opening comment to the first statement, usually an import, and drops
  it: `dist/visualizations/LazyVizController.d.ts` loses its `ColumnSchema` import and fails to
  type-check. Nothing public reaches that file, so no consumer breaks. Found in review of #137, which
  keeps the tag off `ColumnWindowController.ts`; `LazyVizController.ts` is not fixed.
- **Found in review of #138.**
  - A change that shortens the table (hiding a wide column at the far right) reached the controller
    before the browser clamped `scrollLeft`, a frame later, and the set it worked out from the old
    position was empty. It now clamps the position to the new layout itself.
  - Loading data, and adding or renaming a derived column, write `schema` before `visibleColumns`
    in one batch, and `TableContainer` renders on `schema`, so the body was built from the old
    set. The controller now follows `schema` and `columnOrder` too.
  - A window losing focus sends a `focusout` to nowhere but leaves the element focused. The
    controller used to drop the focused column from the set when that happened.
  - The controller takes pinned columns to lead the visible order, as the column actions keep
    them, but `setColumnOrder` and a restored session do not enforce it.
  - The grid inherited a right-to-left page's direction, which reverses its flex rows and makes
    `scrollLeft` negative. Every column offset in the table assumes left to right, so `.dt-grid`
    is now `direction: ltr`.
- **Found in review of #139.**
  - A reorder moved kept cells to their new places, the one holding focus among them, and moving
    it blurred it. The controller publishes before `render()` rebuilds the body, so the old body
    had dropped focus to `<body>` by then, and `render()`, finding focus already gone, restored
    none. Rows are now put in order around the focused cell, which never moves.
  - Moving focus off a row being removed fired a synchronous `focusin` that the controller turned
    into a publish, and so a second render inside the first. That left rows twice in the viewport,
    or shaped for the old columns. The controller now follows focus a microtask later, a render
    asked for during a render runs after it, and a refresh empties the row map before it moves
    focus.
  - A pinned column placed after an unpinned one lost its body cells: see the review of #138,
    fixed in #140.
- **2026-09-27, headless Chromium, the four 4c PRs stacked, the 50K × 1,000 Parquet file.**
  - **Load:** 6.4 s and 25 queries.
  - **Cells:** the body holds 19 cells a row, 475 in all, where it held 25,000. The DOM is still
    36,600 nodes, almost all of them headers, which 4d addresses.
  - **Sweep:** a 70,000 px wheel sweep was checked in every one of its 993 frames. Every row held
    exactly the mounted columns, and every column in view was mounted.
  - **Values:** the 300 cells in view matched DuckDB's values when put through the table's own
    renderer.
  - **Features:** the cursor, a clicked cell's focus, an open filter panel and a pinned column all
    held.
  - **Errors:** no console errors.
  - **Fetches:** a 128-row block takes 7.8 ms with 96 of the 1,000 columns selected, against 76 ms
    with all of them.
  - **Still to do:** the manual trackpad pass in a desktop Chrome window. The window used was
    hidden behind others, which stops `requestAnimationFrame` and scroll events, so nothing
    rendered.
- **Found in review of #141.**
  - Scrolling sideways past what a block was fetched with fetched the whole block again. On a
    sorted or filtered table that repeats the sort and the `OFFSET`, which clipping the
    projection does nothing for.
  - A fetch in flight was aborted as soon as it would land without a newly rendered column. With
    600 ms added to each fetch, a fling at 20 viewports a second started 8 fetches and landed
    none, and the view stayed blank until the scroll stopped.
  - The fix: a block whose rows are all cached reads only the columns it lacks, by `__rowid__`,
    and drops the ones the new projection leaves out, so a block holds about one projection.
    Nothing is aborted for its columns any more. With the same 600 ms, every fetch lands, and
    cells in view are pending for about one fetch's time.
  - The cursor could be named by `aria-activedescendant` while its cell was still pending: empty,
    and never announced again once filled, because the id does not change. It is now named once
    the value is there.
- **Drag-reorder hit-testing is by header rects in DOM order.** With the pointer over the right half
  of the last pinned header while unpinned headers are scrolled underneath it, the drop lands among
  those unpinned columns; the pinned clamp in `endDrag` cannot see it. And a mouseup lost outside the
  window (alt-tab mid-drag) keeps the drag alive until the next one. Both pre-existing; 4c's
  controller, working from the layout model, is the place to hit-test drops.
