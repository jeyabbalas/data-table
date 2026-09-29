# Changelog

## 0.9.0-next.1

### Minor Changes

- dcf3f82: ### Changed

  - Body rows render only the columns near the view. That is the pinned columns, the columns in view and a viewport's width either side, and the columns holding the keyboard cursor or DOM focus. A spacer stands in for the rest, so the scroll width and every column's position stay the same.
    - **Fewer cells:** at 1,000 columns in a 1,200 px view, a row holds about two dozen cells instead of 1,000.
    - **Scrolling sideways:** cells are added and removed as columns come within reach. The cells of columns that stay are left in place, and a reorder never moves the cell holding focus, so a clicked cell keeps focus through both.
    - **Code that looks up body cells in the DOM** finds only these. The cursor's cell is among them whenever its row is rendered, so `aria-activedescendant` keeps resolving.

- f374500: ### Fixed

  - A header chart whose data fails to load no longer keeps the detail of the bar or segment under the pointer, or of its brush or selection, in its stats slot. Nothing is drawn after a failure, so nothing is hovered and no detail shows. A selection's detail comes back with the next fetch that lands.
  - Its stats slot no longer keeps the stats the chart reported for the filters before. It shows the table-wide row count, kept current, until the chart reports stats again. A failure of a refetch a newer one superseded, or of a chart already destroyed, is reported but leaves the slot alone.
  - A column whose custom chart reports no stats of its own keeps its table-wide row count current through filter changes. It kept the count from when the chart was made.
  - `error` events with `source: 'visualization'` now always name the column, in `error.details.column`, and the stage that failed, when the chart reported it, in `error.details.stage`. Before, only some of the charts' queries put the column on the error, and a chart that threw while being built never did. The event carries a copy of the error the chart reported, a native error of the same class, so an error that several charts pass on names each one's column.

  ### Added
  - A chart whose data failed to load no longer looks like one still loading. Its stats slot says "Failed to load" (`messages.statistics.chartFailed`) beneath the row count until the chart reports stats again, for a chart that reports them, and a built-in chart's `<canvas>` carries a `data-fetch-failed` attribute until a fetch lands.
  - `VisualizationOptions.onError`'s context has `superseded: true` for a filter update that failed after a newer one had started.
  - `BaseVisualization.reportsDefaultStats`, true for the built-in charts, says a chart reports its stats through `onDefaultStatsChange` each time a fetch lands. The stats slot says a chart's fetch failed only for a chart that reports stats, since only new stats take the line back. A custom chart that reports its stats after every fetch can set it, so that a failure of its first fetch is said too.

- bdbc4ec: ### Fixed

  - Charts no longer refetch while a derived-column change can drop or rebuild the relation they query.
    - **Before:** a filter changed during a removal, an edit or a replacement, an undo or redo, a reset or a session restore made every chart in view query the VIEW the change had dropped, and each reported an `error` event with `source: 'visualization'`.
    - **Now:** their refetches wait for the change to settle, as the filtered-row count already did. A chart whose filters changed more than once meanwhile refetches once, with the filters in force then. Adding a derived column holds nothing back.
  - Custom stats panels likewise: `updateFilters` waits out such a change, so a panel that queries the relation no longer reports an `error` event with `source: 'stats-panel'` for each filter change made during one.

  ### Added
  - `StatsPanelCoordinator` takes the table's actions as an optional third argument. Given them, as the facade gives them, a broadcast waits out a derived-column change that can drop or rebuild the relation, and then goes once to the panels still registered. For `/advanced` users who drive the coordinator directly.

- f3bf86a: ### Changed

  - Hiding, showing, moving or pinning a column keeps every other column's chart and custom stats panel. Only the column shown gets new ones.
    - **What it saves:** a change queries only for the charts and panels of the columns it brings near the view, such as the column shown. Before, every change rebuilt every chart and panel near the view, about 20 queries at 1,000 columns.
    - **Charts:** a brush or selection is never lost to another column's change.
  - Custom stats panels live only while their column is near the view, the same columns body rows render.
    - **Lifecycle:** a panel is built as its column comes within about a viewport of the view, and destroyed once the column moves away. It used to exist for every column, and every column change rebuilt them all.
    - **`update()` on mount:** a panel built while its column's chart is live is passed the chart's latest stats, not `null`.
    - **A panel that throws** in its constructor is not tried again until new data arrives or its column's header is rebuilt.

- f851432: ### Changed

  - Row fetches select only the columns near the view.
    - **Which columns:** around the columns rows render, a fetch selects as many again on either side, rounded out to steps of 16 columns, so a short sideways scroll reuses rows already fetched.
    - **At 1,000 columns:** in a 1,200 px view a fetch selects 32 to about 100 columns instead of 1,000. In Chrome, a 128-row block takes a median of 7.8 ms with 96 of 1,000 columns selected, against 76 ms with all of them. Most of that time went into converting the block to JavaScript objects.
  - Scrolling sideways past what the rows were fetched with reads the new columns for those rows by their row id, without filtering or sorting the table again.
    - **Until they arrive:** the cells stay empty with the class `dt-cell--pending`, and the row carries `aria-busy="true"`.
    - **The keyboard cursor:** it is named by `aria-activedescendant` once its cell has its value, so a screen reader announces the value rather than an empty cell.

- 34e040c: ### Changed

  - Header cells, body cells, rows and the table root are `box-sizing: border-box`, so a column's width and a row's height include their padding and border. On a page without a global `box-sizing` reset, columns are narrower than before by their side padding and border: 25 px at the default 16 px root font size, so a column is 150 px wide by default where it took 175 px. Pages with a reset, such as Tailwind's or Bootstrap's, look the same.

  ### Fixed
  - On pages without a `box-sizing` reset, every calculation that places columns treated them as narrower than they drew, by 25 px per column at the default font size. `End` and the arrow keys could leave the cursor's column off-screen (on 1,000 columns, `End` stopped more than 100 columns short of the last); pinned columns overlapped and the pinned divider sat inside the last pinned column; with a filter matching no rows, the body scrolled only as far as the declared widths reached, well short of the last headers; and in a table narrower than 550 px, where the header padding shrinks, headers drifted 8 px per column from their cells.
  - On pages without a reset, each row also took 1 px more than `rowHeight`, so rows drifted 1 px per row from where the scroller placed them and walking the cursor down with the arrow keys could leave its row partly below the view. The table overflowed its container by 2 px.
  - Starting a resize drag no longer widens the column before the pointer moves. On pages without a reset it added the padding and border.

- 92c2198: ### Changed

  - Hiding, showing, moving or pinning a column updates the header and the body in place instead of rebuilding them.
    - **Headers:** every other column keeps its `ColumnHeader`, and DOM focus on one of its buttons stays put. A column's header is rebuilt only when its schema entry changes, as when a derived column is edited or new data is loaded. Header ids and `aria-colindex` follow the columns to their new places.
    - **Body:** the rows stay. A hide or a move fetches nothing, and a column shown is read by itself, by row id, for the rows already fetched.
    - **At 1,000 columns:**
      - Hiding a column takes 24 ms instead of 182 ms, and the next frame follows 59 ms after it instead of 830 ms.
      - Moving a column takes 28 ms instead of 175 ms.
      - Measured in Chrome on a 50K × 1,000 Parquet file.
    - **Charts and custom stats panels** are still rebuilt on every column change.
    - **Pinning** animates only the headers near the view.

- 870cb19: ### Changed

  - Column headers far from the view leave out their buttons. Every visible column keeps its header: name, type, stats line, chart slot, id, `aria-colindex`, label and sort state. Only the columns near the view, the ones body rows render cells for, get the pin, hide, filter and sort buttons and the drag and resize handles.
    - **At 1,000 columns:** the header holds about 10,500 elements instead of 36,000, and switching the colour scheme restyles the table in 21 ms instead of 110 ms (Chrome, 50K × 1,000 Parquet file).
    - **Where they are needed, they are there:** the keyboard cursor's column and the column holding DOM focus have their buttons wherever they are, and so does a column being resized or dragged, or whose filter panel or derived-column editor is open. Closing the panel gives focus back to the button that opened it.
    - **Code that looks up header buttons in the DOM,** such as `.dt-col-sort-btn`, or `ColumnHeader.getControls()` through `TableContainer.getColumnHeaders()`, finds them only for those columns. `getStatsElement()` and `getVizContainer()` still answer for every column, and a `ColumnHeader` you create yourself still has all its buttons.

- 84bc227: ### Added

  - `sourceOptions` on `createDataTable()` and `table.loadData()` says how a source is read, per format: a CSV's `delimiter`, `header`, `skip`, `nullValues` and `sampleSize`; a JSON source's `format`, `sampleSize` and `maxDepth`; the Parquet `columns` to load; and the `timezone` DuckDB works in. `WorkerBridge.loadData()` takes the same fields next to `format`. The loaders had most of these options, but no public path reached them. New types: `SourceOptions`, `CSVSourceOptions`, `JSONSourceOptions` and `ParquetSourceOptions`.
  - A `sampleSize` of `-1` has DuckDB type CSV or JSON columns from every row, for a file whose odd values come after the rows it samples by default.
  - A load of some Parquet columns counts only those in the memory check before the load: the scan and prefetch estimates leave out the columns DuckDB does not read.

  ### Fixed
  - `LOAD_INVALID_OPTIONS` and `LOAD_INVALID_TIMEZONE`, documented but unreachable, now reject a bad `sourceOptions` value before the source is read, with `details.option` naming it, and the table keeps the data it had. A time zone DuckDB does not know rejects as `LOAD_INVALID_TIMEZONE`, listing the zones it suggests, and Parquet `columns` the file lacks as `LOAD_INVALID_OPTIONS`, naming them.
  - `loadProgress` never fired: nothing passed the worker's progress messages on. The table now emits one per message, between `loadStart` and `loadComplete` or `loadError`, for the initial `source` load and for `table.loadData()`. An `onProgress` passed to `table.loadData()` or `actions.loadData()` is called with them too.

### Patch Changes

- b4ad31d: ### Fixed

  - A `TableBody` used without `TableContainer` (from `/advanced`) fetches its rows again when the schema changes. Editing a derived column's expression used to leave the values fetched before it on screen.

- 807818c: ### Fixed

  - A request to the DuckDB worker no longer waits for good on a reply that will never come:
    - An error the worker does not catch, during init or later, now rejects every pending request with a `WorkerInitError` whose code is `WORKER_CRASHED`, and terminates the worker. Every later call rejects at once with the same code, instead of being posted to a worker that will not answer, until `bridge.initialize()` starts a new one. Tables sharing the bridge all get this error.
    - A message from the worker that cannot be deserialized (`messageerror`), or that has no string id, rejects every pending request with `WORKER_PROTOCOL_VIOLATION`, since there is no telling whose reply it was, and cancels them in the worker, which carries on. A load rejected this way may still have created its table in DuckDB.
    - A result reply without its payload rejects its request with `WORKER_PROTOCOL_VIOLATION`.
    - A request whose payload cannot be cloned, such as a detached `ArrayBuffer`, still rejects with the clone error, and no longer leaves its entry and its abort listener behind.
    - `terminate()` while `initialize()` waits for the worker now rejects it at once with `WORKER_TERMINATED`, instead of leaving it to time out 30 s later.
    - A worker script that fails to load now says so, with its URL when the bridge was given one, instead of "Worker error: undefined".
  - A table whose worker fails reports it once, as an `error` event with `source: 'query'` and code `WORKER_CRASHED`, and stops fetching rows. It drops the errors that follow from it, those of the charts, panels and loads that fail after it, which carry the failure in their `cause` chain; a failed load still rejects and fires `loadError`. The data is gone with the worker: destroy the table and create it again, which starts a new one.

- 529e430: ### Fixed

  - Header histograms no longer show "No data" before their first query returns. Every histogram built at load, or as its column scrolled into view, showed it until its data arrived, which on a large table could take seconds. A chart's area now stays blank until its data lands, and "No data" appears only for a column with no values and no nulls.
  - A histogram whose query fails now stays blank, as value counts already did, instead of showing "No data". The error still reaches the `error` event with `source: 'visualization'`.

- dff2e7d: ### Fixed

  - Hiding a pinned column no longer leaves the pinned columns after it offset by its width. The next pinned column stuck that far from the left edge, over the column beside it, and the pinned divider sat past the pinned block. With every pinned column hidden, the divider no longer stays on screen.
  - Resizing a pinned column moves the pinned columns after it, and the divider, with it. They kept their old offsets, so when scrolled sideways they overlapped the resized column or left a gap beside it.
  - Pinned columns are offset in the order they appear. The order they were pinned in was used instead, which differs once `setColumnOrder` has moved them.
  - Keyboard navigation counts only visible pinned columns in the width of the pinned block, matching where the pinned columns are now drawn. Counting hidden ones scrolled a column that much too far.
  - A column whose stored width is not a finite, non-negative number, for example from `setColumnWidth` or a restored session, is drawn 150 px wide in both the header and the body. The browser dropped the invalid width and left whatever width the element had before. Stored widths are drawn rounded to whole pixels.

- a2105fe: ### Changed

  - A column width under 50 px is drawn 50 px wide, the same minimum as resizing by drag or keyboard. Only `setColumnWidth` or a restored session can set such a width. A cell cannot be narrower than its padding and border, so a smaller width took more room than it said. With rows rendering only some columns, that left the cells after it out of line with their headers.

- b4ad31d: ### Fixed

  - `setColumnOrder` counts a column name given twice once, at its first place. A repeated name used to put the column in the order twice.

- 24b2ed2: ### Fixed

  - Keys that act on the keyboard cursor now scroll it into view. Once the user had scrolled away from the cursor with the mouse, `F2` put focus on a header button out of sight, `Shift+F2` opened column layout mode on a column nobody could see, and `Enter` or `Space` sorted a column, or `Enter` selected a row, off-screen.
  - In column layout mode (`Shift+F2`), widening a column at the right edge no longer pushes it out of view, and `Escape` after moving a column scrolls back to where the column returns.
  - A column wider than the table's view no longer jumps between its two edges on every key press that keeps the cursor on it; the view shows the column's start and stays put.

- c3161a7: ### Fixed

  - Derived-column changes no longer interfere when one starts before another has landed. Adds, edits, replacements and removals, `undo`, `redo`, `resetToInitial` and `loadData` now run one at a time, in call order, and each validates against the columns the one before it left. Previously a removal landing while a vector add was still inserting could leave `state.tableName` naming a VIEW not yet created, an edit could drop a column added while it ran from `state.schema`, and an undo pressed during an add undid the entry below it.
  - An undo pressed while an add runs now waits for the add and undoes it. An edit made while a derived-column change runs, such as a filter added during a slow vector add, keeps its own undo entry.
  - A derived-column change, undo, redo or reset that is still waiting or running when `loadData` or `clearSession` is called no longer applies to the new or emptied table. An add or update resolves `{ success: false }`, a replacement resolves a `NOT_FOUND` error, a removal rejects with one, and an undo, redo or reset resolves `false`. `loadData` also waits for the previous data's derived-column tables to be dropped before it resolves, and `clearSession` now drops them too.
  - An `undo`, `redo` or `resetToInitial` called while a load is under way now resolves `false` instead of acting on the session the load restores.

  ### Changed
  - A second add of a name that an earlier add is still adding now waits for that add and gets `Column name "X" already exists`, instead of `is already being added` at once. The same applies to a rename to that name.

- 56d3fae: ### Fixed

  - A restored session whose filter or sort names a derived column now counts and reads its rows once that column is back. The filters, sort and column layout are restored in one change with the derived columns. Before, they were written first, so the filtered-row count and the first row reads ran against the base table, which lacks the column, and failed. With `visualizations: false` nothing counted again, and the rows past the true count stayed placeholders.
  - A restored session none of whose derived columns can be rebuilt, for example because an expression names a column the data no longer has, no longer keeps filters, a sort or columns that name them.
  - A saved session that cannot be read no longer makes the load reject. The load logs a console warning and goes ahead without the session, and whatever part of it was already written is taken back. Before, a snapshot with malformed fields rejected the load when it had no derived columns, and was reported as a derived-column failure when it had some.
  - A derived column that a restored session cannot rebuild no longer leaves its header tooltip behind for a later column of the same name.

- 9a6ca83: ### Fixed

  - `createDataTable`'s documentation now says what it does with `source`: it awaits that first load, and the first fetches of its rows and of the charts in view, and rejects with the load's error if the load fails, without tearing down the table it mounted. The API reference and AGENTS.md said the initial load was not awaited. The `tableName` and `sourceFormat` options now say they apply to `source` only, and the docs that recommend loading with `loadData()` instead pass them to it.
  - The loading guide's rules for string sources: a string is fetched when it looks like a URL or path (a scheme, `//`, `/`, `./` or `../`), loaded inline when it spans lines or starts with `[` or `{`, and otherwise rejected with `SOURCE_AMBIGUOUS`. It said any string not starting with `http` was parsed as CSV or JSON.
  - The loading guide's `ProgressInfo` details: `percent` runs 0–100 (it said 0–1), and the worker's stages are `reading`, `parsing` and `indexing` (it listed `analyzing` too).

- 8caa5d2: ### Fixed

  - A column dragged by its handle now drops where the pointer is after the table scrolls beneath it. Wheeling or swiping sideways with the button held takes a column somewhere out of view; letting go without moving the pointer used to drop it where the pointer had been before the scroll, usually right back where it started. The drop indicator now stays under the pointer as the headers scroll, including in a table inside a shadow root.

- 67e4dd1: ### Fixed

  - A column let go over the pinned columns, while the table is scrolled sideways, now lands at the pinned block's edge, before the first unpinned column in view. It used to land among the columns scrolled out of view beneath the pinned block, wherever the pointer met their hidden headers, and so vanished from view. Drops are now found from the column layout and the header scroll rather than from header positions, and the drop indicator marks where the column will land.
  - A drag whose mouse button is released outside the browser, after switching to another window, now ends without moving the column. It stayed alive, with its indicator following the pointer, until the next click anywhere dropped the column there. A drag also ends, without a drop, when the window loses focus, the page is hidden or the browser cancels the pointer.
  - The drop indicator now marks the right place in a table inside a scaled element, under a CSS `transform` or `zoom`. It was placed in screen pixels inside the scaled header row, far from the gap it marked.

- cf8d9ca: ### Changed

  - The table's grid is laid out left to right on a right-to-left page too. Pinned columns, keyboard scrolling and sideways scrolling all place columns by their left offsets, which a right-to-left grid reversed. On a page marked right to left with a `dir` attribute, each cell value and column name still takes its direction from its own text, as with `dir="auto"`. Right-to-left layouts are still not supported.

- 7abf85c: ### Fixed

  - A smooth sideways scroll of the table body, such as a host's `scrollTo({ left, behavior: 'smooth' })`, no longer stops a pixel or two in. At a device pixel ratio of 2, Chrome can deliver the header's scroll event for a sync a frame late, after the body has moved on, and the table then wrote the header's older position back into the body, which cancelled the animation. The table now drops a scroll event that finds a scroller where the table itself last put it, to within a pixel, so the header follows the body without pulling it back. An animated scroll of the header, such as a fling over it or a host's `scrollTo` on it, is no longer pulled back by the body in the same way.
  - The scroll to a derived column just added no longer stops short of it on a busy machine. It used to turn off the header's sync until the body seemed to stop, and stalled frames made it look stopped mid-way.

- 47f1ac9: ### Fixed

  - The column header now scrolls exactly as far as the body. The header keeps a gap beside it for the body's vertical scrollbar, and the gap was a fixed 17px whatever the scrollbar measured. Overlay scrollbars (the macOS default) take no width, and neither does a table with too few rows to scroll, so the header's viewport was up to 17px narrower than the body's (2px with classic 15px scrollbars). At the far right the last header was cut off, and moving the keyboard cursor onto a header at the right edge left part of it hidden. A scrollbar wider than 17px did the opposite: the header could not scroll as far as the body and pulled it back, so the last few pixels of the table could not be reached. The gap now matches the body's scrollbar as measured, before the first paint, so `--dt-scrollbar-width` no longer has a visible effect.

- a5b9459: ### Fixed

  - Hiding or removing the column the keyboard cursor is on moves the cursor to the column in its place, not to the first column. That is the next column still shown, or the one before it when it was the last. For a pinned column it is another pinned column, which is always in view, or with none left, the first column at the left of the view. A derived column renamed while the cursor is on it keeps the cursor. The first column was far from where the user was: hiding a column far to the right, from its header's hide button for example, left the cursor off-screen with the view unchanged, and the next arrow key jumped the table back to its start.

- 97dd322: ### Fixed

  - A `createDataTable({ source })` whose load fails no longer leaves the table behind. It used to reject with the table still mounted in the container and, when it had created them, its worker running and its session store open, and the caller never got a handle to `destroy()` them. It now tears the table down as `destroy()` would, then rejects with the load's error. A `bridge` or `persistence.sessionStore` passed in stays open, though a table the load finished creating in that bridge is dropped, and the saved session is not written. The container is left ready for another `createDataTable`.

- c5778ae: ### Fixed

  - The published `dist/visualizations/LazyVizController.d.ts` type-checks again. It had lost its `ColumnSchema` import, because the build drops whatever an `@internal` tag is attached to and a tag in a file's opening comment is attached to the first import. No public entry point reaches that module, so only code that imported it directly saw the error. `npm run build` now type-checks every emitted declaration file.

- 15b5e66: ### Fixed

  - The SQL filter modal shows its Remove section when it edits an expression filter. The stylesheet hid the section in both modes, and opening a filter for editing only cleared an inline style, so the modal never offered Remove; the filter's chip was the only way to remove it. The section is also `hidden` outside edit mode, so a table with a class prefix of its own never shows it when creating a filter.
  - Closing the SQL filter modal after editing a filter gives focus back to the filter bar's Expression button. Focus used to drop to the page: the filter's chip, which opened the modal, takes no focus, and updating or removing the filter rebuilds it. `SQLFilterModal.openForEdit()` takes an optional `returnFocus` for hosts that open it themselves.
  - Delete confirmations keep keyboard focus in their dialog, in the SQL filter modal, the derived-column editor and the filter-preset panel. The Remove or Delete button hides itself to show the confirmation, which took focus with it to the page, where `Tab` and `Escape` no longer reached the dialog. Focus now moves to the confirmation's Cancel or No, and back to Remove or Delete if you cancel, or if deleting a derived column fails. Deleting a filter preset, which rebuilds the list and leaves the panel open, puts focus on the next preset's Delete button, else the previous one's, else the name field.
  - Two tables on one page no longer share the radio buttons of their dialogs. The export dialog's format and scope, and the derived-column modal's mode, were named after the class prefix alone, and radio buttons that share a name form one group across the page: adding the second table's export dialog, with its defaults checked, unchecked the first's, which then opened with no format or scope checked. Each dialog now names its radio groups after its table's instance id. An export dialog or derived-column modal constructed without an `instanceId` generates its own, for its element ids too.

- d562f40: ### Fixed

  - The action buttons of a column narrower than them no longer spill over the next header at rest. A header's five buttons need about 135 px, and a column can be 50 px wide. Past the header's edge, they sat under the next header, which covered them and took their clicks. A narrow pinned column was worse: its buttons lay over the first unpinned header and took the clicks meant for it. The action bar now clips its buttons at the header's edge.
    - **Every action stays reachable.** Once the pointer has rested on the bar for 200 ms, or at once when keyboard focus is in it (`F2`), the bar shows every button, running on over the next header's bar. `F2` scrolls the table so the button it focuses is in view. The last column's bar runs on leftward instead, over its own header and the one before, so it neither leaves the view nor widens the header's scroll range.
    - **While shown, a narrow column's bar sits on top of the next header's first buttons,** visibly, until the pointer leaves it. A pointer passing along the row of bars without pausing reveals nothing, so a click there lands on the button under it.

- 8c751eb: ### Fixed

  - Opening a filter panel now moves focus into it. The panel gave focus to its first control, the Clear button, which is hidden until the column has a filter, and focusing a hidden button does nothing, so focus stayed on the header's filter button, outside the panel. With the hidden button counted as the panel's first control, `Shift+Tab` from the Close button also walked out of the panel. Panels and dialogs now skip controls that a stylesheet hides, using `checkVisibility()` where the browser has it and computed styles where it does not.
  - `Tab` no longer walks out of an open filter panel from its last control. The panel ends with the null filter's three radio buttons, which the browser treats as one stop, at the checked radio. The focus trap waited for focus on the group's last radio instead, so from any other one `Tab` left the panel.
  - Clearing a column's filter with the keyboard no longer drops focus out of the filter panel. The Clear button hides itself, and it took focus with it to the page, where `Escape` no longer closed the panel; focus now moves to the Close button first.

- 4058b57: ### Fixed

  - Closing a filter panel or a derived-column editor gives focus back to the header button that opened it for the column it shows. After switching the panel to another column by clicking that column's button, focus used to go back to the first column's button, which could be far out of view.

- 82a8adf: ### Fixed

  - Showing a hidden column no longer puts it in front of a column pinned while it was hidden. It went back next to the neighbours it had when hidden; if one of them had been pinned since, the restored column landed before the pinned block, the pinned divider cut through it, and `aria-colindex` stopped ascending along the header row (3, 1, 4). An unpinned column now goes after the pinned columns, and a pinned one back to its place in pin order among them.
  - A column shown back next to its old neighbours also moves there in `columnOrder` when a reorder since then had filed it elsewhere, so `visibleColumns` always follows `columnOrder`. `aria-colindex` is numbered from `columnOrder` and could descend after such a show.
  - Pinning or unpinning a column changes `pinnedColumns`, `columnOrder` and `visibleColumns` in one update. A `pinnedColumns` subscriber no longer sees the pinned column outside the pinned block, and a `TableBody` used directly no longer fetches its rows again on a pin change.
  - `toggleColumnPin` ignores a column name the table does not have. It pinned it and added it to `columnOrder`, where the phantom shifted every later column's `aria-colindex`. A stale pinned name is unpinned without being added.

- 534055a: ### Fixed

  - `setColumnOrder` keeps the pinned columns first, hidden pinned columns included.
    - **What went wrong:** an order that put a pinned column after an unpinned one left it sticky at the left edge over another column, and out of step with the pinned divider.
    - **How it happened:** besides code calling `setColumnOrder`, dragging or moving a column to the front with the keyboard while a pinned column was hidden did it. Pinning another column then put it after the moved one.
    - **The pinned columns' order:** they keep the order given, and a pinned column hidden and shown again goes back to its place among them.
    - **One update:** `columnOrder`, `visibleColumns` and `pinnedColumns` change together, so a subscriber to any of them sees the others already updated.
  - A restored session keeps the pinned columns first too, and shows its columns in the order the table last showed them, with hidden ones kept beside their old neighbours.
    - **Undo and redo:** the entries saved with the session get the same fix.
    - **Old sessions:** sessions saved before the column actions kept pinned columns first could restore a pinned column out of place, or undo back to one, with `aria-colindex` descending along a row. A pinned column in such a session now moves into the pinned block.

- cd45424: ### Fixed

  - Loading a Parquet `File`, `Blob` or URL no longer fails once DuckDB's memory has grown past 2 GiB, which a few large loads in one page reach. Such a load failed with "too small to be a Parquet file" or "Prefetch registered for bytes outside file … file size: 0", and so did every load after it: duckdb-wasm's runtime lost the size of any file it opened at a memory address above 2 GiB. The library now corrects this in DuckDB's worker.

- 16d217b: ### Fixed

  - A row fetch that fails, or comes back short, is no longer issued again at once.
    - **Before:** the body repeated it as fast as DuckDB answered, for as long as the failure lasted, and logged `Error fetching rows` each time: thousands of failed queries in a browser test that held a derived-column change for a second.
    - **Now:** the same fetch waits 250 ms, then twice as long after each failure in a row, up to 8 s. A fetch of other columns or rows goes ahead at once, and a filter, sort or data change starts afresh.
  - Rows are not fetched, and filtered rows not counted, while a derived-column change can drop or rebuild the relation they come from: a removal, an edit or a replacement, an undo or redo, a reset, or a session restore rebuilding its derived columns.
    - **Before:** a scroll during one read from the VIEW it had dropped, or read a column it was removing, and every read failed. A filter added during one kept the row count from before it, and the rows past the true count stayed placeholders.
    - **Now:** both run once the change settles, whether it succeeded or failed. Adding a derived column leaves the relation readable until its last statement, so rows scrolled to or sorted while one is added load at once.
  - A table body whose row count dropped below the rows in view while its first fetch was in flight, as when a filter's count lands at zero, no longer asks for the same empty block over and over in one call stack until the stack overflows.
  - A derived column added while another of the same name is still being added is refused. The two shared a vector column's helper table, each dropping the other's.

- 5cc24ee: ### Fixed

  - A sideways scroll right after a filter change now stays where the user put it. For a second after a filter change, a table scrolled sideways put its horizontal position back every frame, which undid any scroll made in that second. A wheel scroll straight after brushing a chart went nowhere, and moving the keyboard cursor with `End` could leave it off-screen. The hold now ends at the first wheel, key press, click or touch in the table.
  - Hiding, showing, pinning or moving a column now puts the scroll position back as soon as the table is rebuilt, not a frame later. The table no longer flashes to its first column for a frame. The late restore also undid a scroll made right after the rebuild: moving a column to the far right with `Shift+F2` and then `Shift+End` left it off-screen. And it lost the position when the table was rebuilt twice in a row, as when a derived column is added: the table jumped back to its first column.
  - Adding a column with the + button now scrolls the table all the way to it. The smooth scroll to the right end was cut off after 600ms, before a wide table got there, and the new column was left out of view.

- f854109: ### Fixed

  - The first time a column was hidden, shown or moved after scrolling sideways, every column header slid in from where it was when the data loaded. The pin animation's saved positions are now used only by the change that saved them.

- 0e34cbe: ### Fixed

  - A smooth sideways scroll no longer builds a custom stats panel for every column it passes. The scroll to a derived column just added, across a 1,000-column table, built about 500 panels, and the charts at the far end waited more than 10 seconds behind their queries. A panel is now built once the columns near the view have held still for 150 ms. A column that scrolls away still loses its panel at once.

  ### Changed
  - While a column's panel waits to be built, its stats slot shows the table-wide row count, and its chart keeps its stats out of the slot. The panel's first `update()` receives them, and `setHoverStats()` the detail the chart shows then, such as a committed selection's. The slot no longer shows the chart's stats just before the panel replaces them.
  - A column that leaves the view's reach gets its stats slot back as it is without a panel, its chart's stats or the table-wide count, instead of whatever the destroyed panel left.

- 90a6a79: ### Fixed

  - Two tables sharing a `WorkerBridge`, each with a vector derived column of the same name, no longer share one DuckDB helper table. Before, the second add replaced the first table's values with its own, and removing the column from either table broke the other's VIEW. Helper tables are now named per derived-column manager, and a manager is numbered per bridge. That also keeps a table's new helper tables apart from those of the manager it replaced on a new load or an undo.
  - Destroying a derived-column manager, which a reset, a new load or an undo of a derived column does, now drops a helper table left by a vector add or edit that failed part-way through, instead of leaving it in DuckDB.
  - `destroy()` on a table sharing its bridge now drops the table's derived-column VIEW and vector helper tables as well as its base table. It waits for a derived-column change still running to finish first, so the change cannot rebuild one after the drop. Before, they stayed in DuckDB for as long as the bridge lived.
  - A `loadData()` still in flight when `clearSession()` is called no longer fires `loadComplete` with an empty `tableName` and a `rowCount` of 0 after the clear. The clear now deletes the snapshot of the table it empties, which is the one the load made. That table is also dropped once a load lands or on `destroy()`, instead of being left in DuckDB for good.
  - A load that a newer `loadData()` or `clearSession()` supersedes before it ends now fires neither `loadComplete` nor `loadError`. Its promise still resolves, or rejects if the load itself failed. Each `loadStart` is followed by at most one of the two.
  - A load that a newer `loadData()` supersedes no longer leaves its base table in DuckDB for good, even after `destroy()`; with 200K rows × 1,000 columns that was about 1.5 GB. `destroy()` during a load in flight, on a shared bridge, now drops both the table the load was replacing and the one it makes once it lands, instead of leaving both. Each load now reports the table it replaces as its turn begins, so whatever happens to the load, the next successful load or `destroy()` drops it.
  - Two loads of the same `tableName`, neither awaited, no longer risk one dropping the table the other has just made.
  - A table destroyed while a session restore rebuilds its derived columns no longer logs "Failed to restore derived columns"; the load rejects with `DestroyedError`, as a load destroyed at any other point does.
  - `clearSession()` and `resetToInitial()` now fire `derivedChange` (with `kind: 'updated'`) when they drop the derived columns, so a SQL editor refreshing its completions on that event no longer offers the dropped columns.

- 0ad8272: ### Fixed

  - The rows in view now follow the table body's height, not only its scroll position.
    - **Before:** a container that grew taller showed blank space below the rows rendered for its old height until the next scroll, one that shrank went on rendering rows out of view, and a table mounted hidden, in a closed tab or a collapsed panel, showed no rows once it was shown.
    - **Now:** the rows in view are worked out again whenever the body resizes, whatever resized it: the container, the window, or a filter bar that wraps onto another line.

## 0.9.0-next.0

### Minor Changes

- 8a9e949: `setOnFilterRemove` now fires for every way a filter can be dropped, not just undo, redo and reset — so a chart's brush no longer outlives the filter it created.

  The documented contract was always the broad one ("called when a filter chip is removed"). The code implemented a narrower one: `StateActions.notifyRemovedFilters` was reachable only from `undo`, `redo`, `resetToInitial` and the derived-column paths. `removeFilter` and `clearFilters` — which is to say the filter chips, the filter panel, and a chart clearing its own selection — never called it, so anything keyed to a filter went stale the moment a user removed one by hand.

  The visible symptom: drag a brush on a histogram, remove the resulting filter from its chip, then hide any column. The header row rebuilds, the chart is re-created, and the brush comes back — painting a selection for a filter that no longer exists, with the stats slot reading `60,000 rows` on line one and `24,271 rows (40.5%)` underneath.

  **Changed**

  - **`setOnFilterRemove` fires once per column that loses its filter, from every path that can drop one**: `removeFilter` (and so the chips, the filter panel, `removeRawSQLFilter`, and a chart clearing its own brush or selection), `clearFilters`, `loadFilterPreset` for columns the preset does not carry forward, plus the `undo` / `redo` / `resetToInitial` / derived-column paths that already fired. It is called synchronously once the signals have settled, so reading `state.filters` inside the callback shows the post-removal list.
  - **It still does not fire when a filter is merely replaced** — `addFilter` over a column that already has one, or a preset that hands that column a different filter. The column still has a filter, so state keyed to it is still live. Removal is judged per column, not per filter.
  - **`removeFilter` and `clearFilters` are now idempotent.** Asking to remove a filter that is not there writes nothing, notifies no subscriber, and pushes no undo entry; previously it set `state.filters` to a fresh array with identical contents, which woke every subscriber and cost a full filter cycle, and it recorded an undo step that made the first `Ctrl+Z` look broken. `clearFilters` still resets `filteredRows` to `totalRows` unconditionally — that repairs the count whether or not there was anything to clear.

    This is what makes the wider callback safe rather than merely correct: clearing a chart's brush calls `onFilterChange(null)`, which the crossfilter coordinator routes straight back into `removeFilter` while the removal that triggered it is still unwinding. Without idempotence every chip click would have cost a duplicate filter cycle and a dead undo step, and clearing _n_ filters would have cost _n_ of each.

  **If you registered `setOnFilterRemove`**

  On `table.actions`, don't: the callback has one slot, and the table fills it to clear its charts' brushes and selections, so registering your own replaces that handler. Listen to the `filterChange` event instead.

  On a `StateActions` you built yourself, you will now see calls you did not see before — one per column, on paths that previously stayed silent. Handlers should be idempotent and cheap: the callback fires synchronously inside the removal, and one user action can produce several calls. Removing a filter from inside the handler is safe.

  Nothing else changes. Filters, chips, presets, undo and redo behave as before; only the notification and the two no-op cases are different.

- c223b5e: ### Changed

  - Column-header charts are built only for columns near the view. A chart is created when its header scrolls within 200 px of the visible header row and removed once the header is 400 px away, and a filter change refreshes only the charts that exist. A column scrolled into view later gets its chart built with the filters in force then. On a 50,000-row × 1,000-column Parquet file in Chrome, `loadData` drops from 20.4 s to 6.2 s (2,004 queries to 22), a filter from 4.4 s to 0.5 s, and hiding a column from 20.6 s to 2.2 s.
  - `loadData`, and `await createDataTable({ source })`, now wait for the charts in view to draw their first data rather than every column's. In a hidden tab they don't wait for charts, and in a page the browser isn't rendering, such as a hidden iframe, they stop waiting after one second. Without `IntersectionObserver` (jsdom, for example), every column's chart is built at once, as before.
  - A custom visualization is now constructed each time its column comes within reach, and destroyed when the column leaves. Header rebuilds still re-create the ones near the view. One that throws in its constructor is reported once and not tried again until the next header rebuild. A custom stats panel gets `update(null)` again when its column's chart is removed.

  ### Added
  - `InteractionManager.replaceVisualization(columnName, viz)` points a column's brush or selection at another visualization without moving it on the Escape stack. Escape now still clears the most recent brush or selection when its column has scrolled out of view.

  ### Fixed
  - A chart's brush or selection is now always drawn from its column's filter. Hiding, showing, pinning or reordering any column used to put back a saved brush or selection, which after the filter was removed with its chip or Clear all drew a brush that no longer filtered anything.
  - `loadData` no longer resolves before the charts of a header rebuild that happens while it waits, such as a column change during the load.

- 28b4062: ### Added

  - `LoadError` code `LOAD_MEMORY_EXCEEDED`. A Parquet load that will not fit in browser memory now rejects before anything is loaded. The message names the check that failed — the table's share of DuckDB's free memory, or the load's peak against the 4 GiB WebAssembly limit — with its numbers, which `error.details` also carries (`check`, `neededBytes`, `availableBytes`, plus the estimated size, the memory limit, and the memory other tables already hold). If DuckDB still runs out partway through, the load rejects with the same code, `details.stage: 'load'`, and DuckDB's own message in `error.details.duckdbMessage` and at the end of `error.message`, and the partly built table is dropped. Such loads used to fail late with a raw DuckDB "Out of Memory" message under `LOAD_PARSE_FAILED`.

  ### Changed
  - A Parquet `File`, `Blob`, or URL is no longer read into memory before loading. DuckDB reads the file from disk as it builds the table, so the file no longer has to fit in memory alongside it. A 1.5 GB file of 200,000 rows × 1,000 columns now loads in about 35 seconds in Chrome; it used to run out of memory. Typical files load about as fast as before. A Parquet `ArrayBuffer` is still copied into memory whole, so pass a `File` or `Blob` for large files.
  - `table.loadData`, `actions.loadData`, and `WorkerBridge.loadData` accept a `Blob` directly. The facade used to convert a `Blob` to an `ArrayBuffer` first.
  - If you self-host the worker script (`bridgeOptions.workerUrl` or `workerFactory`), copy the new worker file when you upgrade. The main thread now posts a Parquet `File` or `Blob` to the worker as is, and an older worker file cannot read it, so every Parquet load from a `File`, `Blob`, or URL fails.

  ### Fixed
  - A load that fails no longer leaves the previous table in DuckDB for good. The next successful load, or `destroy()` over a shared `WorkerBridge`, drops it.

### Patch Changes

- 20b08c7: ### Fixed

  - Destroying a table while a filter's row-count query is still running no longer logs `[CrossfilterCoordinator] Failed to update filtered row count` when the terminated worker rejects that query. `CrossfilterCoordinator.destroy()` now also discards a count that settles afterwards: it no longer writes `state.filteredRows` or fires `onFilterCycleComplete` — relevant to `/advanced` users who drive the coordinator directly.

- 9d2827c: ### Fixed

  - A `tableName` containing a single quote (for example `O'Brien`) no longer breaks the load with a SQL parser error. Loaders used to register the source as `<tableName>.<ext>` and splice that name unescaped into `read_csv_auto('…')` / `read_json_auto('…')` / `read_parquet('…')`; the source file now gets a generated name, so the table name only ever reaches SQL as a quoted identifier.
  - A failure while unregistering the source file after a load no longer replaces the load's own error, or fails a load that succeeded.

- 2f5cb4b: ### Fixed

  - Converting text columns of ISO dates, timestamps, or times no longer loses values. The loader sampled 100 distinct values and converted the column if 95% of them matched, and any other value became `null` without warning. It now checks every value, and a column with one value that would not convert unchanged stays text: `N/A` or `2024-02-30`, which would become `null`, and `2024-03-15 (approx)`, `02:30:00 PM` or a seventh fractional digit, which DuckDB would cut. Blank values count as missing and become `null`, as before.
  - Text timestamps with a UTC offset (`2024-03-15T14:30:00+05:30`) now load as `TIMESTAMP WITH TIME ZONE`, displayed in UTC. They used to load as plain timestamps with the offset dropped, which shifted each value by its offset.
  - A Parquet file with text columns of dates no longer needs memory for a second copy of the table. The dates convert as the file is read, and the memory check counts them at their final size. A 200,000 rows × 1,000 columns file with 10 date columns now loads in about 12 seconds in Chrome; it used to run out of memory. CSV and JSON loads convert each date column in place instead of rebuilding the table.

- c610c6a: ### Fixed

  - Scrolling deep into a sorted or filtered table no longer runs DuckDB out of memory. Each block of rows used to be fetched by sorting every visible column down to the block's position, so DuckDB held all the rows above it in full; halfway down a sorted 5-million-row, 40-column table that exceeded the browser's WASM memory limit and the rows never loaded. The table now sorts only the sort columns and row ids to find the block, then reads that block's rows, which takes under a second at that size. Scrolls still slow down with depth when sorted or filtered.
  - Sorting the grid by an interval column now orders rows by duration. While the column was displayed, the grid sorted it by its text, so `100 days` came before `9 days`.

- a4ab723: ### Fixed

  - Timestamp cells now drop every trailing zero from the milliseconds. A whole-second value such as `2020-01-01 00:00:16.000` used to render as `2020-01-01 00:00:16.00`, and `.100` as `.10`; they now render as `2020-01-01 00:00:16` and `.1`, matching the documented format.

## 0.8.0

### Minor Changes

- c94803d: Column-header stats now measure every count against the full dataset total, fixing the confusing filter-dependent denominators on filter-participant columns.

  **Display changes**

  - Line 1 (the row-count line) is now identical on every column and never disappears: `F / N rows` — rows passing **all** active filters out of the dataset total. It shows whenever any filter is active, including when `F == N`.
  - A column whose own filter has a chart representation shows a committed detail below line 1: its selection label (`Bin: 30 – 40`, `Category: US`, `Selected: a, b`) plus `X rows (p%)`, where `X` is what that filter **alone** matches in the unfiltered data and `p% = X/N`. The old `Count: fg / bg (ratio)` form — whose denominator was the selection's own post-filter count — is gone.
  - The committed detail is stable when other columns' filters change (previously it went stale), and identical regardless of how the filter was created: chart gesture, funnel panel, `actions.addFilter`, preset load, session restore, or undo/redo (previously panel/API-created filters displayed differently until first hover).
  - Hover swaps only the detail region: `800 rows (8.0%)` — the bin's share of the dataset — plus `· 300 match` for its rows passing all filters when filters are active.
  - Filters with no countable chart representation produce no committed detail; line 1 and the funnel indicator still reflect them. This covers pattern and raw-SQL filters, and — on categorical columns — any filter naming a value folded into the `Other` segment: the chart knows Other's total but not its membership, so `IN`/`=` on a folded value would undercount and `NOT IN` would overcount by that value's rows. Filters produced by the chart's own gestures are always countable, including the `NOT IN` emitted by clicking Other.
  - Non-visualization columns' stats are now filter-aware on first paint and localized (previously hardcoded English).

  **API surface**

  - `Strings.statistics` gains `binLabel`, `categoryLabel`, `selectedLabel`, `nullBinLabel`, `otherCategory`, `allUniqueCategory`, `selectionRowCount`, `matchCount`, `valueListSuffix`. Runtime-compatible for all consumers (deep-merge defaults); consumers hand-authoring a **complete** `Strings` literal must add the new keys to satisfy the type.
  - `VisualizationOptions` gains optional `messages?: Strings` — custom visualizations can localize their stats text; omitted, English defaults apply.
  - New named exports from `src/statistics/StatsFormatters`: `formatStatsLine1`, `formatStatsLine2` (internal module path; the public `formatDefaultStats` output is unchanged apart from the `F == N` rule).
  - `BaseStatsPanel.setHoverStats` contract is unchanged, but the pre-formatted HTML strings it receives use the new format, and committed selections now also arrive through it (persisting until the filter clears).

## 0.7.0

### Minor Changes

- 55193b9: The scrollbar now reaches the last row at any dataset size, and rapid scrolling no longer flashes stale or shifting cell values. Both fixes target datasets in the millions of rows, where browser height limits and DuckDB query latency expose failure modes that are invisible at 100K rows.

  **The scroll spacer is capped at 15,000,000 px with dual-mode scroll-space compression.** Browsers silently saturate element heights (Blink/WebKit at ≈33,554,431 px, Gecko at ≈17,895,697 px), so the old `totalRows × rowHeight` spacer stopped growing partway through a large dataset and stranded the scrollbar — at the default 32 px row height, a 1.5M-row table bottomed out near row ~1,048,576 in Chrome and ~559,240 in Firefox. `setTotalRows()` now writes `min(totalRows × rowHeight, 15,000,000)` px (`src/table/VirtualScroller.ts:434`); datasets at or below 468,750 rows at 32 px keep bit-for-bit the previous behavior. Above the cap, one virtual anchor is updated per scroll event: deltas up to a viewport height move linearly (wheel, trackpad, and keyboard feel unchanged at any scale), larger jumps (thumb drags, `Home`/`End`) map proportionally, and the top and bottom edges reconcile exactly — `scrollTop` 0 is row 0, max scroll puts the last row flush with the viewport's bottom edge. The mapping reads the measured `scrollHeight` at event time, so engines that clamp below 15M px (Chrome at high zoom) self-correct. The viewport is positioned via inline `style.top` instead of `transform: translateY(…)`, which is float32 and quantizes above ~8.4M px.

  **Row fetching is block-quantized, cancellable, and never blocks a paint.** Every scroll frame renders immediately — cached rows as data, missing rows as placeholders that are swapped whole when their block arrives; a row whose cache entry was evicted demotes back to a placeholder rather than keep stale paint. Fetches are aligned blocks of `fetchBlockSize` rows (default 128) with at most 2 in flight, each with its own `AbortController` and an epoch guard: blocks scrolled out of the viewport (±1 block) are aborted mid-flight, and results from before a filter/sort/data change are dropped. When the view is unsorted and unfiltered, blocks are fetched by a `__rowid__` range predicate — zonemap-pruned, roughly constant cost at any scroll depth — with a runtime density valve that falls back to `OFFSET` pagination if a result is ever inconsistent; sorted and filtered fetches keep `ORDER BY … LIMIT n OFFSET k` with the deterministic `"__rowid__" ASC` tiebreaker. Scroll SQL bypasses the SQL-text query cache (`cache: false`), so a fast scroll no longer evicts header-stats and histogram entries.

  **New options and surface.** `createDataTable` accepts `fetchBlockSize` (128, clamped 16–1024), `rowCacheRows` (row-cache capacity, default 2048, rounded up to whole blocks with a 4-block floor, whole-block eviction keyed to the live viewport), and `prefetch` (default `true`, one direction-aware block ahead at normal worker priority). On the `/advanced` surface, `VirtualScroller.getVirtualScrollTop()` returns the virtual-space scroll position (identical to `getScrollTop()` below the cap) and `VirtualScrollerOptions.maxVirtualHeight` overrides the spacer cap — primarily a test hook. `WorkerBridge.query(sql, signal?, options?)` gains `QueryOptions` (`{ cache?: boolean; priority?: 'high' | 'normal' }`).

  **The worker executes queries serially with priority scheduling and genuine cancellation.** Messages drain through an explicit two-priority FIFO — `'high'` for viewport row fetches, `'normal'` for everything else — with one query running at a time; SQL already serialized inside DuckDB-WASM's single-threaded worker, so this trades nothing real for truthful cancel targeting. A cancel bypasses the queue: a still-queued target is dequeued without DuckDB ever seeing it, and the running query is genuinely interrupted through the connection's pending-query path (`conn.send()` + `cancelSent()`) instead of running to completion behind the scenes.

  Verified in a real browser against the originally reported dataset (1,510,911 rows × 9 columns): dragging the scrollbar thumb to the bottom lands on the true last rows, the midpoint lands within ±0.5% of the proportional row, `Ctrl+End`/`Ctrl+Home` reach both extremes, and ten seconds of scroll-storming settles to correct, stable values with `data-row-id === data-row-index` on every rendered row. Playwright regression suites prove the same invariants at 1.6M and 2M rows, with mid-storm probes asserting zero self-inconsistent rows.

  Symptom this fixes: dragging the scrollbar to the bottom of a 1.5M-row table showed rows from the middle of the dataset (stuck near row ~1,048,576) instead of the last rows, and rapid scrolling flashed values that changed in place or differed between visits to the same scroll position.

## 0.6.0

### Minor Changes

- 332374a: Column-header plots now map every x inside the plot to its nearest bar or segment, so the gaps between bars are no longer interaction dead zones.

  `SharedHistogramBase` and `ValueCounts` hit-tested x against each bar's or segment's exact bounds, so the space between them — 15% of bar width on histograms with 5 or fewer bins, a 1px seam on value-counts — belonged to nothing. Scrubbing across a plot made the hover highlight flash off at every gap, a click that landed in one did nothing, a drag that _started_ in one started no brush, and a press a pixel past a committed brush's edge cleared the filter and immediately re-created a one-bin one — two `filterChange` emissions for what reads as a slide.

  Every x-hit-test in the library now shares one rule: every x inside a plot's horizontal extent belongs to exactly one slot, and the gap between two neighbouring slots splits at its midpoint. The histogram's null bar is a slot too, so `LAYOUT.nullBarGap` splits rather than falling wholly to the last bar, and a null bar crossfiltered to zero is hoverable but inert on click, exactly like a ghost bar. x _outside_ the extent still belongs to nothing, so clicking the paddings, the label band, or any y outside the bar band still clears a selection. `slideBrush` now derives its snap step from the laid-out bar positions instead of `barPositions[0].width + LAYOUT.barGap`, which drifted a sliding brush off its bins whenever the few-bin gap ratio applied.

  One behavior trade comes with the uniform rule: a single-value histogram draws one deliberately narrow bar centered in the chart area, and the rule hands that bar the whole chart area. There are no inter-bar gaps there, so nothing flickered either way — the change buys a much larger target for a small bar at the cost of the in-chart "click blank space to clear" escape, which stays available via the paddings, the y-bands, double-click, and Escape.

  Symptom this fixes: scrubbing the mouse across a low-cardinality integer column's histogram made the highlighted bar flash on and off as the cursor crossed each gap, and clicks that landed a pixel or two off a bar were silently swallowed.

- e8375c0: Column resize and column reorder are now fully operable from the keyboard, through one modal gesture on the header cursor that costs no tab stop, and `aria-colindex` follows the presented column order instead of the schema.

  Issue #84 made every per-column control keyboard-reachable except two: the resize handle (`role="separator"`) and the header drag handle. Both were deliberately left out of `ColumnHeader.getControls()` and so out of the `F2` controls-mode cycle, because a focus stop whose `Enter` key does nothing is worse than no stop at all — and because ARIA requires a _focusable_ separator to carry `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, so the cheap fix would have traded a WCAG 2.1.1 (Keyboard, Level A) gap for an `aria-required-attr` violation. That left two operations available by mouse and programmatically (`actions.setColumnWidth`, `actions.setColumnOrder`) but not by keyboard at all.

  **`Shift+F2` on a column header opens column layout mode.** Inside it `←` / `→` resize by 16px clamped to the same 50–500 bounds the mouse drag uses, `Shift`+`←` / `→` move the column one position, `Home` / `End` jump to the width bounds, `Shift`+`Home` / `End` move to the first and last position the column may occupy, `Backspace` resets the width to the default (the double-click path), `Enter` commits, and `Escape` restores the entry width **and** the entry position. `Shift+F2` was chosen as the sibling of the existing `F2` "enter this cell's controls" gesture: nothing in the browser, the OS, or NVDA / JAWS / VoiceOver binds it, and it collides with nothing already in the grid keymap.

  Nothing becomes focusable. The mode is a state machine in `KeyboardNavigator` and real DOM focus stays on `.dt-grid` throughout, which is what keeps the separator out of the accessibility tree as a widget and keeps the tab-stop census at exactly five. The #84 invariant holds unchanged — `claimGridFocus()` is still called from the individual action paths rather than once up front, so `Tab` is never intercepted in the new mode either; walking out of the grid commits the gesture on the way. Because the mode has no DOM-focus correlate it has to be stored rather than derived, which is the failure mode #84 diagnosed for controls mode, so the desync risk is closed three ways: the gesture is keyed by column **name** (a move rebuilds every `ColumnHeader`, so anything else would be stale one keystroke in), every keystroke re-validates that the cursor still names that column on the header row and that no header control has taken focus, and `focusin` / `focusout` listeners on `.dt-grid` close it the moment focus moves off the grid element.

  The gesture is **one undo entry**, however many keystrokes it took. `StateActions` grows `beginColumnLayoutChange()` / `endColumnLayoutChange()` / `cancelColumnLayoutChange()`; `beginColumnWidthChange()` / `endColumnWidthChange()` become thin delegates, so the existing `ColumnResizer` wiring is untouched and the mouse drag inherits the same bracket. The suppression flag is deliberately separate from `suppressUndoCapture`, which `toggleColumnPin` clears in a `finally` and would otherwise clobber a live gesture. The commit pushes **only if the state actually changed**, which fixes a real bug on the mouse path as well: a mousedown and mouseup on the resize handle with no movement in between used to push an undo step that undid to an identical state, so the first `Ctrl+Z` after a mis-click appeared to do nothing.

  Discoverability is the part that is easy to get wrong, so the key is named in four places: `aria-keyshortcuts="Shift+F2"` on every `.dt-col-header`, the drag handle's `title`, the resize handle's `aria-label`, and a live-region announcement on entry that reads the whole key map aloud. All of it is translatable — eight new `a11y` string leaves, plus the two existing handle strings.

  Announcements needed somewhere to go. `TableContainer.updateLiveRegion()` takes no arguments and rebuilds its whole sentence from filter, sort and row-count state on every flush, so anything written into that node is clobbered by the next frame. A second `role="status" aria-live="polite"` region (`.dt-announce`) now carries transient messages via a public `TableContainer.announce(message)`. Width and order changes were silent to a screen reader before this — **for the mouse too**, not just the keyboard — so `ColumnResizer`'s drag end and the drag-to-reorder callback announce through it as well.

  **`aria-colindex` now numbers from `state.columnOrder`, not from `schema`.** WAI-ARIA defines it as a column's position in the _presented_ table and requires the values to ascend in DOM order within a row — a MUST, not a SHOULD. Rows render in `visibleColumns` order while the index came from the schema, so moving the third column to the front made a row report `3, 1, 2`: assistive tech announced the wrong position and "go to column N" landed in the wrong place. `visibleColumns` is a filter over `columnOrder`, so indexing into it ascends by construction, while hidden columns still leave the gaps ARIA uses to signal "columns not present here". `aria-colcount` stays `schema.length`. `TableBody` also subscribes to `columnOrder` now, since a reorder leaves the schema untouched and the indices would otherwise freeze at their pre-reorder values.

  Two more adjacent bugs fixed alongside. Drag-to-reorder could drop an unpinned column _inside_ the pinned block — `ColumnReorder.updateDropPosition` used raw header midpoints with no pinned guard, while `TableContainer.updatePinnedColumnStyles` and `TableBody.updateRowContent` both compute sticky `left` offsets assuming the pinned columns lead, so every offset after the drop desynced. A new exported `clampUnpinnedIndex()` holds the drop out of the pinned prefix, and the keyboard move uses the same helper; a pinned column refuses to move outright, matching the mouse, whose drag handle is `pointer-events: none` while pinned. And `TableBody` no longer invalidates its row cache when a `visibleColumns` write only permutes the set — rows are keyed by column name, so a re-render suffices.

  Verified in a real browser on the 266-column CSV from #84, with a fresh profile. `Shift+F2` from the header cursor announced the full key map; three `→` and one `←` took the column from 150px to 182px, `End` to 500 ("maximum"), `Home` to 50, and `Backspace` back to the 150px default without the browser navigating back. Two `Shift+→` announced "moved to column 3 of 266" and `Shift+End` put it at 266 of 266, with the cursor riding the column rather than the position. `Escape` restored both — position 1, width 150 — and pushed nothing. A committed gesture of four resizes and three moves left the column at position 4 and 214px wide, and a single `Cmd+Z` restored all seven mutations and emptied the undo stack. `aria-colindex` ascended strictly across all 266 headers after the reorder, with a gap where the hidden `__rowid__` column sits, and the body cells matched. `.dt-root` held exactly five tabbable elements before, during and after the gesture; crossing the table took six `Tab` presses forward and six `Shift+Tab` back, with an open gesture and without. `axe.run('.dt-root')` with every rule enabled — 88 rules, contrast included — reported zero violations and zero incomplete results in both themes with layout mode active.

  One measurement did not come out the way it was meant to, and is worth stating rather than burying. Skipping cache invalidation on an order-only write was expected to cut the cost of a keyboard move at 266 columns; measured before and after, it changes nothing at the container level. One move issues 534 DuckDB queries either way, and **none of them are body-row fetches** — they are the column-header stats and plot queries from `TableContainer.render()` destroying and rebuilding all 266 headers on any `visibleColumns` write, which also rebuilds the `TableBody` wholesale. The fix is still correct and still lands where `TableBody` is driven directly (it is a `/advanced` export), but the real cost of a wide-table reorder is the header rebuild, and reusing headers across a reorder is a larger change than this one.

  Symptom this fixes: a keyboard-only user could sort, pin, hide and filter any column but could not resize or reorder one at all — the resize handle and the drag handle took no focus and answered to no key. `Shift+F2` on a column header now opens a mode where the arrow keys resize it, `Shift`+arrow moves it, `Escape` puts both back, and one `Ctrl+Z` undoes the whole thing.

- e90e9e2: Tab now moves through the table instead of getting stuck in it, every per-column control is reachable from the keyboard, and the grid implements the WAI-ARIA grid pattern properly.

  `KeyboardNavigator` called `e.preventDefault()` on every `Tab` before deciding anything, from a bubble-phase listener on `.dt-root` — so it swallowed Tab from the root and from every descendant, and `moveFocusTab` then returned at the grid boundary with the default already suppressed. `.dt-root` also carried `tabindex="0"` under a `.dt-root:focus { outline: none }` rule, so Tab from the page landed on the table invisibly and the next Tab went nowhere. On a 266-column table, `document.querySelector('.dt-root :focus')` stayed `null` across 900+ consecutive Tab presses — a WCAG 2.1.2 "No Keyboard Trap" (Level A) failure that also took 2.1.1 (the ~1,600 header buttons were unreachable) and 2.4.7 (the grid's only tab stop hid its focus ring) with it.

  Deleting the `preventDefault()` turned out not to be enough on its own. Focus ownership simply moved from `preventDefault()` to a `focus()` call: the dispatcher reclaimed `.dt-grid` for _every_ key that got past its cursor-key gate, `Tab` included, so by the time the browser looked for the next element in sequential order it was starting from the grid again — and walked straight back into the grid's first tabbable descendant. Forward `Tab` looped on `.dt-header-scroll` indefinitely (80 consecutive presses, no escape, at 4 columns and at 266); `Shift+Tab` still got out, because backwards from `.dt-grid` lands before it rather than inside it. The invariant that closes it for good is now the first thing `KeyboardNavigator`'s header comment says: **a branch that does not act on a key must not move focus either.** `claimGridFocus()` is called from the individual action paths — the cursor moves, the Enter/Space sort, the row-select toggle, Escape — instead of once up front, so an unhandled key is inert by construction rather than because somebody remembered to enumerate it.

  The `Tab` branch and `moveFocusTab` are deleted outright — no boundary logic that can regress — and the ARIA grid moves onto a new inner `.dt-grid[role="grid"][tabindex="0"]` that wraps only the header area and the body scroller. `.dt-root` keeps its class, border and container name but sheds its role, `tabindex` and `aria-*`: it hosts the grid _and_ the toolbar filter bar, the status live region and the toolbar hidden-columns gutter, none of which a grid may own. The whole table now contributes exactly five tab stops — the filter bar, the grid cursor, the header and body scroll regions, which WCAG 2.1.1 requires to be keyboard-reachable, and the hidden-columns gutter — and that count holds at any column count, with any number of columns hidden and any number of filters active. The filter bar and the gutter reach one stop each by being `role="toolbar"`s with the APG roving-tabindex treatment rather than plain rows of buttons: the gutter used to emit a focusable button per hidden column, so hiding 250 of 266 columns added 251 stops, most of them clipped out of sight by the gutter's own `max-height`, and the filter bar added one per chip. The three grid stops disappear before data is loaded. Everything else inside is `tabindex="-1"`, and the cursor is published through `aria-activedescendant` rather than by moving DOM focus, because the body's pooled row recycler would otherwise carry real focus into the pool. Since a click parks real focus on whatever it hit, the grid takes focus back on the next cursor keystroke rather than on the click, which keeps pointer interactions — and the annotation popovers that open on `focusin` — untouched. The cursor now spans the header row too (`focusedCell.row === -1`), so `↑` from body row 0 reaches the column headers, `←`/`→` walk them, `Enter`/`Space` sorts, and `F2` hands real focus to that header's buttons with `←`/`→` to cycle and `Escape` to come back. Body cells become `role="gridcell"`, `aria-rowcount` becomes the rendered row count plus 1 and body `aria-rowindex` becomes `row + 2`, since the header is row 1 under `role="grid"`.

  Two visual changes come with it. The filter bar moves above the column headers, since it cannot live inside the grid element. And a colour-token sweep clears the contrast bars the shipped defaults were missing. The light theme's `--dt-text-secondary` / `--dt-text-tertiary` darken to `#374151` / `#4b5563`, with dark-mode `--dt-text-tertiary` lifting to `#b8bfc9`: the old values were chosen to read on dark `#1f2937` but were used in both themes, leaving the column-header stats at 2.31:1 against a hovered header where AA wants 4.5:1. `.dt-col-stats`'s second line swaps `opacity: 0.8` for an explicit colour — opacity composites against whatever is behind the text, which is why that line failed contrast in _dark_ mode too. `--dt-arrow-default` / `--dt-arrow-hover` move to `#6b7280` / `#4b5563` in light and `#9ca3af` / `#d1d5db` in dark: they paint the only indicator that a column is sortable, pinnable or filterable, which is non-text content under WCAG 1.4.11 at a 3:1 floor, and gray-300 managed 1.41:1 on a resting header. Dark-mode `--dt-primary` / `--dt-primary-hover` lift a full step to `#60a5fa` / `#93c5fd` for the same reason — the cursor ring read 2.80:1 against a hovered header — so filled buttons take `color: var(--dt-bg)` instead of white, because no blue light enough to serve as an indicator can also carry white text at 4.5:1. `--dt-success` and `--dt-syntax-string` darken to `#15803d` and light `--dt-error` to `#dc2626`, since all three are painted as text on near-white; `--dt-error-dark` / `--dt-error-darker` stay at `#dc2626` / `#b91c1c` in both themes, because they are fills carrying white `--dt-on-error` rather than text. The tertiary/secondary distinction is quieter than before in both themes; that is the cost of clearing AA at 11.2px.

  Two trade-offs are deliberate. Column resize and drag-to-reorder stay mouse-only and are excluded from the F2 cycle rather than being given a focus stop that does nothing on Enter — keyboard resize and reorder need designed gestures, which is a feature rather than this fix, tracked as issue #87. And an unloaded table now carries no grid semantics at all: the empty shell owns no rows, so `role="grid"` on it would be an `aria-required-children` violation, and a tab stop with nothing to navigate is noise.

  Three smaller ARIA corrections ride along, all in code this change was already rewriting. `aria-rowcount` now counts the filtered rows rather than the total, so a five-row result no longer announces "row 3 of 5,001". The grid picks up its semantics even when a caller sets the table name after the schema, which previously left it permanently roleless. And filtering from the header row no longer wipes the cursor — the header exists regardless of how many data rows survive.

  Tab stops also have to survive the table redrawing itself. The cursor rides on `aria-activedescendant`, but that only resolves while real DOM focus sits inside the grid — and the body is a pooled virtual scroller that detaches the row you are standing on at the slightest provocation. Five places in `TableBody` removed a node that could be holding focus, and none of them said anything about it: the full re-render returning every row to the pool, the scroll recycler evicting rows that left the visible range, the pooled-row replacement when a recycled row has the wrong cell count, the surplus-cell trim on a row that itself survives, and `destroy()` detaching the whole viewport subtree — which `TableContainer.render()` triggers on every schema or `visibleColumns` change. Detaching a focused node drops focus to `<body>`, so from that moment every keystroke goes to the page instead of the grid, with nothing on screen to say the keyboard layer is gone. Each of those sites now hands focus back to `.dt-grid` before the node leaves the tree. `TableContainer` had the mirror-image bug on the way back in: it restored focus after a render whenever focus had been inside the table before it, so a `Tab` that landed _outside_ the table during the render's animation frame got reeled straight back — trapping by rescue rather than by `preventDefault()`. It now remembers the specific element rather than a boolean, and restores only when that element is gone from the table _and_ focus has fallen to nothing.

  Four more ARIA corrections come out of the same pass. Unselected rows carry `aria-selected="false"` rather than nothing, because inside a `role="grid"` an absent `aria-selected` announces "not selectable at all" for rows that answer to click, ctrl-click and shift-click; the grid pairs it with `aria-multiselectable="true"`, without which those same rows announce a single-select grid. Loading placeholder rows carry `aria-busy="true"` — a placeholder is one cell against a grid advertising N columns, and padding it out to N is not an option, since cell count is exactly how the renderer tells a placeholder from a data row. The header row is mounted only once it actually owns headers, because a childless `role="row"` is a critical `aria-required-children` violation and an empty visible set is reachable both permanently, through `setColumnOrder([])`, and transiently, whenever `schema` and `visibleColumns` land as separate signal writes. And `instanceId` now always picks up a random suffix, including one you supply: two tables handed the same value used to mint identical cell ids and publish an `aria-activedescendant` that resolves document-wide to whichever grid comes first. `DataTable.instanceId` reports the resolved value, which is the one actually in the DOM.

  `aria-required-children` is no longer disabled in the axe suite — leaving it off is what let the original violation sit unnoticed. Two new source-level tests cover what neither jsdom nor axe can see: `tests/styles/contrast.test.ts` computes WCAG ratios straight from the token declarations, and `tests/styles/focusIndicator.test.ts` asserts that the cursor ring is re-composed against every annotation and filter tint that sets `box-shadow` on the same element at the same specificity — an omission that would silently erase the focus indicator on exactly the columns a user is most likely to inspect.

  Verified in a real browser against the reported setup. On a 266-column table with 1,330 header buttons, the whole `.dt-root` subtree holds five tabbable elements — the filter bar, `.dt-grid`, the two scroll regions and the hidden-columns gutter — and the same five at 4 columns, with six of eight columns hidden, and with three filters applied. A Tab from the control before the table reaches the one after it in six presses — five to walk the stops, one to leave — Shift+Tab retraces in the same six, and the walk passes _through_ the grid rather than around it. Neither held before: forward Tab never escaped at all, looping on `.dt-header-scroll` for as long as it was pressed, and the census stood at six elements at rest, thirteen after hiding six of eight columns, ten with three filters applied. The issue's own probe, `document.querySelector('.dt-root :focus')`, resolves to `.dt-grid` with a visible 2px ring where it used to stay `null`. `axe.run('.dt-root')` with every rule enabled — contrast included, which jsdom cannot compute — reports zero violations in both themes, with `aria-required-children`, `scrollable-region-focusable` and `color-contrast` all landing in the passes bucket, including with the hovered-header and selected-hovered-row backgrounds forced.

  Symptom this fixes: pressing Tab with focus just before the table never got past it — focus vanished, no control inside ever showed a ring, and neither Tab nor Shift+Tab could get back out without reloading the page. Tabbing past the table now takes six presses in either direction — five stops inside it, one to step off — and stays six as columns are hidden and filters pile up.

### Patch Changes

- 8d6de0c: Documentation: the mount container's bounded height is now stated as a requirement everywhere a user meets the mount API, instead of appearing only as an unexplained `style="height: 600px"` in a handful of snippets.

  The library is virtualized against the container. `VirtualScroller` reads `clientHeight` off the internal `.dt-body-scroll` element (`src/table/VirtualScroller.ts:245`) and renders `⌈clientHeight / rowHeight⌉ + 2 × bufferRows` rows, `bufferRows` defaulting to 5 (`:257-262`, `:103`). Nothing in the stylesheet introduces a height of its own — `.dt-root { height: 100% }`, `.dt-grid { flex: 1; min-height: 0 }` and `.dt-body-scroll { flex: 1; overflow: auto; min-height: 0 }` (`src/styles/02-shell.css:11-19`, `:33-38`, `:448-452`) each take what the level above gives them, so the mount container is the only place a concrete number can enter. There is no `height`, `maxHeight`, `minHeight`, `autoHeight` or `fitToContainer` option; sizing is the host page's job and the library never writes styles onto the element it is handed.

  **When the container is content-sized the chain runs backwards and virtualization disappears.** `setTotalRows()` writes an explicit `rowCount × rowHeight` px height onto `.dt-body` so the scrollbar is proportioned to the whole dataset (`VirtualScroller.ts:300-308`). `overflow: auto` on `.dt-body-scroll` clips that only while the scroller is constrained from above; against an auto-height parent `.dt-root`'s `height: 100%` resolves to `auto`, so `.dt-body-scroll` grows to fit its content rather than clipping it and `clientHeight` comes back as the height of the entire dataset. The computed visible range is then every row: a single `LIMIT <totalRows>` query (`src/table/TableBody.ts:732`) and one DOM row per result (`:812`). At 1M rows and the default 32px `rowHeight` that is a 32,000,000px element, `LIMIT 1000000`, and a million rows of DOM, where a 600px container would have rendered about 29.

  Two properties make this worth documenting loudly rather than filing as a footnote. It is **silent** — no thrown error, no `warning` event, nothing in the console. The one diagnostic that exists (`src/table/TableContainer.ts:357-368`) fires only when `getBoundingClientRect().height === 0` at construction, and an unbounded container has a perfectly ordinary non-zero height, just the wrong one, so it never trips. And it **scales invisibly**: on a few-hundred-row development fixture, rendering everything is fine, so the mistake ships and only surfaces on production-sized data, by which point the symptom (a frozen tab) looks nothing like its cause (a missing CSS rule).

  The requirement is now on every surface where a user or an agent writes mount code. `README.md` grows a `## Sizing the container` section — the canonical treatment, covering both correct layouts, the `min-height: 0` trap, the ancestor-height chain, and both failure modes — and the quick start leads with the container markup instead of starting at the JS. `docs/performance.md` states it as a prerequisite in the opening, since every threshold in that document assumes it, expands `### The virtual scroller` with the full mechanism, and adds it as the first entry under common pitfalls with a pasteable DevTools check. `docs/concepts/architecture.md` gains `### The height chain` and `### Why an unbounded container defeats virtualization` for the reader who wants the trace. `docs/troubleshooting.md` gains two FAQs — one for the slow/frozen symptom, one for the blank-table symptom — plus a `## Warning events` row for the zero-height `console.warn`, which had never been documented anywhere. `docs/api-reference.md`, `docs/glossary.md` (new **Mount Container** and **Virtual Scrolling** entries — the latter had no glossary entry at all), `docs/README.md`, `examples/README.md`, `llms.txt`, all nine integration guides and `docs/guides/theming.md` are updated in proportion, the last of these because a reader looking for sizing guidance lands on the `--dt-*` token table and needed to be told those tokens are not how you size the table.

  `AGENTS.md` gets the heaviest revision, because its canonical snippets are copied verbatim by coding agents and snippet (a) previously showed a bare `createDataTable()` call with no container markup — propagating the bug by construction. Snippet (a) now leads with the sized container, the section preamble makes the bounded height an assumption of every later snippet, the cheat-sheet states that container height is not an option, and the unbounded container is now pitfall 1.

  The public `container` option's JSDoc (`src/DataTable.ts`) carries the requirement too, so it appears in editor tooltips and in the generated reference rather than only in prose a reader has to go looking for.

  One real defect fixed along the way: `docs/integrations/vue.md`'s "Subscribing to events" snippet mounted into a bare `<div ref="host" />` with no height at all — a documented example that reproduced exactly the failure being described. It now matches the sized container used elsewhere in that guide.

  Symptom this addresses: a user drops the table into a page, it works on their test CSV, and on real data the tab freezes for seconds, memory climbs into the gigabytes and scrolling becomes unusable — because the container was never given a height and the "virtual" scroller was faithfully rendering all million rows.

- ef8a7b9: `rowHeight` now drives the `--dt-row-height` token, so a non-default row height stops rendering stretched cells off-centre — and `rowHeight` / `headerHeight` no longer collapse to `undefined` when omitted, which had been silently dropping the header's `min-height` on every table built through `createDataTable()`.

  `rowHeight` reached the virtual scroller's arithmetic (`src/table/VirtualScroller.ts:257-262`) and the inline height on each row element (`src/table/TableBody.ts:970`), but never `--dt-row-height`. That token is not decorative. `.dt-row` takes its height from it, and — the part that broke — so does the `line-height` that re-centres text in every cell using `align-self: stretch`: `.dt-cell--focused` (`05-data-grid.css:244`), `.dt-cell--derived` (`03-columns.css:399`), and all three annotation-tint families (`05-data-grid.css:332`, `:354`, `:377`). Those cells deliberately opt out of the row's `align-items: center` so their background and left stripe fill the whole cell rather than just the text line-box, which leaves `line-height` as the only thing centring them. With the token stuck at its 32px stylesheet default, a table built with `rowHeight: 48` drew 48px rows in which the focused cell — and every annotated or derived cell — centred its text against a 32px line box and sat 8px high against its neighbours. The taller the row, the worse the misalignment.

  `TableContainer` now publishes both `rowHeight` and `headerHeight` as `--dt-row-height` / `--dt-header-height` on `.dt-root`. Written as inline declarations, so the option wins over a stylesheet override of the same token. That precedence is the deliberate half of the fix rather than an accident of implementation: the row height is also the scroller's scroll arithmetic — which rows exist, where the viewport sits, how tall the scrollable content is — and that runs in JS where a stylesheet value is not visible. Letting CSS move the row height on its own would simply relocate the desync into the scroller, including dynamically through a media query the scroller never observes. One number, one place, and the token follows it.

  **A second defect surfaced while proving the first, and it was the more damaging one.** `createDataTable()` forwards `rowHeight: opts.rowHeight` and `headerHeight: opts.headerHeight` verbatim (`src/DataTable.ts`), so omitting either from the public options spread an explicit `undefined` over `TableContainer`'s defaults — the same hazard the constructor already guarded for `messages` and `colorScheme`, with these two missed. `TableBody` happened to carry its own `options.rowHeight ?? 32` fallback and so escaped, but `headerHeight` did not: `createHeaderRow()` interpolates it straight into `el.style.minHeight = \`${headerHeight}px\``, which produced the invalid `"undefinedpx"`. Browsers drop an invalid declaration silently, so **the documented 120px header default was never applied to any table created through the public API** — the header row had no `min-height`at all and depended entirely on its content to hold the visualizations open. Both fields now join the existing`??=` restoration block.

  Verified in Chromium rather than jsdom, which resolves no `var()` and computes no `line-height` and so cannot see any of this. `tests/browser/row-height.spec.ts` mounts real tables and reads computed style: at `rowHeight: 48` the token, the row box, and the focused cell's `line-height` are all `48px`, and at the default all three are `32px`, with the spec also asserting the focused cell is still `align-self: stretch` so it fails loudly rather than silently testing nothing if that ever changes. The unit tests in `tests/table/TableContainer.test.ts` cover the token contract and the explicit-`undefined` path; all five were confirmed to fail against the unfixed source before being kept. The full suite — 4,023 unit tests and all 21 browser specs, axe included — passes.

  `examples/06-custom-theme` was demonstrating the bug. It set `--dt-row-height: 28px` and `--dt-header-height: 104px` in `theme.css` and passed neither option, so its "compact variant" never applied: rows stayed 32px while stretched cells centred against a 28px line box, and the header ignored 104px. It now passes `rowHeight: 28` / `headerHeight: 104` and leaves the two tokens out of the stylesheet; measured in a browser, rows and the header now render at 28px and 104px. The theming guide's `### Sizing` section, the API reference, AGENTS.md and the `rowHeight` / `headerHeight` JSDoc all now state that these two tokens are outputs rather than inputs.

  Symptom this fixes: passing `rowHeight` produced rows of the right height whose focused, derived and annotated cells had their text sitting high inside them, and every table created with `createDataTable()` was missing the 120px header `min-height` it was documented to have.

## 0.5.1

### Patch Changes

- 24bd0e2: Build-toolchain bump: rebuild against Vite 8.0.13 (rolldown 1.0.1).

  The published bundle is unchanged in API and behaviour, but rolldown 1.0.1 chunks the output slightly differently:
  - The shared `ModalHost` lazy chunk is no longer emitted; its helpers are inlined into each modal consumer (`SQLFilterModal`, `DerivedColumnModal`, `DerivedColumnEditPanel`, `FilterPresetPanel`). Per-modal brotli sizes grow by ~10–30 bytes each.
  - The `VisualizationRegistry` (lazy ExportDialog) chunk grows from ~63.3 kB to ~67.6 kB brotli as more helper code resolves into it. Initial-load bundles are unaffected; only consumers that open the export dialog incur the extra bytes.

  Size-limit budgets in `.size-limit.cjs` are updated to match the new baseline.

## 0.5.0

### Minor Changes

- a7d429b: Add `derivedColumns` option to `createDataTable` and lazy-load the SQL / derived-column modal chunks.

  Set `derivedColumns: false` to hide the "+" add-column button and the per-header `f(x)` edit icon. The programmatic API (`actions.addDerivedColumn`, `actions.removeDerivedColumn`, `actions.updateDerivedColumn`) is unaffected.

  `SQLFilterModal`, `DerivedColumnModal`, `DerivedColumnEditPanel`, and `FilterPresetPanel` now load via dynamic `import()` inside the click handlers that open them. Consumers' bundlers chunk-split these out of the main bundle and only fetch them on first use. Combined with `expressionFilter: false` and `derivedColumns: false`, this lets consumers omit the `@codemirror/*` and `@lezer/highlight` optional peer dependencies entirely.

  No breaking changes. The `/advanced` entry's exports of these modal classes still drag CodeMirror through their static module-top imports — that remains the documented contract for the power-user entry.

  Tightened raw-SQL chip styling so the chip body no longer shows a `cursor: pointer` or an underline-on-hover affordance when `expressionFilter: false`. The chip stays visible (and removable via its `×`) but no longer hints at an action that does nothing.

## 0.4.1

### Patch Changes

- 1ead118: Fix: overlapping `BaseVisualization.updateFilters` calls no longer leave the brush / selection overlay desynced from the chart's data.

  `BaseVisualization` used a shared `isFilterUpdate` boolean to gate `syncVisualStateFromFilter`. When two `updateFilters` calls overlapped, the _first_ call's `finally` block reset the flag to `false` while the _second_ was still mid-await — so the second call's post-await read saw a stale `false` and skipped the brush / selection reset that should have happened for the latest filter state.

  `updateFilters` now bumps a `filterUpdateSequence` counter on entry, captures the local sequence, and the `finally` block only clears `isFilterUpdate` when its captured sequence still matches the current counter. Older calls' `finally` blocks become no-ops, so the flag stays `true` across the entire overlap window and every concurrent call observes the correct value after its await.

  Symptom this fixes: rapid brush-then-clear-then-brush gestures on a histogram (or any pattern that fired two `updateFilters` calls before the first resolved) could leave the brush rectangle painted on top of a chart whose underlying query had already moved on, so the visual selection no longer matched what was filtered in the table.

- 1ead118: Fix: `await createDataTable({ source })` and `await table.loadData(...)` now resolve only after the first table-body paint completes.

  Previously the public load promise resolved as soon as `loadDataImpl` returned, which happened _before_ the body's `initialize()` chain settled. The first SELECT was therefore still in flight when consumer code resumed after the `await`, so any action issued in that window (most visibly an `addFilter`) raced the unfiltered first fetch — and could be undone by the unfiltered result landing afterwards.
  - `TableContainer` now tracks `currentBodyInit: Promise<void>` (capturing each `TableBody.initialize()` chain, with a `.catch` that swallows transient body-init errors so they don't reject the public load promise) and exposes `whenBodyReady(): Promise<void>`.
  - `DataTable.loadDataImpl` awaits `tableContainer.whenBodyReady()` before emitting `loadComplete`, with a final `if (this.destroyed)` guard so a torn-down table fails loudly rather than leaking events to detached subscribers.
  - `TableBody.initialize` reorders work — subscribe to state first, run the manual `handleScroll` (when data is present), _then_ attach the virtual scroller's `onScroll` callback. Stops the scroller's auto-fired callback from racing the first manual fetch during `initialize`'s own await.

  This strictly tightens the existing timing contract — consumers can now rely on the first paint having happened by the time `await` returns. Callers that did not depend on the previous (looser) timing are unaffected.

  Symptom this fixes: code that did `const t = await createDataTable({ source }); t.actions.<...>` could observe the table empty for a few hundred ms after the await, and any actions issued in that window raced the first SELECT — most visibly, filters added before the body's initial fetch landed could be undone by the unfiltered result.

- 1ead118: Fix: CSV / JSON / Parquet exports and table scrolling no longer reorder rows within tie groups.

  DuckDB's `ORDER BY` is non-deterministic for tied keys, so two queries with the same `ORDER BY <user_sort>` could shuffle ties differently across runs. Without a tiebreaker:
  - Repeating an export of the same dataset with the same sort produced files with rows shuffled within tie groups (non-reproducible exports).
  - "Export selected rows" computed selection indices via `ROW_NUMBER() OVER(ORDER BY <user_sort>)`, then issued the export query with the same `ORDER BY`. The two orderings of tied rows could disagree, so the indices addressed _different_ underlying rows on the export — writing rows the user had not selected.
  - The scroll path re-fetched overlapping `LIMIT`/`OFFSET` windows, so rows could shuffle in place as the viewport moved.

  `ExportQuery.buildOrderByClause`, `ExportQuery.buildBaseQuery`, `ExportQuery.buildSelectedRowsQuery`, and `TableBody.buildRowQuery` now append `"__rowid__" ASC` as the final tiebreaker on every ordered query (skipped only when the user's sort already includes `__rowid__`). Empty-sort branches now emit `ORDER BY "__rowid__" ASC` instead of no `ORDER BY`. The Parquet empty-selection path switched from `WHERE FALSE` to `LIMIT 0` because `WHERE` must precede `ORDER BY` in the rewritten query.

  Symptom this fixes: exporting twice from the same filtered + sorted view yielded files with rows shuffled within ties, and "Export selected rows" could write rows the user hadn't actually selected when the sort column had duplicates.

- 1ead118: Fix: filters added immediately after `await createDataTable(...)` no longer briefly render unfiltered rows.

  `TableBody.fetchRows` had no way to drop late-arriving results when state changed mid-fetch. The body's initial unfiltered SELECT (kicked off during `initialize()`) could land in `rowDataCache` _after_ `invalidateCacheAndRefresh()` had cleared it, and `checkNeedsFetch` would then short-circuit because the cache appeared "full" — leaving the unfiltered rows on screen with no follow-up filtered query to correct them.
  - `fetchRows` now bumps a monotonic `fetchSequence` on entry and re-checks it after the worker resolves; superseded results are dropped _before_ they touch `rowDataCache`. The same counter is bumped in `invalidateCacheAndRefresh` and `destroy()` so cache invalidation and teardown both win against any in-flight fetch.
  - `fetchRows` now returns `boolean` — `true` when fresh rows landed, `false` when the fetch was dropped (superseded, no table, no visible columns, or destroyed). `fetchAndRender` skips the immediate render on `false` because the `finally` block has already queued a follow-up fetch that will paint the correct result.

  Symptom this fixes: code that does `const t = await createDataTable({ source }); t.actions.addFilter(...)` could see the unfiltered dataset render briefly before being replaced — and on some interleavings the filtered re-fetch was skipped entirely, so the unfiltered rows stayed on screen.

- 1ead118: Fix: filters issued right after `await createDataTable(...)` no longer race visualization init, and recycled placeholder rows no longer render with empty trailing cells.

  Two coupled fixes that both protect the post-`createDataTable` window when header visualizations are attached:
  - **Visualization first-paint barrier.** `attachVisualizations` now collects the initial `fetchData` promises from every visualization (via a new `BaseVisualization.waitForData(): Promise<void>`) and from both coordinators' `syncExistingFilters` calls (now `Promise<void>`-returning). `loadDataImpl` awaits `Promise.all([tableContainer.whenBodyReady(), pendingVizInit])` before emitting `loadComplete`, so a consumer's `addFilter` issued synchronously after `await createDataTable(...)` can no longer race viz init or land while a coordinator's filter-sync is still in flight.
  - **Placeholder row shape mismatch.** `TableBody.rowElementMap` could hold two structurally incompatible row shapes — full data rows (`visibleColumns.length` cells) and 1-cell loading placeholders. When a placeholder was promoted in place via `updateRowContent`, the loop's `min(columns, cells)` bound only rendered column 0, leaving columns 1..N empty and stripped of event listeners. `renderVisibleRows` now detects the cell-count mismatch, swaps in a fresh pool element with the correct shape, and refuses to return placeholder-shaped rows to the pool so they cannot contaminate later renders.

  Symptom this fixes: with header visualizations enabled, an `addFilter` issued synchronously after `await createDataTable(...)` could be silently ignored or applied against stale viz state. Separately, when a brush change rapidly grew the visible row count (e.g. 4 → 64), the new rows showed only the first column with empty space across the rest until the next render pass.

- 1ead118: Fix: histograms and value-counts no longer paint with stale aggregates when an in-flight fetch is superseded.

  The no-filter branch of `fetchData` in `Histogram`, `DateHistogram`, `TimeHistogram`, `IntervalHistogram`, and `ValueCounts` assigned `this.data = await fetch...()` _before_ running its post-await `seq !== this.fetchSequence || this.destroyed` guard. A stale result therefore wrote into `this.data`, repainted the canvas, and was only corrected when the newer fetch completed — producing a visible flash of outdated bins or category counts.

  Each subclass now stores the awaited result in a local variable, runs the guard, and only mutates `this.data` if the fetch is still current. This matches the existing guard already in place on the filtered branch and mirrors the `filterSequence` pattern in `CrossfilterCoordinator`.

  Symptom this fixes: rapidly toggling filters that hit a column's histogram (or value-count chart) caused a brief flash of outdated bin counts or category aggregates before the latest query corrected the canvas.

## 0.4.0

### Minor Changes

- 4ea2988: Make the documented quick-start work end-to-end. Several friction points
  in the published `0.3.1` build prevented consumers from getting a table
  on screen without reading the source of `WorkerBridge`.

  **🔴 Fix: Worker URL no longer broken in the published bundle.**
  The library's default worker construction (`new Worker(new URL('../worker/worker.ts',
import.meta.url), { type: 'module' })`) was rewritten by Vite's library
  build to an absolute path (`/assets/worker-XXX.js`) that resolved against
  the consumer's site root rather than against the bundle's installed
  location in `node_modules/`. Every `createDataTable()` call therefore
  failed with `Worker error: undefined` on first load. Setting `base: './'`
  in the library's Vite config switches the rewrite to a relative path,
  which `import.meta.url` resolves correctly.

  **BREAKING — CJS build dropped.** The library is browser-only (uses
  `Worker`, `IndexedDB`, `WebAssembly`); CJS environments can't run it
  regardless. The CJS bundle was structurally non-functional in `0.3.1`
  anyway — Terser substituted `import.meta.url` with `{}.url` (= `undefined`)
  during minification, so `new URL` threw synchronously, and the worker
  itself is an ES module that a CJS wrapper cannot load as
  `{ type: 'module' }`. Modern bundlers (Vite, webpack 5, Rollup, esbuild,
  Bun) all resolve `exports.import` first, so anyone consuming the library
  through a bundler is unaffected. Consumers calling
  `require('@jeyabbalas/data-table')` directly must switch to
  `import` syntax.

  `package.json` updates: `main` repointed to ESM; `require` paths removed
  from `exports['.']` and `exports['./advanced']`; `exports['./styles']`
  upgraded to an object form with a `types` field.

  **🟡 Fix: Root-relative and dot-prefixed URL strings now resolve correctly.**
  `source: '/sample.csv'` previously fell through the `startsWith('http')`
  discriminator and was passed to DuckDB as inline content — yielding a
  one-column garbage table with header `"/sample.csv"` and zero rows, with
  no error or warning. The classifier now recognizes `http://`, `https://`,
  `file:`, `data:`, `blob:`, protocol-relative `//host/...`, root-relative
  `/path`, and dot-prefixed `./path` / `../path` as URLs, and resolves the
  relative forms against `window.location.href` (matching `<img src>` and
  `fetch` semantics).

  **Fix: Ambiguous string sources now fail loud.** A single-line string
  that has no URL prefix and no JSON delimiter (e.g. `'sample.csv'`) now
  throws `LoadError` with the new error code `SOURCE_AMBIGUOUS` instead of
  silently letting DuckDB parse the literal text as a CSV header. The
  error message points the consumer at the fix (prefix the path with `/`
  or `./`).

  **Fix: `VERSION` constant now matches `package.json#version`.** The
  constant was hand-maintained and had drifted (`'0.2.0'` while the package
  shipped `0.3.1`). It's now substituted at build time via Vite's `define`
  so the two cannot diverge.

  **Fix: `import '@jeyabbalas/data-table/styles'` typechecks under strict TS.**
  The `./styles` export now resolves to a one-line type stub
  (`dist/styles.d.ts`) generated by the build, so consumers no longer hit
  TS2882 ("Cannot find module or type declarations for side-effect import").

  **Docs:** README quick-start now shows both the immediate-`source` and
  the mount-then-`loadData()` patterns; a new paragraph documents the URL
  resolution behavior and the `SOURCE_AMBIGUOUS` failure mode; a
  `checkBrowserSupport()` example highlights the existing pre-flight
  helper.

## 0.3.1

### Patch Changes

- b4b0a61: Fix: `loadData` and `clearSession` no longer leak per-dataset session state across dataset switches or shared preset managers.
  - `loadData` now clears the owned filter-preset manager, the annotation store, and the bridge query cache before loading the new dataset. The next snapshot persisted by `AutoSave` therefore reflects only the current dataset, not state inherited from whichever dataset was loaded previously.
  - `clearSession` now only clears `FilterPresetManager` instances created by the library itself. User-supplied managers passed via `presets: { manager }` (multi-table dashboards) are left untouched, since wiping them would destroy the other tables' presets.
  - A single table that uses the default `presets: true` is unaffected by the second change — its manager is owned, so `clearSession` keeps clearing it as before.

  Symptom this fixes: in a single-table app, saving a filter preset on dataset A and then loading dataset B left A's preset visible on B. After this change, the preset list resets between datasets, while session-restore on the same dataset (matching `tableName`) still re-populates it from the saved snapshot.

- 96b7f96: Fix: loading a new dataset (or destroying the DataTable on a shared bridge) now drops the previous base table from DuckDB instead of leaking it. Long-running dashboards that reload data many times in one page lifetime — or unmount tables in a multi-table dashboard — no longer accumulate orphan tables in the worker's DuckDB catalog.
  - `loadData` captures `state.baseTableName` before the new load and, on success, issues `DROP TABLE IF EXISTS` for the previous name. Skipped when the new load reuses the same name (`CREATE OR REPLACE TABLE` already replaced it atomically). A failed load leaves the previous data queryable.
  - `destroy()` drops `state.baseTableName` when the bridge is shared (`ownsBridge=false`). When the DataTable owns the bridge, `bridge.terminate()` discards the entire worker, so the drop is skipped.
  - `clearSession()` is unchanged — it still clears UI state and the IndexedDB snapshot but leaves the DuckDB table queryable until the next `loadData`.

  New API: `WorkerBridge.dropTable(tableName)`. Convenience for consumers managing ad-hoc tables via `bridge.query('CREATE TABLE …')`. Idempotent (uses `DROP TABLE IF EXISTS`) and quotes the identifier the same way the worker-side loaders do.

- b4b0a61: Fix: calling `loadData` twice with the same `tableName` no longer throws a DuckDB "Catalog Error: Table with name 'X' already exists!".

  The CSV / JSON / Parquet worker loaders now use `CREATE OR REPLACE TABLE` instead of `CREATE TABLE`, so a reload under the same name atomically replaces the previous registration. This came up in the demo when re-uploading a file whose content hash drove the same `tableName` as the prior load — the `loadData` call hit the conflict before the library could surface a useful error.

  Behavior with a brand-new `tableName` is unchanged.

## 0.3.0

### Minor Changes

- 1a228a8: Type tightening: `TableEvents` payload fields carrying mutable collections (`filterChange.filters`, `sortChange.sortColumns`, `selectionChange.selectedRows`, `columnChange.{visibleColumns, pinnedColumns, columnOrder}`, `derivedChange.derivedColumns`, `loadComplete.schema`) are now typed `readonly` / `ReadonlySet`. Phase 8 already cloned these at runtime; this completes the contract at the type level so handler-side mutation surfaces as `TS2540` instead of compiling silently. JavaScript consumers unaffected; TypeScript consumers that mutated the payload should clone via `.slice()` / `new Set(...)` at the destructuring point. See `docs/migration-guides/phase-9-readonly-event-payloads.md` for examples.

### Patch Changes

- 7e190b9: Phase 1 security audit: harden SQL/DOM/IndexedDB/export trust boundaries.

  **XSS fixes**
  - `TableContainer` fallback header (used by `/advanced` consumers without `actions`) no longer interpolates `colSchema.name`/`colSchema.type` into `innerHTML`; uses safe DOM construction.
  - `DataTable` stats placeholders now escape `messages.statistics.rowCount` / `filteredRowCount` outputs before splicing into `innerHTML`, so consumer-overridden i18n functions can't inject markup.

  **SQL hardening**
  - `quoteIdentifier` rejects empty strings and embedded NUL bytes with `SQLValidationError({ code: 'INVALID_IDENTIFIER' })`; tightened JSDoc on Unicode handling.
  - `formatSQLValue` emits `bigint` values as bare numeric literals (was previously falling through to a single-quoted string fallback).
  - Trust-boundary JSDoc added to `Actions.addRawSQLFilter`, `RawSQLFilter.sql`, the `case 'raw-sql':` site, and the `pattern` `regex` mode comment.
  - `filtersToWhereClause` JSDoc now states explicitly that callers must wrap the result in `WHERE (…)`.

  **CSV / export**
  - **Behavior change.** `exportToCSV` / `exportFromState` / `exportToClipboard` (CSV path) now neutralise cells whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r` by prepending a single quote. Defuses CSV injection in Excel / LibreOffice / Google Sheets per OWASP guidance. Header-row column names go through the same escape. Consumers that pipe library-generated CSV directly into a non-spreadsheet tool will see the leading quote on those cells; remove it at your sink if needed.
  - New `sanitizeFilenameStem` strips path separators, NUL/control characters, and leading dots from `setSourceName` / `getExportFilename` inputs; caps stem length at 100.

  **Worker / IndexedDB**
  - `WorkerBridge.handleMessage` validates inbound `MessageEvent` shape; malformed messages are dropped with a console warning, and unknown `type` values reject the pending request with `WorkerInitError({ code: 'WORKER_PROTOCOL_VIOLATION' })`.
  - `WorkerBridgeOptions.workerUrl` and `duckdbBundles` JSDoc now spells out the trust boundary: developer-controlled, no scheme/origin validation.
  - `SessionStore.save` / `saveSync` surface IndexedDB transaction errors instead of swallowing them; `SessionStore.load` shape-checks the stored blob and returns `null` on missing required keys.
  - `AutoSave` maps `QuotaExceededError` to `PersistenceError({ code: 'PERSISTENCE_QUOTA_EXCEEDED' })`; `reconstructError` recognises `PERSISTENCE_*` codes alongside the existing `PERSIST_*`.

  **Tests**
  - Added `tests/security/` with 6 new test files (78 cases) covering CSV formula injection, filename sanitisation, snapshot tampering, worker protocol guards, quota error classification, and XSS smoke for the rendering paths.
  - Extended `tests/filters/FilterSQL.test.ts` with 13 new adversarial cases for `quoteIdentifier`, `formatSQLValue`, and string-injection-shaped patterns.

- c44f94b: Phase 2 — public API & packaging audit. Locks the published surface ahead of subsystem deep-dives in later phases.

  **Packaging**
  - Advertise `dist/advanced.cjs` via `package.json#exports["./advanced"].require` so Node CommonJS consumers (`require('@jeyabbalas/data-table/advanced')`) actually resolve. The CJS file was already emitted by `vite build` but was unrouted — a latent `ERR_PACKAGE_PATH_NOT_EXPORTED` for any CJS consumer of the advanced surface.
  - `tsconfig.build.json` now sets `stripInternal: true`, so JSDoc-tagged `@internal` symbols (e.g., `__resetModalHostForTests`) are dropped from emitted `.d.ts` declarations.

  **Documentation surface**
  - Resolved every typedoc warning (`docs:api:check` goes from 20 warnings → 0). Internal types referenced by public types but never publicly exported (`Signal`, `Computed`, `HistogramColors`, `AnnotationBase`, `EventCallback`) are listed in `typedoc.json#intentionallyNotExported`. Cross-tier `{@link}` references that typedoc cannot resolve (e.g., `{@link DataTable}` from a `/advanced` symbol) were swapped for plain backtick text following the precedent set in Phase 1. The `@media (prefers-color-scheme: dark)` reference in `dataTableTheme`'s JSDoc was wrapped in backticks so it renders as code instead of being parsed as a JSDoc tag.
  - Backfilled JSDoc on every top-level public symbol that was missing or thin: `VERSION`, the per-filter shape interfaces (`RangeFilter`, `PointFilter`, `SetFilter`, `NotSetFilter`, `NullFilter`, `PatternFilter`, `RawSQLFilter`), `Filter`, `FilterType`, `ColumnSchema`, `SortDirection`, `SortColumn`, `Strings`, `TableEvents`, `DataTableErrorOptions`, `DataFormat`, `LoadResult`, `LoadOptions`, `LoadDataResult`, `QueryCacheOptions`, `FilterPreset`, `FilterPresetCollection`, `SerializedRangeFilter` / `SerializedPointFilter` / `SerializedSetFilter` / `SerializedNotSetFilter` / `SerializedFilter`, `defaultStrings`, `DUCKDB_FUNCTIONS`, `DUCKDB_FUNCTION_DETAILS`, `dataTableTheme`, `dataTableHighlighting`, plus class-level docs on every `/advanced` class (`EventEmitter`, `AnnotationStore`, `AutoSave`, `CrossfilterCoordinator`, `StatsPanelCoordinator`, `VisualizationFactory`, `Histogram` / `DateHistogram` / `TimeHistogram` / `IntervalHistogram` / `ValueCounts`, `InteractionManager`, `FilterPanel` / `FilterPresetPanel` / `SQLFilterModal`, `DerivedColumnEditPanel` / `DerivedColumnModal` / `DerivedColumnManager` / `DefaultExpressionEditor` / `AddColumnButton`, `ExportDialog`, `AnnotationPopover`, `ColumnHeaderTooltipPopover`, `KeyboardNavigator`, `VirtualScroller`).

  **New exports**
  - Root entry (`@jeyabbalas/data-table`): `LoadDataResult`, `QueryCacheOptions` (referenced by the existing `WorkerBridge.loadData` and `WorkerBridgeOptions.cache`); the per-filter `Serialized*` union members (`SerializedRangeFilter`, `SerializedPointFilter`, `SerializedSetFilter`, `SerializedNotSetFilter`) plus `DateWrapper` so consumers round-tripping individual filters can name the shape directly instead of indexing into `SerializedFilter`.
  - `/advanced`: `BrushCapable`, `SelectionCapable` (the capability markers that compose `InteractiveVisualization`), `LoadJSONOptions` (`AnnotationStore.loadJSON` parameter shape), `ListenerErrorHandler` (`EventEmitter` constructor parameter shape).

  All additions are type-only; the runtime keys exposed by `Object.keys(rootModule)` and `Object.keys(advancedModule)` are unchanged, so the existing `tests/api-surface.exports.test.ts` deny / allow lists and the snapshot at `tests/__snapshots__/api-surface.snapshot.test.ts.snap` are still green without modification.

  **Source-only deduplication**
  - Removed the duplicate `ExpressionColumnDef` / `VectorColumnDef` re-exports in `src/persistence/types.ts`; `SerializedDerivedColumnDef` now references the canonical declarations from `src/derived/types.ts` directly. The original interfaces remain exported from the root entry.
  - Replaced the local `ContainerColorScheme` type in `src/table/TableContainer.ts` with a type-only import of the public `ColorScheme` from `src/DataTable.ts`. The two were structurally identical; consolidation removes a duplicate name from the public `.d.ts` surface.

  **Bundle-size budgets**
  - New `size-limit` dev dependency (`size-limit` + `@size-limit/file`) gates the brotli-compressed size of every published artifact. Phase 2 baselines (raw → brotli) were captured at 2026-04-26 and budgets were set with ~10–15 % headroom so unrelated peer churn does not trip the gate. Run `npm run size` locally; Phase 9 will tighten the caps and wire size-limit into CI.

  **No runtime behavior changes.** Tests: 2693 → 2946 (+253). `npm run docs:api:check`: 20 → 0 warnings.

- 1fdae4a: Phase 3 — Core reactivity, state, errors, modals, i18n. Hardens the substrate every later phase trusts.

  **Async destroy guards on `StateActions`**
  - `DataTable.destroy()` now calls a new `actions.markDestroyed()` first thing, before any other teardown step. After that flag flips, every public `StateActions` method short-circuits:
    - Sync mutators (filters, sort, column visibility, pin, width, header tooltip, selection, hover, focused-cell, and the `setOnFilterRemove` / `setOnDerivedChange` callback registrations) throw `DestroyedError`. Pure getters (`getUndoManager`, `getRawSQLFilters`, `getFiltersSQL`, `getColumnHeaderTooltip`, `getCompletionContext`) keep working so consumers can still read last-known state during teardown.
    - Async methods returning `Promise<void>` (`loadData`, `removeDerivedColumn`) and `Promise<typed-array>` (`getColumnValues`) and `Promise<{ valid, … }>` (`validateExpression`, `validateSQLFilter`) check the flag both at entry and after each `await` — if destruction landed mid-flight, they reject with `DestroyedError` and **drop** the post-await state mutation.
    - Async methods returning `{ success, error? }` (`addDerivedColumn`, `updateDerivedColumn`, `replaceDerivedColumn`) return `{ success: false, error: 'DataTable is destroyed' }` (or, for `replaceDerivedColumn`'s typed-error variant, `DerivedColumnError({ code: 'DESTROYED' })`) at the same checkpoints.
  - `DataTable.loadDataImpl` and `DataTable.clearSession` add post-await destroy guards so a destroy mid-load no longer emits `loadComplete` / `loadError` / `error` on a torn-down emitter, and no longer mutates state after `resetTableState` if the table was already torn down.
  - New tests: `tests/core/Actions.destroy.test.ts` (29 cases — sync mutator coverage, pre-call destroyed coverage on every async method, and three destroyed-during-await race tests) plus `tests/DataTable.destroy.race.test.ts` (8 integration cases — `table.actions.*` post-destroy, `loadData` mid-flight, `ready` replay race).

  **Error-code drift fix and lock test**
  - `docs/troubleshooting.md` error-code reference table updated to match what `src/` actually throws. Renamed `RESERVED_COLUMN_NAME` → `LOAD_RESERVED_COLUMN_NAME` (Phase 1 prefix-routing); replaced `DUPLICATE_ID` / `INVALID_SHAPE` / `VERSION_UNSUPPORTED` with their actual `ANNOTATION_*`-prefixed forms; added rows for `WORKER_PROTOCOL_VIOLATION` (Phase 1), `INVALID_IDENTIFIER` (Phase 1), `INVALID_ROWID`, `EXPORT_FAILED` (default), `PERSISTENCE_QUOTA_EXCEEDED` (Phase 1), `UNKNOWN` (`DataTableError` default), and a consolidated row for the rest of the `ANNOTATION_*` family pointing at `errors.ts`'s JSDoc list. Removed the `DUPLICATE_NAME` row (the duplicate-name path returns a string error, never sets that code).
  - New `tests/api-surface.error-codes.test.ts` programmatically scans every `code: 'X'` literal across `src/`, every subclass-default code, and an explicit indirect-codes allowlist (currently `PERSISTENCE_QUOTA_EXCEEDED` from `classifyPersistenceFailure`). Asserts every code appears in `docs/troubleshooting.md`'s error-code table and vice versa, modulo a small documented-but-currently-unwrapped allowlist (`CLIPBOARD_UNAVAILABLE` — Phase 7 will wrap it). Future PRs that add a new code without documenting it (or doc a code without throwing it) will fail this test.

  **Reactive substrate test gaps closed**
  - `tests/core/reactive-substrate.phase3.test.ts` (13 new cases) locks behaviour the audit found unverified: `Computed` does not auto-track reads (only declared `deps` trigger recomputation), `batch()` flushes pending notifications even when the callback throws and resets the depth counter for subsequent batches, `EventEmitter.emit()` iterates a snapshot of the listener set so `off()` from one handler does not skip later handlers in the same emit, post-`removeAllListeners()` emit is a no-op, `once()` unsubscribed before its first emit does not fire, and multiple handlers throwing in the same emit each route to `onListenerError` (or each microtask-rethrow when no handler is supplied) without aborting the emit loop.

  **ModalHost test gaps closed**
  - `tests/core/ModalHost.phase3.test.ts` (7 new cases) adds the nested-modal Esc behaviour (Esc on the inner host closes only inner; outer's z-index reservation and focus restoration to the inner-opener button are preserved), the `destroy()`-without-`close()` path (asserts `wheel` and `touchmove` document listeners are torn down and the open-stack reservation is released), and mixed inline-panel + portalled-modal stacking (modal base 1000 always tops panel base 50 regardless of open order).

  **Strict-TS rollout**
  - `tsconfig.json` now sets `exactOptionalPropertyTypes: true` (deferred from Phase 2 §10). Every public option type whose field is genuinely "optional and may be `undefined`" was widened from `prop?: T` to `prop?: T | undefined` so explicit-undefined consumer pass-throughs continue to compile. The runtime behaviour is unchanged; the api-surface snapshot reflects only the type-level diff. See [`docs/migration-guides/phase-3-exact-optional-properties.md`](../docs/migration-guides/phase-3-exact-optional-properties.md) for the full list of affected option types and the guidance for downstream apps that mirror the flag.
  - `noUncheckedIndexedAccess` was temporarily flipped on to identify and fix every offending site in `src/core/` (32 sites across `Actions.ts`, `UndoManager.ts`, `ModalHost.ts`, `columnHeaderTooltip.ts`). Sites were narrowed via post-bounds-check non-null assertions or `?? null` fallbacks. The flag stays disabled globally until Phase 9 flips it project-wide; subsystem phases 4–8 each clean their slice in turn.

  **No public-API runtime surface change.** `tests/api-surface.exports.test.ts`, `tests/api-surface.snapshot.test.ts`, `tests/api-surface.jsdoc.test.ts`, `tests/api-surface.private-paths.test.ts`, and `tests/api-surface.cjs-routing.test.ts` all stay green. Tests: 2946 → 3007 (+61). `npm run docs:api:check`: 0 → 0 warnings.

- 60a89f7: Phase 4 — Worker, data loading, type inference. Closes the largest remaining test gap in the repo and fixes the long-standing worker `cancel` TODO.

  **Worker-side cancel implemented**
  - `src/worker/dispatcher.ts` (extracted from `worker.ts` for testability) now tracks an in-flight `{ id, type }` reference and, on receipt of a `cancel` message whose `targetId` matches, calls `connection.cancelSent()`. Mismatched targetIds reply with `{ cancelled: false, reason: 'no-matching-inflight' }`. Previously the worker accepted the cancel message but did nothing — DuckDB kept grinding the orphaned query.
  - New error code `QUERY_CANCELLED` (worker-side, when DuckDB interrupts an in-flight query/load/export) is distinct from the existing `QUERY_ABORTED` (bridge-side, when the consumer's `AbortSignal` fires before the worker reply lands). Consumers branching on `QUERY_ABORTED` continue to work; `QUERY_CANCELLED` is purely additive. See [`docs/migration-guides/phase-4-cancel-codes.md`](../docs/migration-guides/phase-4-cancel-codes.md).
  - DuckDB does not ship a typed `CancelledError`; the worker maps interrupt-shaped rejection messages (`INTERRUPT`, `interrupted`, `cancelled`) to `QUERY_CANCELLED` via a single `isCancelRejection` helper. Future DuckDB-WASM versions could add a typed cancel class — the heuristic lives in one place behind a documented helper.
  - `docs/troubleshooting.md` gains the `QUERY_CANCELLED` row; `tests/api-surface.error-codes.test.ts` (Phase 3 lock) auto-validates the addition.

  **Loaders made testable: optional `{ db, conn }` context**
  - `loadCSV` / `loadJSON` / `loadParquet` accept an optional third `LoaderContext` argument. When supplied, the loader uses the provided `AsyncDuckDB` / `AsyncDuckDBConnection` instead of the module-level singletons in `src/worker/duckdb.ts`. Production callers (`worker.ts` → `dispatcher.ts`) omit it and behavior is unchanged. Internal seam — loaders are not exported from `src/index.ts` or `src/advanced.ts`.

  **End-to-end loader integration tests against real fixtures**
  - New `tests/helpers/duckdbNode.ts` builds a real `AsyncDuckDB` against `@duckdb/duckdb-wasm/dist/duckdb-node.cjs` using `worker_threads.Worker` plus a tiny bootstrap script (`tests/helpers/duckdbNodeWorkerBoot.cjs`) that installs the DOM-Worker shape on `global` so duckdb-wasm's worker module can run inside Node. Tests pass `{ db, conn }` directly into the loaders.
  - New `tests/helpers/fixtures.ts`, `tests/helpers/mockWorker.ts` round out the test infra. `mockWorker` consolidates the inline mock-worker patterns previously duplicated in `tests/data/WorkerBridge.workerFactory.test.ts:18-24` and `tests/security/workerBridgeProtocol.test.ts`.
  - New tests:
    - `tests/worker/loaders/csv.integration.test.ts` (13) — titanic, nyc_taxi (100k), vins_de_france, us_customer_orders, plus reserved-column / delimiter / timezone / string-vs-buffer paths.
    - `tests/worker/loaders/json.integration.test.ts` (12) — titanic, nyc_taxi, vins_de_france, test_patterns, plus NDJSON auto-detection and option validation.
    - `tests/worker/loaders/parquet.integration.test.ts` (8) — titanic, nyc_taxi, numeric-stress, datetime-stress, plus selective `columns` and reserved-name rejection.
    - `tests/worker/loaders/numericStress.test.ts` (14) — locks per-format type inference for mixed-type, all-NULL, single-value, scientific notation, extreme magnitudes.
    - `tests/worker/loaders/datetimeStress.test.ts` (19) — locks per-format DATE / TIME / TIMESTAMP / TIMESTAMPTZ behavior, epoch / Y2K / leap-year boundaries, ambiguous date strings staying VARCHAR, and one documented quirk: `str_date_compact` (8-digit numerics) is sniffed as integer by DuckDB CSV.
    - `tests/worker/cancel.test.ts` (8) — dispatcher cancel paths, in-flight tracking, INTERRUPT-message rewrap to `QUERY_CANCELLED`.

  **Type inference + pattern detection behavior locked**
  - `tests/data/TypeInference.behavior.test.ts` (18) — drives `inferStringColumnType` against a real DuckDB connection. Locks: all-NULL → string with confidence 0, mixed-type → string, scientific notation → float, leading zeros, boolean variants (`true`/`false`/`yes`/`no`/`Y`/`N`/`1`/`0`), ISO date/timestamp/time, US (MM > 12 → `month >12` resolution wait, day > 12) and EU disambiguators, ambiguous-slash dates → string, high-cardinality strings, and the `minConfidence` demotion gate.
  - `tests/data/PatternDetector.behavior.test.ts` (13) — UUID / email / URL / IPv4 / phone / identifier acceptance plus tie-breaking precedence and a deferred-feature lock asserting currency / percentage / unit strings currently return `pattern: null` (so adding those detectors later becomes a deliberate, observable change).
  - `tests/data/QueryCache.invalidation.test.ts` (6) — default `maxEntries=100` LRU eviction, 200-distinct-set stress, every `state.*` signal triggers `bridge.clearQueryCache`, unsub stops triggers, TTL=0 immediate-expiry semantics, and TTL boundary hit/miss.

  **WorkerBridge race / lifecycle / error round-trip**
  - `tests/data/WorkerBridge.cancel.test.ts` (6) — early `AbortSignal.aborted` → `QUERY_ABORTED`, mid-flight abort dispatches a `cancel` `WorkerMessage` with the matching `targetId`, worker `QUERY_CANCELLED` reply reconstructs as `QueryError({ code: 'QUERY_CANCELLED' })`, cancel-after-completion is a no-op, abort-listener cleanup, cache not poisoned by aborted SELECT.
  - `tests/data/WorkerBridge.parallel.test.ts` (4) — 100 concurrent queries replied in reverse / random order all resolve to the matching caller; one failing query among 99 successes only rejects that promise; identical SELECTs hit the cache and don't re-dispatch.
  - `tests/data/WorkerBridge.lifecycle.test.ts` (6) — `initializeTimeoutMs` honored on inert workers, `terminate()` rejects every pending request with `WorkerTerminatedError`, terminate→re-`initialize()` flow, two-bridge isolation, `isInitialized()` flips, no-op on uninitialized bridge.
  - `tests/data/WorkerBridge.errorRoundTrip.test.ts` (20) — every error subclass (`WorkerInitError`, `WorkerTerminatedError`, `QueryError` × 3 codes, `LoadError` × 2, `SQLValidationError`, `DerivedColumnError` × 2, `PersistenceError` × 2, `AnnotationError`, `ExportError`, `ConfigurationError` × 2, `DestroyedError`) round-trips with `code` / `details` / `message` preserved. BigInt in `details` survives structured-clone. No-code error defaults to `QueryError(QUERY_RUNTIME)`.
  - `tests/data/WorkerBridge.bundles.test.ts` (5) — `duckdbBundles` forwarding into the `init` payload (omitted, present), `workerFactory` failure paths surface `WorkerInitError({ code: 'WORKER_CRASHED', details.source })`, `workerUrl` constructor failure path.

  **Performance baseline (opt-in)**
  - `tests/performance/benchmarks.duckdb.test.ts` (4) — gated by `RUN_DUCKDB_PERF=1`. Budgets keyed off local M1 medians × 4-5 for CI variance: nyc_taxi.parquet load < 8000ms; nyc_taxi.csv load < 15000ms; 100 cached SELECTs < 150ms; 100 uncached random-WHERE COUNT(\*)s < 3000ms. Default `npm test` skips the file.

  **Strict-TS rollout for the data + worker slice**
  - `noPropertyAccessFromIndexSignature: true` was temporarily enabled and the data + worker slice cleaned: 11 sites in `src/worker/duckdb.ts` (interval-shape reads) and `src/worker/loaders/common.ts` (DESCRIBE row reads) flipped to bracket access. Flag is OFF globally — `~83` sites in other slices (`src/annotations/`, `src/filters/FilterPresets.ts`, `src/persistence/SessionStore.ts`, `src/table/`, `src/visualizations/histogram/IntervalHistogramData.ts`) remain to be cleaned by their respective phases per the Phase 0 §11 routing (Phase 5 / 6 / 7 / 8). Phase 9 flips the flag globally.
  - `noUncheckedIndexedAccess: true` was temporarily enabled and the data + worker slice cleaned: 17 sites in `src/data/TypeInference.ts` (regex `match[i]` reads + `daysInMonth[month-1]` access) and `src/worker/loaders/{common.ts, json.ts}` flipped to non-null-assertion-after-bounds-check. Flag is OFF globally; subsystem phases continue cleaning per Phase 0 §11.

  **Worker dispatcher extracted for testability**
  - `src/worker/worker.ts` is now a thin entry point that wires `self.onmessage` → `handleMessage` from the new `src/worker/dispatcher.ts`. The split lets tests drive `handleMessage` directly via vi.mock against `./duckdb` and `./loaders/*`. Two `@internal` test-only exports (`__resetInFlightForTests`, `__getInFlightForTests`) are stripped from `dist/.d.ts` by `stripInternal: true` (Phase 2). No public-API change.

  **Tests:** 3007 → 3163 (+156 added; 4 opt-in-skipped → 152 active in default run). **Coverage:** every metric ticked up — statements 73.17% → 74.66%, branches 60.15% → 61.57%, functions 78.28% → 80.47%, lines 75.01% → 76.46%. Worker loaders move from near-zero to 89-93% per file. **No public-API runtime surface change** — every api-surface gate (`exports`, `snapshot`, `jsdoc`, `error-codes`, `private-paths`, `cjs-routing`) stays green untouched. **No new dependencies** added — `@duckdb/duckdb-wasm` was already a peer dep.

- 89ddcf1: Phase 5 — Filters & derived columns. Hardens the management layer
  behind the seven filter types and the two derived-column kinds, closes
  remaining test gaps, and lands the Phase 0 §11-routed strict-TS slice
  for `src/filters/` + `src/derived/`.

  **Two consumer-visible behavior changes**
  - `FilterPresetManager.save` and `.rename` now throw
    `ConfigurationError({ code: 'PRESET_DUPLICATE_NAME', details: { name } })`
    when the trimmed name collides with another preset. Previously
    duplicates silently coexisted, which made the picker show two
    identically-named entries. `importFromJSON` keeps importing — duplicate
    presets within the imported file or against the existing collection
    are skipped and reported on the `errors[]` channel rather than
    throwing. Migration: [`docs/migration-guides/phase-5-preset-name-uniqueness.md`](../docs/migration-guides/phase-5-preset-name-uniqueness.md).
  - `actions.addDerivedColumn` and `actions.updateDerivedColumn` (rename
    path) now reject the reserved name `__rowid__` with the message
    `Column name "__rowid__" is reserved for the synthetic row id`. The
    duplicate-name guard already caught this in the typical post-load
    state; the explicit reservation closes a hole in the pre-load case
    and produces a clearer error message. `replaceDerivedColumn` is
    unaffected (rename is already rejected separately). The
    `Promise<{ success: boolean; error?: string }>` return shape is
    unchanged — no new error class, no api-surface delta. Migration:
    [`docs/migration-guides/phase-5-derived-rowid-reservation.md`](../docs/migration-guides/phase-5-derived-rowid-reservation.md).

  **New error code routed to `ConfigurationError`**
  - `PRESET_DUPLICATE_NAME` joins the `CONFIG_*` / `OPTIONS_*` / `CONTAINER_*` /
    `BRIDGE_*` / `INVARIANT` family so worker-boundary error reconstruction
    rebuilds it as `ConfigurationError`. Documented in
    `docs/troubleshooting.md`; the Phase 3 `tests/api-surface.error-codes.test.ts`
    lock auto-validates the addition.

  **Documentation drift fix (carryover from Phase 3)**
  - `docs/troubleshooting.md` section 16 still referenced the old
    `RESERVED_COLUMN_NAME` heading. Renamed to `LOAD_RESERVED_COLUMN_NAME`
    to match the table at line 51 (Phase 3 renamed the table entry but
    missed the section heading). Body updated to mention the
    derived-column-add-time reservation.

  **Tests added** — 64 new cases across 9 files; 1 new file:
  - `tests/filters/FilterSQL.test.ts` (+14) — pattern NULL handling for
    every mode, special chars in `point`/`set`/`not-set` value-side
    payloads, range with Date+`maxInclusive` and Date+`Infinity`, range
    with bigint bounds, raw-sql synthetic-key collision precedence.
  - `tests/filters/RawSQLFilter.test.ts` (+3) — empty-string label
    fallback, label round-trip including `undefined`.
  - `tests/filters/FilterRoundTrip.test.ts` (NEW, 21) — every filter type
    serialised → deserialised through both the structured-clone-equivalent
    path (preserves Date / Infinity / bigint) and the JSON path (FilterPresetManager
    export/import; documents the Infinity → null limitation).
  - `tests/filters/FilterPresets.test.ts` (+8) — name-uniqueness
    contract on `save` / `rename` / `importFromJSON`, full round-trip
    every filter type via `save` → `exportToJSON` → `importFromJSON` →
    `load`.
  - `tests/filters/SQLFilterModal.test.ts` (+6) — open-time autocomplete
    refresh including derived columns (live `derivedChange` refresh while
    the modal is open is deferred to Phase 8), empty / whitespace-only
    SQL gating on Validate and Apply.
  - `tests/filters/CrossfilterQuery.test.ts` (+1) — documents the
    divergence between `splitCrossfilterFilters` and
    `filtersToWhereClause` when the `column` argument matches a
    raw-sql synthetic key (only `filtersToWhereClause` has the explicit
    raw-sql carve-out).
  - `tests/derived/DerivedColumns.test.ts` (+4) —
    `addDerivedColumn({ name: '__rowid__' })` reservation in both
    schema-loaded and pre-load states; `updateDerivedColumn` rename
    refuses `__rowid__`; `setColumnOrder` reordering derived columns is
    undoable.
  - `tests/derived/replace-derived-column.test.ts` (+1) — transitive
    multi-level cascade (a → b → c): replacing `a` with a numeric
    expression breaks both direct dependent `b` and transitive dependent
    `c`; `DEPENDENTS_INCOMPATIBLE.details.dependentsAffected` enumerates
    both.
  - `tests/derived/DerivedColumnModal.test.ts` (+3) — kind toggle
    preserves expression text and vector textarea content across mode
    round-trips; clears the validation chip when toggling.

  **Strict-TS slice cleanup (Phase 0 §11 routing)**
  - `noPropertyAccessFromIndexSignature: true` was temporarily enabled
    and the **34 sites in `src/filters/FilterPresets.ts`** flipped to
    bracket access (concentrated in `importFromJSON`'s validation
    switch). Other slices (`src/annotations/`, `src/persistence/`,
    `src/table/`, `src/visualizations/histogram/IntervalHistogramData.ts`)
    remain to be cleaned by Phases 6 / 7 / 8; flag stays OFF globally
    until Phase 9.
  - `noUncheckedIndexedAccess: true` was temporarily enabled and the
    filters + derived slice cleaned: **102 sites** total —
    `FilterPanelField.ts` (~70 sites: `inputs[N]?.value` and
    `inputs[N].value` patterns in DOM-node iteration loops),
    `FilterPresets.ts` (2 sites), `DerivedColumnManager.ts` (~6 sites:
    `findIndex`-then-direct-access patterns and topological sort
    loops), `DerivedColumnModal.ts` (~25 sites: `lines[i]` reads after
    bounds checks). Pattern: post-bounds-check non-null assertion
    `arr[i]!`. Other slices cleaned by their respective subsystem
    phases; flag stays OFF globally until Phase 9.

  **Tests:** 3163 → 3227 (+64 in default run; opt-in skipped count
  unchanged). **Coverage:** thresholds met; metrics ticked up vs Phase 4
  baseline. **No public-API runtime surface change** — every api-surface
  gate (`exports`, `snapshot`, `jsdoc`, `error-codes`, `private-paths`,
  `cjs-routing`) stays green untouched. **No new dependencies** added.

- 8fa1838: Visualizations & stats hardening (review-plan Phase 6).
  - All five `BaseVisualization` subclasses (`Histogram`, `DateHistogram`,
    `TimeHistogram`, `IntervalHistogram`, `ValueCounts`) now route
    `fetchData` failures through `options.onError({ stage: 'fetch' })`
    instead of swallowing them with `console.error`. The facade re-emits
    these as `error` events with `source: 'visualization'`. The empty-canvas
    rendering after error is unchanged. See
    `docs/migration-guides/phase-6-viz-fetch-error-routing.md` for the
    consumer-side impact (consumers branching on the `error` event will
    start seeing fetch failures they could previously only observe in the
    developer console).
  - Added ~85 new test cases across 9 new files + 3 extensions:
    histogram math correctness against real DuckDB (numeric, date /
    timezone-stable, time, interval), value-counts top-N + "Other" cap with
    high cardinality, `BaseVisualization` lifecycle / in-flight destroy /
    onError contract, registry tie-break determinism, full fall-through to
    `PlaceholderVisualization`, `CrossfilterCoordinator` filter-flow
    integration, `StatsFormatters` line-2 edge cases.
  - Strict-TS slice cleanup for `src/visualizations/` + `src/statistics/`:
    `noPropertyAccessFromIndexSignature` (4 sites in
    `IntervalHistogramData.ts`) and `noUncheckedIndexedAccess` (~146 sites)
    are now clean for the slice. Both flags remain disabled globally; the
    remaining slices land in Phases 7 / 8 / 9.

- 676bd80: Persistence, annotations, and export hardening (review-plan Phase 7).
  - `coerceLoadedSnapshot` in `src/persistence/SessionStore.ts` now rejects
    snapshots whose `version` is not an integer in `[1, SNAPSHOT_VERSION]`.
    Future-version blobs (e.g., `version: 6` from a newer library that wrote
    the IDB row before a downgrade) load as `null` so the table boots fresh
    rather than risk misinterpreting unknown fields. Pre-1.0 clean break:
    no migration framework. See
    `docs/migration-guides/phase-7-snapshot-version-policy.md`.
  - `AutoSave` latches a one-shot quota circuit-breaker on the first
    `PERSISTENCE_QUOTA_EXCEEDED` error. Subsequent debounced saves become
    no-ops until `enable()` is re-entered (the canonical reset is
    `actions.clearSession()`'s built-in `disable()` → `enable()` cycle).
    Consumers see exactly one `onError` per quota episode instead of one
    per state mutation. Non-quota errors (`SAVE_FAILED`) are NOT latched.
    See `docs/migration-guides/phase-7-autosave-quota-circuit-breaker.md`.
  - Vector value pool dedup is documented as **reference-identity, not
    content-hash**. New JSDoc on `PooledVectorColumnRef` /
    `VectorValuePoolEntry` makes the contract explicit, and a new
    regression test in `tests/persistence/serialization.test.ts` locks
    the semantic (two structurally-identical-but-distinct arrays produce
    two pool entries; same array reference across stack entries shares
    one entry).
  - New tests: `~65 cases across 4 new files + 6 extensions` covering
    snapshot version policy (12), AutoSave quota circuit-breaker (8),
    vector pool reference-identity (2), DateWrapper timezone stability
    (6), AnnotationStore tableName Signal binding (6), CSV
    formula-injection prefixes (=, +, -, @, \t, \r — 11), Parquet
    round-trip via real DuckDB (5 cases, mixed types + scope variants),
    ExportDialog system-columns toggle (4), JSON BigInt + Date round-trip
    through `JSON.parse` (5), Clipboard format / size invariants (3), and
    CSV `__rowid__` end-to-end with BIGINT decimal-string formatting (3).
  - Strict-TS slice cleanup for `src/persistence/` and `src/annotations/`
    (Phase 0 §11): `noPropertyAccessFromIndexSignature` and
    `noUncheckedIndexedAccess` are clean for these two slices. Both
    flags remain disabled globally; the remaining slices land in
    Phases 8 / 9.
  - Documentation: cross-tab race (last-writer-wins, no
    `BroadcastChannel`), AutoSave quota circuit-breaker behaviour,
    snapshot version-policy contract added to
    `docs/guides/session-persistence.md`.
  - JSDoc: clarified the BigInt safe-vs-unsafe coercion in `JSONExport`
    and the no-size-precheck contract on `Clipboard.copyToClipboard`.

- f22a19e: Table UI rendering, accessibility, and i18n hardening (review-plan Phase 8).
  - **Event payloads are independent shallow copies.** Every
    `TableEvents` payload field that carries a mutable collection
    (`Filter[]`, `SortColumn[]`, `Set<number>`, `string[]`,
    `DerivedColumnDef[]`) is allocated fresh at emit time. Pre-fix
    consumers that mutated the payload from a handler silently corrupted
    the live signal value; post-fix the mutation is contained in the
    consumer's copy. Item identity inside the collection is unchanged —
    treat the items as read-only. Runtime contract only; the typed
    `readonly` markers on `TableEvents` are deferred to Phase 9 so this
    release lands without forcing a TS2540 on consumer destructure-and-
    mutate code. See
    `docs/migration-guides/phase-8-event-payload-immutability.md`.
  - **`SQLFilterModal` and `DerivedColumnModal` autocomplete refresh
    live.** Both modals subscribe their open editor to `state.schema` and
    `state.derivedColumns` so adding a derived column elsewhere in the UI
    while the modal is open updates the autocomplete dropdown without
    remounting. Cursor / focus / scroll preserved via the editor's
    existing `Compartment.reconfigure` path
    (`CodeMirrorExpressionEditor.updateCompletionContext`). Microtask
    debounce so a bulk reconcile (undo / redo / session restore)
    collapses to one editor dispatch. New shared helper
    `src/sql-editor/wireLiveCompletionContext.ts` (internal). See
    `docs/migration-guides/phase-8-sql-modal-live-autocomplete.md`.
  - **i18n: 5 new translatable strings.** Added
    `derived.expressionPlaceholder`, `derived.availableColumnsLabel`,
    `export.includeSystemColumnsLabel`, `a11y.resizeHandleLabel`, and
    `a11y.loadingRowLabel(rowNumber)`. Sites: `DefaultExpressionEditor`
    (placeholder + column-hint label), `ExportDialog` (system-columns
    checkbox), `ColumnResizer` (drag-handle ARIA), `TableBody`
    (loading-row placeholder text). `DefaultExpressionEditor`,
    `ColumnResizer`, and `TableBody` gained an optional
    `messages?: Strings` constructor option (Tier-2, additive). The
    bundled `TableContainer` and `ColumnHeader` plumb this automatically;
    consumers using a custom `editorFactory` should forward `messages`
    themselves. French overrides extended in `examples/07-i18n-french/`.
  - **`AnnotationPopover` and `ColumnHeaderTooltipPopover`: stale
    aria-describedby fix.** A sequence of `show(A) → show(B)` previously
    left A's `aria-describedby` pointing at the popover after the popover
    had moved on to B. Both popovers now clear the previous anchor's
    attribute before re-pointing.
  - **`ExportDialog` label-control association.** The CSV / JSON select
    elements gained `for` / `id` pairing (axe `select-name` rule) and the
    headers / pretty-print checkboxes are now wrapped inside their labels
    for implicit `label` association. Surfaced by the new axe scenarios.
  - **Comprehensive axe-core suite.** `tests/a11y/axe.test.ts` expanded
    from 1 scenario (empty grid) to 12: filters open, sort active, every
    modal (Export / SQL filter / Derived column), every popover
    (annotation + header tooltip), light + dark mode, multi-table,
    `dir="rtl"` smoke. Modal scenarios re-enable `aria-required-children`
    (relaxed only for the table-root toolbar-sibling pattern). The select-
    name and checkbox-label fixes in `ExportDialog` were caught by this
    expansion.
  - **Tests added: ~50+ new cases across 8 new files + 5 extensions.**
    Event-payload immutability (9), SQLFilterModal live-refresh (6),
    DerivedColumnModal live-refresh (3), DataTable.i18n keys (3),
    DefaultExpressionEditor messages (2), `buildCompletionContext` edges
    (4), KeyboardNavigator undo / redo / copy (5), VirtualScroller edges
    (5), AnnotationPopover multi-anchor (2), axe-core scenarios (10
    new), and the meta-scanner
    `tests/i18n/hardcodedStringsScan.test.ts` that prevents future
    hardcoded English strings from sneaking back in.
  - **Strict-TS slice cleanup.** `noPropertyAccessFromIndexSignature`
    and `noUncheckedIndexedAccess` enabled temporarily, applied to
    `src/table/{Cell,ColumnHeader,ColumnReorder,KeyboardNavigator,TableBody,TableContainer}.ts`
    (~50 sites) plus 3 sites in `src/export/ExportQuery.ts` missed by
    Phase 7. Both flags reverted to `false` globally per the per-phase
    routing — Phase 9 flips globally.
  - **Documentation.** `docs/guides/accessibility.md` adds a structured
    manual screen-reader test plan (VoiceOver / NVDA / JAWS matrix), a
    Lighthouse contrast-verification recipe, and an explicit "what's not
    yet supported" section (`prefers-contrast: more`, `forced-colors`,
    touch + drag). `docs/guides/i18n.md` documents the 5 new keys and
    the meta-scanner.
  - No public-API symbol moves; `tests/api-surface.exports.test.ts` and
    `tests/api-surface.snapshot.test.ts` remain green untouched.

- 1a228a8: Surface `AnnotationError` in the `MUST_EXIST_AT_ROOT` API gate (`tests/api-surface.exports.test.ts`). The class was already exported from `src/index.ts` and tracked by `tests/api-surface.snapshot.test.ts`; this aligns the explicit gate manifest with the runtime exports so future drift surfaces immediately.
- 1a228a8: Phase 9 — performance, memory, release readiness. Tightened coverage thresholds (76 / 63 / 81 / 77 — actuals minus 1 pp) and bundle-size budgets (root ESM 7.7 kB, lazy ExportDialog 81 kB ESM, etc. — actuals + ~5 % headroom). Added an opt-in perf suite (`npm run test:perf`, `RUN_DUCKDB_PERF=1` / `RUN_LIFECYCLE_STRESS=1`) covering 1 M-row filter latency, 10 k annotation insert / lookup, scroll-handler frame budget, 1000-cycle create / destroy stress, and shared-bridge / 1k-mutation autosave memory leak gates. Wired `npm run size` into the CI matrix as a third job. Added high-contrast + forced-colors CSS for `prefers-contrast: more` and `forced-colors: active`. Removed the dead-code `splitCrossfilterFilters` (was never exported). Coalesced duplicate `columnChange` emit on column re-pinning via `queueMicrotask`. Defensive shallow-clone of `loadComplete.schema`. New `warning` event with `code: 'PERSISTENCE_VERSION_REJECTED'` when `SessionStore.load()` rejects a stored snapshot whose version is outside `[1, SNAPSHOT_VERSION]`. Documented OIDC trusted publishing in `DEVELOPMENT.md`. Refreshed `docs/performance.md` with a 0.2.0 benchmark snapshot.

All notable changes to `@jeyabbalas/data-table` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project adheres to [Semantic Versioning](https://semver.org/).

Planned work and discussion lives in GitHub Issues under the
[`roadmap`](https://github.com/jeyabbalas/data-table/issues?q=is%3Aissue+label%3Aroadmap)
label. Releases with breaking changes also get a dedicated walkthrough under
[`docs/migration-guides/`](./docs/migration-guides/) alongside the entry below.

## [Unreleased]

### Added

- **Public SQL editor primitives for host-app embedding.** The library now
  exposes the building blocks needed to assemble a SQL-, schema-, and
  DuckDB-aware CodeMirror editor _outside_ the data table — for filter
  preset composers, derived-column wizards, query-template editors, etc.
  Three new exports on `@jeyabbalas/data-table/advanced`:
  `createSqlExtensions(context, options?)` returns a CodeMirror
  `Extension[]` (PostgreSQL grammar + schema/function autocomplete +
  optional theme) ready to drop into any `EditorState.create({ extensions
})`; `buildCompletionContext(columns, options?)` normalizes any
  column-like array (`ColumnSchema[]`, ad-hoc `[{name, type}, …]`) into the
  `CompletionContext` shape; and `DUCKDB_FUNCTION_DETAILS` carries the
  curated `{ name, category, description }` metadata used to populate the
  autocomplete `detail` (category) and `info` (one-line description)
  fields. The library theme (`dataTableTheme`, `dataTableHighlighting`) is
  also re-exported from `/advanced` for hosts that opt out of
  `includeTheme` and want to apply the theme separately. The bundled
  `CodeMirrorExpressionEditor` is now a thin wrapper around
  `createSqlExtensions`, so its autocomplete dropdown picks up the new
  category chip and description panel for free — a visible UX upgrade with
  no public API change. `DUCKDB_FUNCTIONS` keeps its names-only shape and
  is now derived from `DUCKDB_FUNCTION_DETAILS` so the two cannot drift.
  Example 14 (`examples/14-standalone-sql-editor/`) demos two
  host-assembled editors (filter SQL composer + derived expression
  composer) that share a data table's live schema via
  `actions.getCompletionContext()` and refresh their autocomplete on every
  `derivedChange` via a single `Compartment.reconfigure()`.
- **Custom column-stats panels.** A new `BaseStatsPanel` abstract class
  (Tier-2, `@jeyabbalas/data-table/advanced`) plus a per-instance
  `StatsPanelRegistry` (Tier-1, root) lets downstream apps replace the
  library's built-in two-line stats display in a column header — the
  `.dt-col-stats` slot — with their own DOM and DuckDB queries. The
  registry is empty by default; when no registration matches a
  column's `DataType`, the library falls back to `formatDefaultStats`,
  so existing apps see no behavior change. Per-instance via
  `createDataTable({ statsPanelRegistry })`; the module-scoped
  `defaultStatsPanelRegistry` is the implicit fallback when omitted.
  Lifecycle: `constructor(container, column, options)` → `update(stats:
ColumnStatsData | null)` (called with `null` once on mount, then
  with each `ColumnStatsData` the column's visualization emits) →
  `updateFilters(filters: Filter[])` (called on every filter change
  before any subsequent `update` from a viz refetch; default
  implementation only refreshes `this.options.filters`) →
  `setHoverStats(html: string | null)` (HTML string from the
  visualization's hover snippet; default no-op) → `destroy()`. Panel
  options carry `{ tableName, bridge, filters, messages, onError }`;
  errors route through `onError(err, { source: 'stats-panel', column,
phase: 'construct' | 'update' | 'hover' | 'fetch' | 'destroy' })`
  and are re-emitted on the facade's `error` event with `source:
'stats-panel'` (a new discriminant in `TableErrorSource`). Tier-1
  exports: `StatsPanelRegistry`, `defaultStatsPanelRegistry`,
  `StatsPanelRegistration`, `StatsPanelConstructor`. Tier-2
  (`/advanced`): `BaseStatsPanel`, `StatsPanelOptions`,
  `StatsPanelErrorContext`, `StatsPanelErrorPhase`,
  `StatsPanelCoordinator`. The coordinator stamps a monotonic
  `filterSequence` on every broadcast and bounds fan-out to
  `DEFAULT_PANEL_CONCURRENCY = 4` so panel-issued queries don't
  flood the single-threaded worker on wide tables. Example 13
  (`examples/13-custom-stats-panel/`) demos numeric (`n · μ · σ`
  from a custom `AVG` / `STDDEV_POP` query) and categorical
  (`top: <value> (<pct>%)` from a `GROUP BY ... ORDER BY COUNT
DESC LIMIT 1`) panels with the recommended per-panel `fetchSeq`
  stale-result guard.
- **Stable synthetic `__rowid__` + read-only column export.** A
  `BIGINT` `__rowid__` column is synthesized at load time on every CSV /
  JSON / Parquet source (`row_number() OVER () - 1`) and survives sort,
  filter, and derived-column add / remove. The column is reserved —
  loading a source that already contains `__rowid__` rejects with
  `LoadError('RESERVED_COLUMN_NAME')`. It is hidden from the grid by
  default and excluded from default exports unless the user ticks
  "Include system columns" in the export dialog. New
  `table.actions.getColumnValues(name, opts?)` returns a column as a
  typed JS array — `Int32Array` (INTEGER), `Float64Array` (FLOAT /
  DECIMAL), `BigInt64Array` (BIGINT including `__rowid__`), or
  `unknown[]` (strings / dates / booleans). Options: `scope: 'all' |
'filtered' | 'selected'`, `limit`, `offset`, `signal`. Throws
  `QueryError` with `COLUMN_NOT_FOUND` / `INVALID_PAGINATION` /
  `NO_TABLE`. Public exports: `ROWID_COLUMN` constant,
  `RowId` type, `GetColumnValuesOptions` type. Example 10 (`examples/
10-column-export/`) demos every option and the `BigInt64Array`
  ergonomics for `__rowid__`.
- **`actions.replaceDerivedColumn` with dependent re-validation.** A
  same-name replacement variant that pre-flight-validates every
  dependent against the proposed new definition and reports affected
  dependents on failure. Discriminated return: `{ success: true; info
} | { success: false; error: DerivedColumnError }`. New error code
  `DEPENDENTS_INCOMPATIBLE` carries `details.dependentsAffected:
string[]` and `details.reasons: Record<string, string>`. The
  `derivedChange` event payload widened to carry a `kind: 'added' |
'removed' | 'replaced' | 'updated'` discriminator and the affected
  `columnName`. Use `replaceDerivedColumn` when an end-user edits an
  expression whose dependents you want to re-validate atomically;
  continue using `updateDerivedColumn` for renames.
- **`table.annotations` namespace — programmatic CRUD + JSON I/O +
  session persistence.** A new `AnnotationStore` exposed on
  `table.annotations` (constructed by `createDataTable`; the class
  itself lives on `/advanced`). Three scopes (`row` / `column` /
  `cell`) discriminated by `scope`, three severities (`error` /
  `warning` / `info`). Public surface: `add`, `addMany` (atomic),
  `update` (`scope` / `rowId` / `column` immutable), `get`, `getAll`,
  `getByRow`, `getByColumn`, `getByCell` (intersection sorted by
  severity → `createdAt` → insertion), `remove`, `removeMany`,
  `clear(scope?)`, `count`, `toJSON`, `loadJSON(file, mode?: 'replace'
| 'merge')`, `on('change', handler)`, `setSeverityFilter`,
  `getSeverityFilter`. JSON file format documented at
  `docs/api-reference.md#annotation-json-format` with
  `ANNOTATION_FILE_VERSION = 1`; unknown top-level and per-annotation
  fields round-trip verbatim. Auto-persisted into
  `SessionSnapshot.annotations`; `SNAPSHOT_VERSION` bumped to 5
  (back-compat — pre-v5 snapshots load with empty store). New
  `AnnotationError` (codes `DUPLICATE_ID` / `NOT_FOUND` /
  `INVALID_SHAPE` / `VERSION_UNSUPPORTED`). Annotations live outside
  `TableState` and do **not** participate in undo/redo. Example 11
  (`examples/11-annotations/`) demos full CRUD, JSON round-trip,
  severity filter, and IndexedDB persistence.
- **Annotation rendering — row / cell / header tint + intersection
  popover.** DOM classes applied at render time:
  `dt-row--annotated`, `dt-cell--annotated`, `dt-header--annotated`
  with severity modifiers (`dt-*--annotation-error` / `-warning` /
  `-info`). Highest-severity-wins per element. Shared
  `AnnotationPopover` (single instance, anchored on hover / focus,
  dismissed on Escape / blur / scroll / click outside; `role="tooltip"`
  - `aria-live="polite"`) renders the `getByCell` intersection grouped
    by scope. Severity filter (`setSeverityFilter`) is a view concern —
    data is unchanged; the rendering layer reads the flags and hides
    non-matching annotations. CSS tokens: `--dt-annotation-{error,
warning, info}-{fg,bg,bdr}` plus derived `-bg-hover` variants in
    light + dark; new z-index `--dt-z-annotation-popover: 55` between
    floating panels and CodeMirror autocomplete.
- **Programmatic column-header tooltip popover.** New
  `table.actions.setColumnHeaderTooltip(column, content | string |
null)` and `getColumnHeaderTooltip(column)`. Structured content
  shape: `{ title?, description?, items?: Array<{ label, value:
string | string[] }> }`. String shorthand normalises to `{
description }`; `null` (or any input that normalises to empty)
  clears the override. Every text field is rendered via
  `.textContent` — HTML strings, DOM nodes, and render functions are
  not accepted. Persisted into `SessionSnapshot.columnHeaderTooltips`
  by default (legacy string entries from in-flight sessions are
  normalised on restore). Anchored on the column-name span (distinct
  DOM node from the annotation popover) with `tabindex="0"` added
  only when an override is set, so the keyboard tab order stays
  clean for tables that don't use the feature. New z-index
  `--dt-z-col-tooltip: 56` above the annotation popover. Public type
  exports: `ColumnHeaderTooltipContent`, `ColumnHeaderTooltipItem`.
  Tier-2 export (`/advanced`): `ColumnHeaderTooltipPopover`. Example
  12 (`examples/12-column-header-tooltips/`) demos rich, enum, string
  shorthand, clearing, the XSS-safety contract, and the recommended
  no-persistence pattern (`persistence: false`).
- **Typed error model and event bus.** A new `DataTableError` base class plus
  focused subclasses (`WorkerInitError`, `WorkerTerminatedError`, `QueryError`,
  `LoadError`, `SQLValidationError`, `DerivedColumnError`, `PersistenceError`,
  `ExportError`, `ConfigurationError`, `DestroyedError`). Every throw site
  across the library now raises one of these with a `SCREAMING_SNAKE_CASE`
  `code`, optional `details`, and native `Error.cause` chaining. `TableEvents`
  gains `error` (typed `DataTableError` + a `source` discriminator) and
  `warning` (`code` / `message` / `details`) events.
- **Lifecycle hardening.** `DataTable` exposes `isDestroyed()` and
  `isPersistenceActive()` getters. Post-destroy method calls now throw
  `DestroyedError`. `EventEmitter` isolates listener errors via an optional
  `onListenerError` hook and reroutes them through the `error` event with
  `source: 'listener'` so one throwing subscriber no longer breaks later ones.
  The `ready` event replays once per late subscriber so
  `const t = await createDataTable(…); t.on('ready', …)` always fires.
- **Worker configurability.** `WorkerBridgeOptions` gains `workerFactory`,
  `workerUrl`, and `duckdbBundles`. Strict-CSP (`worker-src 'self'`) and
  air-gapped embedders can now self-host the worker script and DuckDB WASM
  bundles without patching the library.
- **`/advanced` subpath entry.** Lower-level building blocks (low-level state,
  table/filter/derived-column UI components, export helpers, visualization
  internals, persistence snapshot serializers, `AutoSave`, and the deprecated
  `VisualizationFactory` wrapper) are re-exported from
  `@jeyabbalas/data-table/advanced`. Most consumers should stay on the root
  entry; reach for `/advanced` only when the `createDataTable()` facade does
  not expose what you need. API-surface snapshot test
  (`tests/api-surface.snapshot.test.ts`) and explicit Tier-1 / Tier-2 / Tier-3
  guards (`tests/api-surface.exports.test.ts`) lock the exported symbol list;
  future changes require intentional snapshot updates.
- **`VisualizationRegistry`.** Per-instance visualization registry (via
  `createDataTable({ visualizationRegistry })`) replaces the global
  `VisualizationFactory` registration pattern. `defaultVisualizationRegistry`
  is available for apps that still want a shared default across tables.
- **Modal & panel infrastructure.** Shared `ModalHost` primitive (exported
  from `/advanced`) drives every modal and panel: focus trap, Escape to
  close, scroll lock (modals only, reference-counted), focus restore to the
  opener, and stack-index-aware z-indexes. New CSS variables
  `--dt-z-modal-stack-step` (layer step between simultaneous modals) and
  `--dt-panel-width` (filter / preset / derived-column panel width).
- **Grid accessibility.** `role="grid"` on the root with live
  `aria-rowcount` / `aria-colcount`; `role="columnheader"` / `row` /
  `gridcell` with `aria-sort` / `aria-rowindex` / `aria-colindex`;
  `aria-selected` on selected rows; roving `tabindex`; keyboard navigation
  (arrow keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter on
  header sorts, Enter on cell selects); a polite `aria-live` region
  announcing filter / sort / row-count changes. `axe-core` runs in the
  test suite.
- **Programmatic color scheme.** New `colorScheme?: 'light' | 'dark' | 'auto'`
  option on `createDataTable` and `DataTable.setColorScheme()` /
  `getColorScheme()` methods. Dark-mode styles are dual-scoped across
  `@media (prefers-color-scheme: dark)` and
  `[data-dt-color-scheme="dark"]` attribute selectors; body-portalled modals
  observe the attribute via `MutationObserver` so they stay in sync when
  the theme flips while a modal is open. A new `<!-- dt-vars -->` auto-
  generated variable reference table in the README is kept in sync with
  `src/styles/` via `scripts/check-css-vars.mjs` (wired into `npm run build`).
- **Internationalization hook.** New `messages?: DeepPartial<Strings>` option
  on `createDataTable` overrides every user-facing string (button labels,
  placeholders, `aria-label` copy, live-region templates, stats formatters).
  `defaultStrings` and `mergeStrings` are exported for consumers who want to
  build a fallback chain. No locales bundled — ship your own.
- **Stylesheet presence detection.** New `isStylesheetLoaded(root?)` sync
  getter pairs with the `warning` event (`code: 'STYLESHEET_MISSING'`) — the
  getter is useful for pre-mount checks, the event for logging.
- **`filtersToWhereClause` re-exported from the root.** The canonical
  `Filter[] → SQL` converter (already used internally by every built-in
  visualization, stats computer, and the export path) is now part of the
  public API, alongside `quoteIdentifier` and `formatSQLValue`. Enables
  custom `BaseVisualization` subclasses to rescope against active filters
  in one line. Example 08 (custom choropleth) now demonstrates this:
  `fetchData()` composes `filtersToWhereClause(this.options.filters)`
  into its aggregation, so the map re-shades whenever filters change.
- **Browser feature detection.** New `checkBrowserSupport(): { supported,
missing }` sync probe of `Worker`, `WebAssembly`, `indexedDB`,
  `ResizeObserver`, `BigInt`, and `structuredClone`. New
  `strictBrowserCheck?: boolean` option on `createDataTable` — when `true`,
  rejects with `WorkerInitError` (`code: 'WORKER_UNSUPPORTED'`,
  `details.missing: string[]`) before touching the worker. Default remains
  best-effort init (real failures surface later via the `error` event).
- **Documentation — Phase 2 depth content.** Task-oriented guides under
  `docs/guides/` (loading data, filters, derived columns, events,
  visualizations, session persistence, theming, i18n, accessibility,
  multi-table, CSP/offline, filter presets), architecture and state-model
  concept docs under `docs/concepts/`, framework and bundler integration
  guides under `docs/integrations/` (React, Vue, Svelte, Solid, Next.js,
  Nuxt, Vite, Webpack, CDN), a methodology-first performance playbook at
  `docs/performance.md`, and a docs landing index at `docs/README.md`. New
  `llms.txt` at the repo root follows the [llmstxt.org](https://llmstxt.org)
  convention for coding-agent indexing. Two new runnable examples —
  `09-multi-table` (shared `FilterPresetManager` + `SessionStore` across
  instances) and `10-filter-presets` (save / load / export / import
  preset JSON). README's theming section trimmed to a summary + link;
  the complete `--dt-*` CSS variable reference (60 tokens with light /
  dark defaults side-by-side) now lives in `docs/guides/theming.md`, and
  `scripts/check-css-vars.mjs` validates sync against that file. AGENTS.md
  §9 Pointers expanded with links to every new guide, concept, and
  integration doc.

### Changed

- `ready` event now emits inside a microtask after `createDataTable()`
  resolves, and replays exactly once per late subscriber so the event is
  no longer missed by `const t = await createDataTable(...); t.on('ready',
…)`.
- `EventEmitter` wraps each listener in try/catch so one throwing
  subscriber no longer blocks the rest.
- The `ConfigurationError` subclass now surfaces option-validation failures
  (`code: 'OPTIONS_INVALID'`) that previously threw plain `Error`s.
- `derivedChange` event payload widened (additive) — now carries
  `kind: 'added' | 'removed' | 'replaced' | 'updated'` and an optional
  `columnName: string` alongside the existing `derivedColumns` array.
  Existing handlers that only read `derivedColumns` keep working.
- `SNAPSHOT_VERSION` bumped from 4 → 5 to accommodate the new
  `annotations` and `columnHeaderTooltips` fields. Back-compat — older
  snapshots load with empty `annotations` and absent
  `columnHeaderTooltips`, no error.

### Fixed

- `AbortSignal` leak on the worker-bridge abort path:
  `signal.removeEventListener` is now called on every resolved / rejected /
  aborted query, and on bridge teardown for any in-flight request.
- `AutoSave.enable()` is idempotent — repeat calls no longer stack
  `visibilitychange` / `beforeunload` listeners.
- `ColumnResizer` clears its `transitionend` fallback `setTimeout` on detach
  so abandoned animations don't fire against removed elements.
- **Stats-panel filter-broadcast race.** `StatsPanelCoordinator` now
  stamps a monotonic `filterSequence` per broadcast and short-
  circuits per-panel `updateFilters()` calls whose tag has been
  superseded, so a fresh filter change can no longer land stale
  data on a panel mid-fan-out (the base-class default's last-write-
  wins on `this.options.filters` previously made this possible). The
  `setHoverStats` contract is also tightened: the argument is an
  **HTML string** (the same pre-formatted markup the library's
  built-in panel renders in place of line 2); the bundled
  `Histogram` / `ValueCounts` visualizations escape every user-
  derived value before producing it, and custom visualizations are
  responsible for escaping any user-derived text before passing it
  to `onStatsChange`.

### Changed (breaking)

- **Post-destroy method calls now throw `DestroyedError`.** Previously
  silent no-ops; now they throw. Framework-integration cleanup paths should
  either `await table.destroy()` in the unmount handler or guard with
  `if (!table.isDestroyed()) …` — see the README's "Framework integration"
  section.
- **`getDefaultBridge()` removed.** Migrate to `new WorkerBridge()`
  (optionally share via `createDataTable({ bridge })`).
- **Static `VisualizationFactory` deprecated.** Still exported from
  `/advanced` for source-compatibility; migrate to `VisualizationRegistry`
  (per-instance) or `defaultVisualizationRegistry` (shared default). The
  static wrapper will be removed in a future minor.
- **Root entry pruned.** The public surface (`@jeyabbalas/data-table`) now
  exports only the facade, typed error classes, essential types, and a
  small set of power-user hooks. Tier-2 symbols moved to
  `@jeyabbalas/data-table/advanced`. Tier-3 implementation internals
  (`createSignal` / `computed` / `batch`, `PerfMonitor`, `QueryCache`,
  `DataLoader`, schema / type-inference / pattern-detection helpers,
  `filterToSQL` / `filtersToWhereClause`, crossfilter splitter,
  state-snapshot serializers, progress formatters, worker message types,
  and others) were removed from the public surface entirely.
- `quoteIdentifier` and `formatSQLValue` remain public at the root —
  elevated from their previous classification so consumers authoring raw
  SQL (for example the downstream data-quality rule authoring app) have a
  stable, safe helper instead of re-implementing identifier/literal
  escaping.
- Legacy `DataTableOptions` interface removed from `src/core/types.ts` —
  it was unused by the façade. Use `CreateDataTableOptions` instead.

### Migration

- `import { EventEmitter, StateActions, createTableState, UndoManager,
TableContainer, FilterBar, ExportDialog, AutoSave, BaseVisualization,
... } from '@jeyabbalas/data-table'`
  → update the specifier to `'@jeyabbalas/data-table/advanced'`.
- Tier-3 symbols are no longer exported. If you relied on one, please file
  an issue describing the use case so it can be re-evaluated.
- `import { getDefaultBridge } from '@jeyabbalas/data-table'` →
  `import { WorkerBridge } from '@jeyabbalas/data-table'; const bridge =
new WorkerBridge(); await bridge.initialize();`. Pass the bridge into
  `createDataTable({ bridge })` if you want to share one across tables.
- `VisualizationFactory.register({ … })` →
  `defaultVisualizationRegistry.register({ … })` for the shared default, or
  construct a per-instance registry and pass it via
  `createDataTable({ visualizationRegistry: new VisualizationRegistry() })`.
- Framework cleanup code relying on post-destroy silent no-ops should call
  `if (!table.isDestroyed()) await table.destroy()` in the unmount handler
  (React `useEffect` return, Vue `onBeforeUnmount`).

## [0.1.0]

Initial prerelease.
