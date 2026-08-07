# Phase 6 — Interaction sweep at 1K columns

Size: **M/L** · Depends on: **Phases 3, 4, 5** (plus the Phase 0 harness) · Blocks: **nothing
downstream — Phase 12 re-verifies the full matrix**

---

## 1. Context

Read [`README.md`](./README.md) (whole file), then [`STATUS.md`](./STATUS.md) — especially the
Phase 3–5 handoff notes, which say where windowing moved the code this document anchors into —
then this file. Phases 3–5 made rendering and fetching O(window); this phase makes the
**gestures** smooth at 1K columns — resize drag, pin/unpin, keyboard navigation, hide/show — and
adds the one genuinely new feature surface in the whole plan: a **searchable column picker**,
because 1K columns cannot be managed one eye-icon at a time. Everything else is a
measure-then-fix sweep of per-gesture hotspots that survived windowing.

Relevant README sections: §5.D (interaction paths), §5.H (assets), §6 (WIDE / WIDE_CI tiers), §9
(column-group headers rejected — the picker is the management tool), Glossary.

**Mandatory first step — measure, then re-rank.** Post-windowing profiles may not match the
branch-point predictions below. Before implementing anything, run the §4.1 benchmarks at WIDE,
rank this phase's items by measured cost, record the ranking in STATUS.md, and demote items that
already meet their budgets to _verify-only_ (keep their regression asserts; skip their rewrites).

## 2. Problem statement

Branch-point anchors (re-locate all — Phases 3–5 rewrote these files):

- **Resize drag** runs the full state pipeline per raw `mousemove` (no rAF coalescing,
  `src/table/ColumnResizer.ts:212-230`): `setColumnWidth` clones the **entire** `columnWidths`
  Map and writes the signal per event (`src/core/Actions.ts:1123-1128`); subscribers then loop
  headers (`src/table/TableContainer.ts:1185-1194`) and cells, re-sum total width O(cols), and
  re-query the header row via `closest().querySelector()` per call
  (`src/table/TableBody.ts:2012-2042`).
- **Pin/unpin FLIP** interleaves `getBoundingClientRect` reads with transform writes per header
  (`TableContainer.ts:1514-1539`; read `:1522`, write `:1528` — layout thrash), after a snapshot
  loop that rects every header (`:1026-1041`). `updatePinnedColumnStyles` (`:1202-1280`) scans
  rows × `visibleColumns` cells to style what is usually 1–3 pinned columns.
- **Keynav** pays O(cols) per keystroke: `moveFocus` does `visibleColumns.indexOf`
  (`KeyboardNavigator.ts:850`); `scrollFocusedCellIntoView` sums widths across all columns
  (`:920-946`). `RovingTabindex` re-runs `querySelectorAll` on every keydown/focusin
  (`src/core/RovingTabindex.ts:177,220,294-296`) — at 900 hidden chips, ~1,800-element scans per
  arrow key.
- **Annotation classify** does `getByRow().filter()` + `getByColumn().filter()` + `getByCell()`
  (a set-union **plus sort** per call, `src/annotations/AnnotationStore.ts:385-404`) for every
  rendered cell (`TableBody.ts:1595-1661`); `reapplyAnnotationsToVisibleRows` re-renders every
  visible cell on any store change (`:1678-1708`). Phase 3's bailout covers the empty store only.
- **Hidden-column management** has no scalable UI: hiding is per-header eye icons; the gutter
  rebuilds every chip from `innerHTML = ''` on each change
  (`src/table/HiddenColumnsGutter.ts:118-145`). There is no bulk action — hiding N columns is N
  undo entries and 2N signal writes (`Actions.ts:885-908,913-944`) — and `visibleColumns` writes
  may still fan out visualization re-attach (`src/DataTable.ts:1161-1175`; Phases 2/4 should
  have fixed this — this phase asserts it).

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- STATUS.md handoffs for Phases 3–5: where the column window lives, the prefix-sum/offset
  structure P3 built, how window cells are keyed (index vs `data-column`), what
  `updateCellWidths` / `updatePinnedColumnStyles` look like now, P4's incremental header path,
  and P5's projection clipping (width changes may shift the window).
- `src/table/ColumnResizer.ts` — whole file: drag lifecycle (`:181-259`), double-click reset
  (`:264-301`), min/max 50/500 (`:86-87`); `src/table/ColumnHeader.ts:118-128` (resizer →
  actions wiring) and `:896-911` (keyboard resize clamp).
- `src/core/Actions.ts` — `setColumnWidth` (`:1123-1128`), the layout-gesture API (`:368-425`;
  push-only-if-changed at `:392`), `hideColumn`/`showColumn`/`showAllColumns` (`:885-955`, incl.
  `HiddenColumnInfo` neighbor capture), `toggleColumnPin` (`:1084-1118`) — **there is no
  `pinColumn`** — and the `batch()` precedent (`:323`).
- `src/table/TableContainer.ts` — `columnWidths` subscription (`:1006-1011`), pinned snapshot
  loop (`:1026-1041`), `updateColumnWidths` (`:1185-1194`), `updatePinnedColumnStyles`
  (`:1202-1280`), FLIP playback (`:1509-1540`), FilterPanel lazy-create precedent
  (`:1643-1653`), gutter mount (`:358-365`), structure comment (`:294-303` — gutter/toolbar
  siblings live **outside** `.dt-grid`).
- `src/table/KeyboardNavigator.ts` — `activeControls` (`:446-468`; the early bail at `:456` is
  real — verify it survived), `findHeader` (`:546-549`), `syncLayoutAffordance` (`:798-803`),
  `moveFocus` (`:836-872`), `scrollFocusedCellIntoView` (`:895-947`).
- `src/core/RovingTabindex.ts` — whole file: `getControls` (`:115-117`), per-event queries
  (`:177,220`), `applyTabindexes` (`:247-251`), `queryAll` (`:294-296`), and the `refresh()`
  contract (`:129-147` — "call after every rebuild") your cache leans on.
- `src/table/TableBody.ts` — `rebuildColIndexMap` (`:367-378`), `columnWidths` subscription
  (`:491`), `applyCellAnnotationClasses` (`:1595-1661`), `reapplyAnnotationsToVisibleRows`
  (`:1678-1708`), `updateCellWidths` (`:2012-2042`); `src/annotations/AnnotationStore.ts`
  lookups (`:367-404`) + change-event kinds/ids (emit sites `:330-356`).
- `src/table/HiddenColumnsGutter.ts` — whole file; `src/filters/FilterPanel.ts` `ModalHost`
  usage (`:253-259`); `src/core/ModalHost.ts` open options (`initialFocus`,
  `outsideClickIgnore`, `colorSchemeSource`); `src/core/Strings.ts` namespace layout (`:33+`,
  a11y `:337+`); `src/advanced.ts:61-62,74-75` (the picker's export precedent).
- Phase 0 deliverables you consume: `tests/budgets.ts` (`INTERACTION` placeholder),
  `tests/browser/helpers/metrics.ts` (`frameSampler`, `bridgeStats`, `resetBridgeStats`),
  `tests/browser/helpers/wideTable.ts` (`mountTierTable`), the demo `?gen=` harness,
  `plans/scaling/baselines/`. Also `tests/table/ColumnResizer.test.ts` (synthetic mouse events),
  `tests/browser/axe.spec.ts` (AxeBuilder against `.dt-root`),
  `src/core/UndoManager.ts:312-314` (`undoDepth`).

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Measure first — `tests/browser/interaction-profile.spec.ts` (new, `RUN_BROWSER_PERF=1`)

Mount WIDE (`mountTierTable`, viz=on). Per gesture: `resetBridgeStats` + `frameSampler`, record
`{gesture, wallMs, p95FrameMs, maxFrameMs, queries}` for:

1. resize drag — `page.mouse` down on a header handle, ~60 moves over ~1 s, up;
2. pin, then unpin, one mid-window column;
3. keynav — 40 ArrowRight from a mid-table cell crossing the window edge; one F2 cycle;
4. hide one column, show it back (the query delta is the Phase 2/4 regression probe);
5. reorder one column via Shift+F2 move;
6. annotated pass — add ~600 annotations page-side (200 row / 200 column / 200 cell scope via
   `table.annotations`), then a short scroll storm.

Write the ranking table plus raw JSON into STATUS.md **before any product commit**; demote items
already inside their §4.9 budgets. Re-run at phase end — the spec is also the after-proof.

### 4.2 Resize drag — drag-local overlay, one write per frame, one undo entry

During drag, **no signal writes**:

- rAF-coalesce in `ColumnResizer`: `mousemove` stores a pending width and schedules one rAF; the
  flush invokes a new live-resize callback threaded `TableContainer` → `ColumnHeader` options →
  `ColumnResizer` (alongside `onDragStart/End`). The overlay (TableContainer-owned) applies the
  pending width directly: the dragged column's mounted header, its mounted body cells (≤ window
  rows), and the width spacer adjusted by delta — never a loop over all columns. If the column
  is pinned, recompute offsets for the mounted pinned set only.
- The P3 window computation must see the drag width (a 500→50 px shrink opens ~450 px at the
  window's right edge): thread a single effective-width accessor for the dragged column into the
  window math. Fallback if invasive: re-evaluate the window per rAF flush with only the spacer
  updated, accept ≤ 1 frame of blank at extreme shrinks, record it.
- On mouseup: flush, then **one** `actions.setColumnWidth` inside the existing
  `beginColumnWidthChange`/`endColumnWidthChange` gesture — one Map clone, one write, one undo
  entry (pushed only if changed, `Actions.ts:392`); subscribers reconcile everything. Escape
  restores via `cancelColumnLayoutChange` (`:405-412`) — verify the snapshot write repaints over
  the overlay's direct DOM writes.
- Finish the subscriber side: `updateColumnWidths` / `updateCellWidths` must be O(mounted)
  post-P3/P4 (verify); replace the O(cols) total-width sum (`TableBody.ts:2027-2032`) with P3
  prefix sums or an incremental delta; cache the header-row element. The keyboard resize path
  (`ColumnHeader.ts:896-911`, one write per keystroke) stays as-is.

### 4.3 Pin/unpin — batched FLIP, animation threshold, scoped style pass

- Split FLIP playback (`TableContainer.ts:1514-1539`) into read-all-then-write-all: loop 1
  collects `last` rects, loop 2 writes transforms. One forced layout instead of O(headers).
- New module constant `FLIP_MAX_ANIMATED_HEADERS = 50` in TableContainer: above it, skip the
  snapshot loop (`:1026-1041`) entirely — no FLIP, pin lands instantly. Post-P4 mounts are
  typically 15–30 at default widths, so animation survives normal use; the threshold guards wide
  viewports × 50 px min-width columns.
- `updatePinnedColumnStyles` (`:1202-1280`): header loop must be mounted-only (verify post-P4);
  rewrite the body-cell pass to touch only pinned columns **plus** columns whose pinned-ness
  just changed (clear path), resolved through the P3 window's cell lookup — never a rows ×
  `visibleColumns` scan. Demarcation-overlay logic unchanged.

### 4.4 Keyboard navigation — prefix sums, cached roving controls

- Replace `moveFocus`'s `visibleColumns.indexOf` (`:850`) and `scrollFocusedCellIntoView`'s
  O(cols) width sums (`:920-946`) with P3's prefix-sum offsets + column-index map, reached
  through the existing `getTableBody()` seam (add a thin accessor on TableBody if P3 did not
  export one — do not duplicate the array).
- `activeControls`, `findHeader`, `syncLayoutAffordance`: all walk `getColumnHeaders()`,
  mounted-only post-P4 — **verify-only** unless §4.1 says otherwise.
- `RovingTabindex`: cache `queryAll()`'s result; invalidate in `refresh()` (the documented
  rebuild contract) and `destroy()`. Keydown/focusin/`applyTabindexes` consume the cache;
  `isNavigable` keeps running per use (attribute walks, no layout). Zero `querySelectorAll` per
  keydown.

### 4.5 Annotation classify — precomputed per-render maps

- In TableBody, build once per render/reapply pass: `rowAnnMap` (rowId → marker/severity/count,
  `scope === 'row'`) for window rows and `colAnnMap` (column → same, `scope === 'column'`) for
  window columns. `applyCellAnnotationClasses` becomes two O(1) map lookups + one exact
  cell-scope lookup — add an internal `AnnotationStore` accessor (e.g.
  `getCellScopeAt(rowId, column)`) reading only the `byCell` index: no row∪column union, no sort
  (`getByCell` keeps its public semantics; the popover still uses it once per open).
- Invalidate the maps on store `change` events, window change, and severity-filter change.
- `reapplyAnnotationsToVisibleRows` (`:1678-1708`) gets granular: `change` events carry ids —
  touch only rows/columns/cells intersecting the change; `cleared` keeps the full sweep.
  Preserve the re-render-before-reapply contract (title restoration, `:1670-1676`).
- Equivalence gate: `tests/table/TableBody.annotations.test.ts` passes unchanged.

### 4.6 Bulk visibility — `actions.setColumnVisibility(columns, visible)` (new public API)

- Single `captureForUndo()`. Hide path: record `HiddenColumnInfo` neighbors per column against
  the pre-change visible array (matching `hideColumn`, `:895-904`), then **one**
  `hiddenColumnInfo.set` + **one** `visibleColumns.set` inside `batch()` (precedent `:323`).
  Never empties `visibleColumns`: when asked to hide everything, the leftmost currently-visible
  column stays (mirrors `:891`). Show path: reuse `computeRestoreIndex` /
  `computeOrderBasedIndex` against an accumulating array. Unknown or already-correct names are
  skipped silently (matching `:888,:918`); a no-op call writes nothing and captures no undo.
- JSDoc with `@example`, `docs/api-reference.md`, API-surface snapshot, changeset (README §8.3).
- `hideColumn`/`showColumn` stay as the single-column paths; the picker's bulk buttons call the
  new action.

### 4.7 Searchable column picker — the one new feature (keep it minimal)

New `src/table/ColumnPickerPanel.ts`, exported from `/advanced` (precedent
`src/advanced.ts:61-62,74-75`). Lazy-created by TableContainer on first open
(`TableContainer.ts:1643-1653` precedent); `ModalHost` `mode: 'panel'` with `initialFocus` = the
search input, `outsideClickIgnore` = the opening button, `colorSchemeSource` = the root
(`FilterPanel.ts:253-259`). `role="dialog"`, labelled by its title.

- **Search**: one text input (`role="combobox"`, `aria-expanded="true"`, `aria-controls` → the
  listbox); case-insensitive substring match on column name; matches drawn from `columnOrder`
  (visible **and** hidden).
- **List**: `role="listbox"`, `aria-multiselectable="true"`; one `role="option"` row per match,
  `aria-selected` mirrors visibility, pin state as a glyph + in the accessible name.
  **Windowed**: spacer div + absolutely-positioned slice of ~32 px rows in a ~400 px max-height
  scroll box rendering visible ± overscan (a self-contained ~80-line windowed list — do not drag
  in VirtualScroller). DOM options ≤ `INTERACTION.PICKER_LIST_DOM_MAX` at 1K columns.
- **Keyboard** (APG combobox-with-listbox): ArrowDown/Up move `aria-activedescendant` across
  options (scrolling the window), Enter/Space toggles the active option's visibility
  (`showColumn`/`hideColumn`), `p` toggles pin (`toggleColumnPin` — verified: no `pinColumn`
  exists), Home/End jump, Escape closes. Options contain **no nested interactive elements**
  (keeps axe's `nested-interactive` green): pointer click on an option toggles visibility; the
  pin glyph is a delegated click zone on the listbox, not a button.
- **Bulk**: footer buttons "Hide matching" / "Show matching" call `setColumnVisibility` with the
  current matches; a `visible/total` summary; an sr-only live region announcing results.
- **Opening affordance**: `HiddenColumnsGutter` gains a persistent "Manage columns" button and
  the gutter becomes always-visible (button alone when nothing is hidden; the label, chips, and
  Show all appear as today otherwise). New-default UI change per README §2.1 — changeset +
  migration note. Tab-stop census stays five: the button joins the gutter's roving toolbar.
- **i18n**: new `columnPicker` namespace in `Strings` (interface + defaults): `manageButton`,
  `title`, `searchLabel`, `searchPlaceholder`, `hideMatching`, `showMatching`, `noMatches`,
  `summary(visible, total)`, `optionLabel(column, visible, pinned)`, `pinToggleHint`,
  `columnsHidden(n)`, `columnsShown(n)` — adjust to the file's conventions, keep the set
  minimal. CSS: `dt-`-prefixed classes in `src/styles/data-table.css`, reuse existing tokens;
  any new CSS variable means `npm run check:css-vars` + the theming.md table (README §8.3).

### 4.8 Hidden gutter — incremental chips

Replace `render()`'s `innerHTML = ''` wipe (`HiddenColumnsGutter.ts:118-145`) with a keyed diff:
keep `Map<column, chipEl>`; remove departed chips, insert arrivals at their `columnOrder`
position, leave survivors untouched. `showAllButton` rule (`:144`) and
`roving.refresh({ restoreFocus })` (`:105-116`) unchanged. Hiding column 901 of 1,000 creates 1
chip, not 900.

### 4.9 Budgets — fill the `INTERACTION` namespace in `tests/budgets.ts`

Default-run (machine-independent counts/invariants):

| Constant                            | Value | Asserted by                                |
| ----------------------------------- | ----- | ------------------------------------------ |
| `QUERIES_PER_SORT_MAX`              | 4     | browser interaction spec (bridge-stat Δ)   |
| `QUERIES_PER_HIDE_SHOW_MAX`         | 2     | browser spec — proves no viz re-attach     |
| `QUERIES_PER_REORDER_MAX`           | 2     | browser interaction spec                   |
| `STATE_WRITES_PER_RESIZE_FRAME_MAX` | 1     | jsdom drag test (subscriber fire count)    |
| `UNDO_ENTRIES_PER_RESIZE_GESTURE`   | 1     | jsdom drag test (`undoDepth` Δ)            |
| `PIN_RECT_READS_ABOVE_THRESHOLD`    | 0     | jsdom threshold test (rect spy)            |
| `ROVING_QUERIES_PER_KEYDOWN`        | 0     | jsdom RovingTabindex test (qSA spy)        |
| `PICKER_LIST_DOM_MAX`               | 40    | browser interaction spec (option count)    |
| `BULK_HIDE_UNDO_ENTRIES`            | 1     | jsdom bulk-action test + browser spec      |
| `BULK_HIDE_WRITES_PER_SIGNAL`       | 1     | jsdom bulk-action test (subscriber counts) |

`RUN_BROWSER_PERF`-gated wall-clock (Phase 0 rule — never in default runs):
`RESIZE_DRAG_FRAME_P95_MS = 32`; `PIN_GESTURE_FRAME_P95_MS` and `THEME_FLIP_MS` set from the
§4.1 measurement + headroom (record the measured numbers next to the constants).

### 4.10 Risk notes / fallbacks

- **The ranking may contradict the predictions** — that is what §4.1 is for. Demote, don't
  delete: every §4.2–4.5 item keeps at least its regression assert.
- **Picker a11y**: if axe or the keyboard-only pass faults the combobox/listbox composition,
  fall back to the gutter's proven pattern — plain list, real per-row buttons,
  `RovingTabindex('vertical')` as the single stop — and record it in STATUS.md.
- If hide/show still fans out visualization re-attach (`DataTable.ts:1161-1175` descendant), fix
  it here only if it is a scoping-guard miss; anything larger goes to STATUS.md as a Phase 2
  escape before you proceed.
- `npm run size`: the picker adds library bytes. If the size budget trips, raise it consciously
  in the same commit; record the delta in STATUS.md and the changeset.

## 5. Implementation milestones (commit at each)

Milestone 1 is fixed; execute 2–5 in measured-rank order (below is the predicted ranking).

1. Interaction profile spec, run at WIDE, ranking + raw JSON in STATUS.md. — _commit: "Add a
   gated interaction profile spec for wide tables"_
2. Resize overlay + rAF coalescing + windowed width sync + jsdom drag tests. — _commit:
   "Coalesce resize drags into one state write per frame"_
3. FLIP batching + threshold + scoped pinned styles + tests. — _commit: "Batch pin FLIP reads
   and cap animation by mounted headers"_
4. Keynav prefix sums + RovingTabindex caching + tests. — _commit: "Use prefix sums and cached
   controls in keyboard navigation"_
5. Annotation precompute + granular reapply + tests. — _commit: "Precompute annotation maps for
   windowed cell classify"_
6. `setColumnVisibility` + JSDoc/api-reference/snapshot + tests. — _commit: "Add a bulk column
   visibility action"_
7. Gutter chip diff + manage-columns affordance. — _commit: "Diff hidden-column chips instead of
   rebuilding the gutter"_
8. Picker panel + Strings + CSS + axe + unit/browser tests, then budgets + default-run
   interaction spec + gated asserts + WIDE re-baseline + changeset + docs. — _commits: "Add a
   searchable column picker panel", "Assert interaction budgets and refresh wide baselines"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size
npm run docs:api:check
npm run test:browser                   # includes the new interaction + axe coverage
RUN_BROWSER_PERF=1 npx playwright test tests/browser/interaction-profile.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # WIDE re-capture, append-only
```

Phase-specific asserts:

- jsdom drag test (precedent `tests/table/ColumnResizer.test.ts` + fake rAF): N synthetic
  mousemoves in one frame → ≤ 1 `columnWidths` subscriber fire per rAF flush, 0 between flushes;
  mouseup → exactly 1 more write and `undoDepth` Δ = 1; Escape mid-drag → Δ = 0, width restored.
- jsdom FLIP test: > `FLIP_MAX_ANIMATED_HEADERS` mounted → 0 `getBoundingClientRect` calls on
  the pin path (spy); ≤ threshold → read phase strictly precedes write phase.
- jsdom RovingTabindex test: 0 `querySelectorAll` per keydown/focusin after `refresh()` (spy);
  invalidation proven by navigating a rebuilt toolbar.
- jsdom bulk test: `setColumnVisibility(900 cols, false)` → 1 undo entry, 1 fire each on
  `visibleColumns` + `hiddenColumnInfo`, last-column guard holds; show path restores
  neighbor-aware order; no-op call writes nothing.
- Annotation tests: precomputed maps agree with the old per-cell classification on
  row/column/cell fixtures; granular reapply touches only affected cells (render spy);
  `TableBody.annotations.test.ts` unchanged and green.
- New default-run `tests/browser/interaction.spec.ts` at WIDE_CI (single mount, keep it under
  ~60 s): sort/hide/show/reorder bridge-stat deltas ≤ their budgets; picker open → search
  `col_9` → match count correct, DOM options ≤ `PICKER_LIST_DOM_MAX`; "Hide matching" → 1 undo
  entry, one `visibleColumns` fire (page-side subscriber probe); undo restores all in one step;
  column oracle still 0 violations afterwards.
- Axe (extend `tests/browser/axe.spec.ts` or a sibling): analyze with the picker open — zero
  violations, both themes.
- Gated perf spec asserts `RESIZE_DRAG_FRAME_P95_MS`, `PIN_GESTURE_FRAME_P95_MS`,
  `THEME_FLIP_MS` at WIDE via `frameSampler`.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`?gen=wide&viz=on` (READY budget: latest WIDE baseline + margin). Steps 1–5 as templated (sort
query budget = `QUERIES_PER_SORT_MAX`); replace step 8 with this phase's gesture pass:

- **Resize**: record a ±150 px drag with `gif_creator` — tracking stays live, no jank; repeat at
  the window's right edge after a deep horizontal scroll. One Ctrl+Z restores the pre-drag width.
- **Pin**: pin/unpin a mid-window column — animated, instant-feeling. Then `resize_window` to
  ~2,600 px and, via `javascript_tool`, set ~80 consecutive columns to 50 px
  (`actions.setColumnWidth` loop) so mounted headers exceed the threshold — pin again: **no
  animation**, near-instant.
- **Keynav**: keyboard-only — F2 into header controls and back, Shift+F2 resize/move/commit (one
  undo entry), arrows walking the cursor across the window edge without long frames.
- **Picker**: keyboard-only — Tab to the gutter, Enter on "Manage columns", type `col_9` (expect
  111 matches at 1K), ArrowDown + Space toggles a column, `p` pins/unpins it, "Hide matching" →
  chips appear in one pass; Ctrl+Z restores all 111 in **one** step; redo. Screenshot the open
  picker.
- **Bulk at scale** (`javascript_tool`): `actions.setColumnVisibility(cols.slice(100), false)`
  (900 columns) → `undoDepth` Δ = 1, one `visibleColumns` fire, table still scrolls; undo.

Then steps 9–12 as templated (export sanity, theme flip within the `THEME_FLIP_MS` feel, **zero
new console errors**, cleanup). Attach the final `window.__dtPerf` snapshot, the resize GIF, and
3 screenshots (picker open, post-bulk-hide, dark) to STATUS.md.

## 8. Acceptance checklist

- [ ] §4.1 ranking ran first and is in STATUS.md, with demotions noted.
- [ ] All §6 commands green; `npm run size` delta conscious and recorded.
- [ ] Resize: ≤ 1 state write per frame, exactly 1 undo entry per gesture, Escape-clean.
- [ ] Pin: read-then-write FLIP; threshold honored (0 rect reads above it).
- [ ] Keynav + roving: no O(all-columns) loops or per-key `querySelectorAll` on hot paths.
- [ ] Bulk hide/show: 1 undo entry, 1 write per signal, last-column guard.
- [ ] Picker: windowed DOM ≤ budget; search/toggles/bulk work; axe green with the picker open in
      both themes; keyboard-only pass completed.
- [ ] Gutter diffs chips; manage-columns affordance present with zero hidden columns.
- [ ] `INTERACTION` budgets shipped and asserted in default runs; wall-clock only behind gates.
- [ ] WIDE baselines re-captured (append-only) + report regenerated; before/after in STATUS.md.
- [ ] Chrome template executed; GIF + screenshots + final snapshot attached to STATUS.md.
- [ ] STATUS.md row + handoff filled.

## 9. Out of scope

Sorted/filtered deep-scroll query cost (Phase 7); selection model (Phase 8); column-group/band
headers (rejected, README §9 — the picker is the management tool); visualization lifecycle
internals beyond asserting the hide/show query budget (Phase 2 owns them); Arrow transport
(README §9). Picker feature growth: no drag-reorder inside it, no width editing, no persisted
picker UI state, no new constructor options beyond what §4.7 specifies.

## 10. Docs / changeset obligations

- **MINOR changeset** — `Added`: searchable column picker (the always-present "Manage columns"
  affordance called out as a new default, with a migration note) and
  `actions.setColumnVisibility`; `Changed`: resize/pin/keynav/hide-show smoothness at high
  column counts, incremental hidden-column gutter.
- `docs/api-reference.md` regenerated (`npm run docs:api`); API-surface snapshot updated
  (`npx vitest -u`) with the diff reviewed — new public entries only where intended.
- `AGENTS.md` §1 SUPPORTS: add the picker + bulk-visibility capability line.
- `docs/guides/i18n.md`: the `columnPicker` namespace; `docs/guides/accessibility.md`: picker
  keyboard model + the gutter now being a permanent fifth tab stop.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the §4.1 ranking (before) and end-of-phase
re-run (after) with demotions and justification; every `INTERACTION` budget value shipped (and
measured wall-clock numbers behind the gated ones); WIDE baseline deltas; new files
(`ColumnPickerPanel.ts`, both new specs); the `FLIP_MAX_ANIMATED_HEADERS` value and location;
the exact `Strings.columnPicker` keys; the gutter always-visible decision; and line-anchor drift
in `TableBody.ts` / `TableContainer.ts` / `KeyboardNavigator.ts` / `Actions.ts` for Phases 7–9,
which cite them next.
