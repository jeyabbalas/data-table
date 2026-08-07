# Changelog

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
