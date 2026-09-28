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
   and resize drivers and the set of columns to keep mounted. The body renders only those columns
   and fetches only them. Merged: #137 (the controller owns horizontal scrolling), #138 (it
   publishes the columns to mount), #139 (body rows render only those), #141 (row fetches select
   only those) and #140 (pinned columns first in every column order).
4. **4d: persistent header shells,** with the heavy parts built lazily, and column changes that
   update the grid in place. Merged: #142 (the columns a drag or an open panel uses stay mounted),
   #143 (header controls only for the columns near the view), #144 (column changes update the
   header row and body in place) and #145 (charts and stats panels kept through column changes).

## 4d plan

**Why.** At 1,000 columns the table is still about 36,600 elements, 36,000 of them in the header:
each header builds five buttons, each with an inline SVG, and a resize handle, in view or not. And
every column change rebuilds all of it. `render()` destroys every header and the body on each write
of `visibleColumns` or `schema`, and the facade then destroys every chart and custom stats panel and
makes them again. On the 50K × 1,000 Parquet file, hiding one column costs 182 ms of script, 830 ms
before the next frame and 24 queries. Moving one costs 175 ms and 24 queries, for every step of a
keyboard move (`Shift+F2`, `Shift+→`).

**The spike.** Headless Chromium at 1,400 × 900, on that file. Each variant was made in the live
table by swapping elements: the real header for a column the controller mounts, something lighter
for the rest.

| Header row                      | Elements | Theme restyle | Width change | Sweep frames over 33 ms |
| ------------------------------- | -------- | ------------- | ------------ | ----------------------- |
| Today: a full header per column | 36,594   | 110 ms        | 1.5 ms       | 49 of 287               |
| Structural shells, no controls  | 11,088   | 22 ms         | 1.5 ms       | 4 of 262                |
| Minimal shells, header and name | 3,240    | 14 ms         | 1.1 ms       | 4 of 279                |
| Windowed row with spacers       | 1,279    | 2.7 ms        | 0.4 ms       | 2 of 257                |

Building 1,000 full headers takes 122 ms, and 1,000 shells 6 ms. Shells cost little: they scroll
like a windowed row, and trail it by milliseconds on a restyle. The structural shell keeps a
header's boxes (name, type, dividers, stats slot, chart slot, the empty action bar), so building its
controls moves nothing, and `getStatsElement()` and `getVizContainer()` keep answering for every
column. That is the shell 4d builds.

**What changes:**

- **A header is a shell until its column is mounted,** in the controller's set, the one the body
  renders, with its hysteresis. A shell is the `columnheader` with its id, `aria-colindex`, label,
  sort state, width, pinned placement and its classes for the cursor, filters, annotations and
  layout mode, and the header's boxes. Mounting adds the controls: pin, hide, filter and sort, the
  drag handle and the resize handle. The derived-column icon stays in the shell, since a derived
  column's name row is as tall as the icon. A `ColumnHeader` made outside `TableContainer` stays
  whole.
- **The controller holds the columns in use,** so their controls stay: a resize drag's, a
  drag-reorder's, and the column an open filter panel or derived-column editor belongs to, whose
  close gives focus back to the button that opened it. The cursor's column and the one with DOM
  focus (`F2` mode) are held already, and layout mode lives on the cursor's column.
- **A column change updates the grid in place.** `render()` keeps each column's `ColumnHeader` and
  makes a new one only when the column's schema entry changes. The row is put in order around the
  header holding focus, as body rows are, and ids and `aria-colindex` are rewritten where they
  moved. The body is kept unless the schema or the table changed: rows are keyed by column, and a
  column shown reads only itself, by `__rowid__`.
- **Charts and stats panels outlive column changes.** The attach pass keeps the chart and panel of
  every header that survived, unless the table's relation changed. Custom stats panels are made
  only for mounted columns and destroyed when they unmount; today every column gets one, and every
  attach pass rebuilds them all.

**PRs,** each stacked on the one before:

1. **The controller holds columns in use.** `hold(column)` returns a release. Resize and reorder
   drags and the two panels hold their column. The body keeps a held column's cells, which is what
   the tests can see before headers depend on it.
2. **Headers build their controls only for mounted columns.** Browser tests: a 1,000-column wheel
   sweep in which, every frame, every mounted header has its controls and no other header has; the
   element count at 1,000 columns; the 4b matrix.
3. **A column change updates the header row in place,** and keeps the body. `ColumnReorder`
   listens on the row instead of on each header. Measured: a hide, a show and a move at 1,000
   columns.
4. **Charts and stats panels outlive column changes,** and panels follow the mounted set.
   Measured: the queries a hide, a show and a move cost.

**Not in 4d:** hit-testing drops against the layout model, and ending a drag whose `mouseup` was
lost (both in the log); dropping the filter hold (it needs Firefox and WebKit); a searchable column
picker.

**Budget.** The shared chunk (`VisualizationRegistry-*`, capped as the ExportDialog chunk) had
526 B of its 78 kB cap left at the end of 4c. 4d will need more. The cap moves with a line of history in
`.size-limit.cjs`, as it did for 4a.

**Done when** the whole browser suite passes on each PR; at 1,000 columns the header holds a shell
for every column and controls only for the mounted ones; a hide, a show or a move takes
milliseconds and no chart or panel query for a column that stays; and a Chrome pass on the
50K × 1,000 Parquet file shows no console errors, with values, cursor, focus, reorder, resize,
panels and charts right across a trackpad sweep.

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
- **2026-09-27, the 4d spike.** The table in the 4d plan. Column changes cost more than scrolling:
  at 1,000 columns, hiding one column runs 182 ms of script and 830 ms before the next frame, and
  moving one 175 ms, each with 24 queries, all from rebuilding. The body refetches, and every chart
  and panel in view queries again. Building 1,000 `ColumnHeader`s takes 122 ms and destroying them
  16 ms.
- **Found in review of #142.** Clicking another column's filter button while the filter panel is
  open switches the panel to that column, and the hold moved with it, but `ModalHost` kept the
  element it captured on first opening and gave focus back to the first column's button on close.
  Once header controls are windowed, that button may be gone, and focus falls to `<body>`.
  `ModalHost` now takes a `returnFocus`, which an open host updates when opened again, and both
  panels pass the button that opened them. A released hold also publishes a microtask later, as a
  focus change does: a render that destroys a panel releases its column part-way through.
- **Found building the shells (4d PR 2).**
  - Hiding a column with its own hide button lost focus to `<body>`. The controller hears of the
    change before `render()` does and publishes the column as unmounted, and taking its controls
    down removed the focused button before `render()` could see that focus had been in the table,
    so nothing put it back on the grid. A header holding focus now keeps its controls until
    `render()` destroys it.
  - The layout-mode axe test scanned while the charts rebuilt by the column move were rewriting
    their stats lines, and axe could not find the background of a line that went mid-scan. Faster
    header rebuilds moved the scan into that window. It now waits for the table to settle.
- **Found in review of #143.** A double-click width reset animates for 250 ms under the class
  `dt-col-resetting`, and `ColumnResizer.detach()` cancelled the cleanup that removes it. Detach
  used to come only with a header's end, but taking a header's controls down detaches its resizer
  while the header stays: a column scrolled away mid-reset kept the class, and so did the body
  cells reused for other columns, which then lagged their headers through every resize. Detach now
  finishes the cleanup at once.
- **A flake under load, pre-existing.** `ColumnWindowController.scrollToEnd` takes the body's
  smooth scroll to have ended once `scrollLeft` holds still for three frames, and then turns the
  header-to-body sync back on and puts the header where the body is. On a loaded machine frames
  stall, the scroll looks still mid-way, and the header's echo writes the body's `scrollLeft`,
  which stops the smooth scroll there: `offscreen-derived.spec.ts` ("scrolled into view") once
  failed 16,458 px short of the end while other builds ran, and passed 5 of 5 alone. Not fixed.
- **Found building 4d PR 4, on main too.** Pinning slides headers from their old places to their
  new ones (FLIP), from positions saved when `pinnedColumns` changes. Loading data writes
  `pinnedColumns` after the columns in one batch, so the positions were saved after the render
  that load causes and kept until the next one: the first hide, show or move after a scroll slid
  every header in from where it was at load. With 299 headers translated, the create observer
  saw charts 20,000 px away as in reach and built them. Saved positions now last to the end of the
  task that saved them.
- **Found in review of #144.**
  - A load whose session restored a sort or filters resolved before the rows were painted. The body
    built for the load was kept through the restore, which made it fetch again, and
    `whenBodyReady()` waited only for its first fetch. It now waits for the body's latest refetch.
  - Undoing the add or rename of a derived column in view logged a DuckDB binder error. The schema
    is written before the column list, and the body, kept through both, fetched a column the
    relation no longer had. Row fetches leave out columns the schema lacks.
  - `setColumnOrder` accepted a name twice, and the header row, which keys headers by name, had one
    header where the layout had two places. `setColumnOrder` now drops a repeat.
  - A `TableBody` driven directly, without `TableContainer`, kept values cached for a column whose
    schema entry changed (a derived column edited) under the same table name. It fetches again when
    the schema changes.
  - Moving a column to the front anchored the reorder on the first header in the row, which was
    the column moved, and moved every header it passed: 900 at 1,000 columns. It anchors on a
    header already after its neighbour now, and moves one.
- **2026-09-27, headless Chromium, the four 4d PRs stacked, the 50K × 1,000 Parquet file.**
  - **Load:** 5.4 s and 24 queries.
  - **DOM:** 11,088 elements under `.dt-root`, where 4c left 36,600: 1,000 headers, 19 of them
    with their controls, and 475 body cells.
  - **Sweep:** a 70,000 px wheel sweep, checked in each of its 1,015 frames: every row held
    exactly the mounted columns, every column in view was mounted, every visible column had a
    header, with its controls exactly when mounted, and the cursor was named whenever its row was
    rendered. Every column in view had its chart at the end.
  - **Values:** the 300 cells in view matched DuckDB's values through the table's own renderer.
  - **Column changes:** a hide took 41 ms and 2 queries (the chart of the column the shift
    brought into reach), a show 55 ms and 2, a move 34 ms and none, a pin 82 ms and 2.
  - **Features:** `F2` on the cursor's header 1,500 px away focused its first button. A filter
    panel's column stayed mounted while the wheel took it away, and `Escape` gave focus back to its
    filter button.
  - **Errors:** no console errors.
  - **Still to do:** the manual trackpad pass in a desktop Chrome window.
- **Found in review of #145.**
  - A load could hang for good. A column change during the first chart fetches carries the charts
    the load waits for into the new wave, and it carried every column of the old wave still
    listed, some of whose charts would never come: a column rebuilt for new data and now out of
    view, or one whose chart the keep band destroyed as the view moved away. The load resolved
    only once those columns were scrolled back into view. Only a kept chart still on its first
    fetch, or a kept column still queued, is carried now.
  - A load that restored a saved session resolved before the charts in view had their data. The
    restore sets the column layout before the create observer's first report, and the column
    change it makes closed its wave at once, with nothing new to observe; the report then came to
    a closed wave. A wave now stays open while the one before it still waits for that report.
  - Stats panels were built during a derived-column change, against the VIEW it had dropped: 100
    panels and 100 errors for a sideways scroll while the change waited on DuckDB. Panels now wait
    for the change to settle, as charts do, and those skipped are built once it has, whether it
    succeeded or failed.
  - A panel whose constructor threw was tried again on every change to the mounted columns: an
    error each time, and the fallback line written over the stats of the column's live chart. As
    with a chart, a failure now lasts until new data or a new header, and a slot a panel did not
    take shows its chart's stats.
- **Found checking the review of #145, pre-existing (on main too).** The body issues a block's
  fetch again as soon as one ends without the block, failed or short. During a derived-column
  change a sideways scroll makes the body read columns from the VIEW the change dropped, and every
  read fails: about 1,750 failed queries, each logged to the console, while a test held the DROP's
  reply for about a second, on main as with 4d. With a bridge that answers in the same tick, a
  test double, the loop never yields. Fixed after 4d: the same fetch now waits 250 ms, doubling up
  to 8 s, before it is tried again, and no body fetch starts while a derived-column change that
  can break reads is in flight. The browser test that holds the DROP's reply saw thousands of
  failed fetches on main (2,756 and 2,699 on two runs), and none with the fix.
- **Found in review of the retry fix.**
  - The first version held back row fetches during every derived-column change, adds included. An
    add leaves the relation in force alone until one `CREATE OR REPLACE VIEW` that keeps every
    column, so the rows scrolled to during a slow vector add stayed placeholders until it ended:
    for 0.9 s after the scroll at 200K rows and 5.1 s at 1M, in the review's measurements, where
    they had loaded within 10 ms. Only the changes that can break reads hold them back now: a
    removal, an edit or a replacement, an undo or redo, a reset, a restore. Charts and stats
    panels still wait out every change: one built during an add is rebuilt for the new relation as
    soon as it lands. Two adds of the same name in flight at once, which would share a vector
    column's helper table, are refused.
  - The filtered-row count had the same hazard, and is gated the same way. A filter added while a
    removal held its DROP failed to count, kept the count from before it, and left the rows past
    the true count as placeholders for good.
  - Pre-existing: a body whose row count drops below the rows in view during its first fetch
    asked for the same empty block again from the fetch's own reconcile, in one call stack, until
    the stack overflowed. The body reads its range only from the scroller, and follows it only
    once the first fetch has landed; a body built during a change waited the whole change. Blocks
    past the row count are no longer asked for, and the range is read again when a change settles.
  - A fetch left out of reach as the view moved during a change was not aborted, and the retry
    and relation waits reconciled during the filter-change scroll animation, reading rows it was
    about to scroll away from. Both fixed.
- **Found in the second review of #151, not fixed.** Each is rare, bounded, and at least partly
  pre-existing.
  - Derived-column changes are not serialized, and they share the manager's list of columns. A
    removal of the only derived column, landing while a vector add of another is at its last
    `INSERT`, settles with `tableName` naming the VIEW the add has yet to create, and the relation
    reported readable; the body's first reads fail until the add lands, backing off meanwhile.
    The same lets an undo during an add rebuild the VIEW from a destroyed manager. Fix: run
    derived-column changes one at a time, which would also make the same-name refusal and the
    rename caveat unnecessary.
  - A session restore applies its filters and sort before its derived columns are rebuilt, so
    the reads and the count they start are not held back. The count fails if a filter names a
    derived column, and with visualizations off nothing counts again, so rows past the true count
    stay placeholders. Fix: restore the filters, sort and derived columns in one change.
  - A chart's refetch for a filter change is not held back during a removal: every live chart
    queries the dropped VIEW and reports an error, as on main. Fix: hold the charts' refetches as
    the count is held.
- **2026-09-27, the Step 4 Chrome pass, 50K and 200K × 1,000 Parquet, pre-existing.** Every
  histogram drew "No data" from the moment it was laid out until its first fetch landed.
  `SharedHistogramBase.render` treated a chart with no data yet as a column with none, and a
  chart's resize observer renders it as soon as it is laid out. Lazy charts made this visible on
  every scroll, for seconds at 200K rows while chart fetches queued. Value counts already drew
  nothing without data. Fixed: a histogram draws nothing until a fetch lands, and "No data" only
  for a fetch that returned no values and no nulls; one whose fetch fails draws nothing, as value
  counts do. A browser test counts the "No data" draws at load and in two sideways sweeps: about
  45 to 55 on main, in each of 10 runs, and none with the fix.
- **Found in review of #152 (pre-existing), since fixed.**
  - A histogram whose refetch fails keeps the detail of the bar under the pointer, or of its
    brush or selection, in the stats slot: the emitters that would replace it return early
    without data, so moving over the blank chart or leaving it changes nothing. Its hover state
    stays set too. Fix: reset the hover state when there is no data, and have
    `emitRestingStats` clear the detail then.
  - A failed chart now looks like a loading one: a blank canvas and the table-wide count (before,
    both showed "No data"). The `error` event does not say which column failed:
    `createVizForColumn` drops the `columnName` the chart reports, and only the unfiltered fetch
    helpers put the column on the error. Fix: pass the column through, and consider marking a
    failed chart's container. Both fixed as proposed, value counts too. A failed chart marks its
    canvas `data-fetch-failed`, and its slot drops the stats and detail it reported before and
    says `statistics.chartFailed` until the chart reports stats again; a failure of a superseded
    refetch, or of a destroyed chart, leaves the slot alone.
- **2026-09-27, the Step 4 Chrome pass, 50K and 200K × 1,000 Parquet, on #145.** Stats panels
  followed the mounted columns frame by frame, unlike charts. Adding a derived column with +
  from the far left smooth-scrolls to it, which mounts nearly every column on the way: 533
  panels built and 530 destroyed at 50K rows, 537 panel queries within 1.5 s against 30 chart
  queries, and the charts at the new column done 14.1 s later (10.7 s at 200K). Fixed: a column
  that leaves loses its panel at once, as before, but one that arrives gets its panel once the
  mounted columns have held still for `STATS_PANEL_SETTLE_MS`, 150 ms. Meanwhile its chart keeps
  its stats for the panel instead of writing them into the slot first. A browser test counts the
  panels a smooth scroll across 300 columns builds: 187 to 189 on main, 14 to 31 with the fix.
- **Found building and reviewing #153.**
  - A chart reports a committed brush or selection's detail once, as its data lands, and a panel
    built after that never got it: its stats were handed over, its detail was not. A panel now
    gets both.
  - A column scrolled back into view showed an empty slot until its new panel was built, or the
    destroyed panel's old numbers if it did not clear them. A panel that goes now leaves the slot
    as it is without one: the chart's stats, or the table-wide count.
  - Two tests of panels that throw asserted a few microtasks after the columns changed, before
    the deferred build ran, and passed with the checks they were written for removed. They wait
    for the build now.
- **2026-09-28, checking #153 in Chrome at device pixel ratio 2, pre-existing (4c).** A
  programmatic smooth scroll of the body stops after a pixel or two. The header's scroll event
  arrives with the position the last sync gave it, by which time the body has moved on, and
  `ColumnWindowController.handleHeaderScroll`, finding the two apart, writes that older position
  back into the body, which cancels the animation. `scrollToEnd` turns the header-to-body sync
  off for its own scroll, and wheel, trackpad and keyboard scrolling were unaffected, as was a
  smooth scroll at device pixel ratio 1 in headless Chromium, so what stalls is host code calling
  `scrollTo({ behavior: 'smooth' })` on the body. Not fixed here: a header event at the position
  the controller itself last wrote is its own echo, whatever the body is doing, and could be
  dropped as such.
