# Phase 4 — Header column windowing and incremental header updates

Size: **M/L** · Depends on: **Phase 2 (lazy visualizations), Phase 3 (body column windowing)** ·
Blocks: **Phase 5 (projection clipping), Phase 6 (interaction sweep)**

---

## 1. Context

Read [`README.md`](./README.md) (whole file), then [`STATUS.md`](./STATUS.md) — especially the
Phase 2 and Phase 3 handoff sections — then this document. Phase 2 decoupled per-column
visualization state from header DOM (lazy, cached, staleness-aware, observer-gated fetch);
Phase 3 made the body render only the visible column window (+ pinned) behind flexbox spacers.
The header row is now the last O(columns) DOM axis. This phase windows it with the **same
column window the body uses**, makes header mount/unmount cheap enough for scroll-time churn,
and replaces wipe-and-rebuild rendering with incremental, diffed updates. Per README §2.1 this
is the unconditional new default — no opt-out flag; the changeset carries the migration note.

Relevant README sections: §5.D (no column virtualization — the header half), §5.A (query fan-out
on rebuilds), §5.H (assets to build on), Glossary (column window, column oracle, budgets).

## 2. Problem statement

All numbers verified at the branch point; Phases 1–3 may have shifted lines — re-locate.

- Every visible column mounts a `ColumnHeader` eagerly (`src/table/TableContainer.ts:1357-1395`):
  ~38 DOM nodes (`src/table/ColumnHeader.ts:150-340` + resizer handle), ~16 listeners (~13 own
  `:460-499`, 2 resizer `src/table/ColumnResizer.ts:132-133`, 1 reorder `mousedown`
  `src/table/ColumnReorder.ts:410-425`), 6 signal subscriptions + 1 annotation listener
  (`:578-650`). At 1K columns: tens of thousands of header elements, ~16K listeners, ~7K
  subscriptions — plus, pre-Phase-2, ~1K canvases and ~2K observers
  (`src/visualizations/BaseVisualization.ts:215,232-250`).
- The header loop is O(cols²): `schema.find` per column (`TableContainer.ts:1360`) and
  `columnOrder.indexOf` (`:1369`) — ~1M string comparisons per render at 1K columns.
  `TableBody` already solved this with a Map (`src/table/TableBody.ts:367-378`).
- Every `schema` or `visibleColumns` write runs `render()`, which destroys all headers, wipes
  `headerRow.innerHTML` + `bodyContainer.innerHTML` (`TableContainer.ts:1338-1340`), and
  destroys/recreates `TableBody` (`:1440-1486`); subscriptions at `:966-1001`. It runs **twice
  per load** — `initializeColumnsFromSchema` batches per signal, not per subscriber
  (`src/core/State.ts:195-211`). Measured precedent: one keyboard column move at 266 columns =
  534 DuckDB queries, all header rebuild (`TableBody.ts:409-414`).
- `TableBody` can already survive `visibleColumns` writes — its own subscription re-renders on
  reorder and refetches on set change (`TableBody.ts:402-426`) — but `TableContainer.render()`
  kills it first, wasting that machinery.
- Pinned-style updates iterate every header (`TableContainer.ts:1226-1242`), the `pinnedColumns`
  subscription snapshots `getBoundingClientRect` for every header (`:1026-1041`), and the FLIP
  pass reads O(cols) rects in rAF (`:1514-1539`).
- `KeyboardNavigator` walks the full header list per keystroke in controls mode
  (`src/table/KeyboardNavigator.ts:457`); windowing shrinks that for free, but focus, the
  cursor, and popovers must survive headers unmounting.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- Phase 2 and Phase 3 docs + their STATUS.md handoffs. Extract the **exact names** of: Phase
  3's column-window computation, prefix-sum width table, and spacer role/ARIA treatment; Phase
  2's viz-state store (its doc names `VizDataController`) with its attach/detach API and
  cache-hit redraw path. This doc refers to them generically; the handoffs are authoritative.
- `src/table/TableContainer.ts` — `render()` end to end (`:1288-1595`): scroll/focus capture
  (`:1294-1307`), the wipe (`:1338-1340`), header loop (`:1357-1395`), `childElementCount > 0`
  ARIA guard (`:1432-1434`), `columnReorder?.refresh()` (`:1437`), TableBody recreate + eager
  `setContentWidth` (`:1440-1486`), FLIP (`:1509-1540`), restored-column highlight
  (`:1542-1558`), cursor reconcile (`:1563-1565`), rAF scroll/focus restore (`:1568+`). Also:
  subscriptions (`:966-1041`), `destroyColumnHeaders` (`:1171-1176`), `updateColumnWidths`
  (`:1185-1194`), `updatePinnedColumnStyles` (`:1202-1280`), `updateGridCounts` (`:862-870`),
  `syncActiveDescendant` (`:882-913`), `buildHeaderCellId` (`:955-957`),
  `reconcileCursorColumn` (`:1601-1609`), `updateHeaderCursorStyles` (`:1616-1623`),
  KeyboardNavigator wiring (`:425-432`), header/body scroll sync (`:693-705`), `whenBodyReady`
  (`:1893-1894`), `getColumnHeaders` (`:2004-2006`).
- `src/table/ColumnHeader.ts` — constructor + resizer (`:99-141`), `createElement` (`:150-340`),
  `attachEventListeners` (`:460-499`), `subscribeToState` (`:578-650`), `getControls`
  (`:958-969`), `getVizContainer`/`getStatsElement` (`:1008-1017`), `destroy` (`:1029-1067`).
  Verify what `destroy` does **not** cover: popovers anchored on this header, and the reorder
  `mousedown` held in `ColumnReorder.headerHandlers` (`ColumnReorder.ts:430-435,462-473`).
- `src/table/KeyboardNavigator.ts` — `activeControls` (`:446-468`), `enterControlsMode`
  (`:478-485`), `findHeader` (`:546-549`), `enterLayoutMode` (`:566+`), `syncLayoutAffordance`
  (`:798-803`), `HEADER_ROW_INDEX`. All resolve headers through the `getColumnHeaders` callback.
- `src/table/ColumnHeaderTooltipPopover.ts` (`currentAnchor :138`, `isShownFor` `:188-196`,
  window-scroll capture hide `:234`) and `src/table/AnnotationPopover.ts` (anchor predicates
  `:166-174`, `hide` `:223`, scroll capture `:218`). Capture-phase scroll already dismisses on
  scroll; the no-scroll diff path (hide/reorder) is the gap this phase closes.
- `src/DataTable.ts` — `attachVisualizations`' use of `getColumnHeaders()` (`:789`; Phase 2
  reshaped — re-locate), `scheduleAttach` (`:1161-1175`), `refreshNonVizStats` (`:1183-1203`).
- `src/core/State.ts:188-212` (`initializeColumnsFromSchema` batch comment) and
  `src/core/Signal.ts:86-88,137-139` (`subscriberCount()` — the multiplexer's budget probe).
- Phase 0 artifacts you will consume: `tests/budgets.ts` (`COLVIRT` namespace as Phase 3 left
  it, `INTERACTION`), `tests/browser/helpers/metrics.ts` (`installListenerCensus`,
  `installObserverCensus`, `readSubscriberCounts`, `frameSampler`, `bridgeStats`),
  `tests/browser/helpers/wideTable.ts` (`mountTierTable`, `installColumnInvariantProbe`,
  `readColViolations`, `sweepHorizontal`), `demo/perf.ts` + `window.__dtPerf`,
  `WorkerBridge.__getStatsForTests`.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 One window, two consumers

The header row consumes **the same window object the body renders** — Phase 3's computation
(visible span from `bodyScroll.scrollLeft` + viewport width over the prefix-sum width table,
plus overscan, plus pinned). Never compute a second window: header and body must not disagree.
Hoist Phase 3's computation into a shared module if it is body-internal (record the move).

Extend the window's anchor set: a column is **anchored** (always mounted regardless of scroll)
when it is (a) pinned, (b) the cursor column while `focusedCell.row === HEADER_ROW_INDEX`,
(c) the column of a header holding real DOM focus (F2 controls mode), or (d) the active
Shift+F2 layout-gesture column. Anchoring is how focus, `aria-activedescendant`, and the
keyboard gestures survive windowing without restore-on-remount heuristics.

The header branch builds: left spacer (width = prefix sum left of the window) → one
`ColumnHeader` per windowed column → right spacer. Spacers follow Phase 3's exact body
treatment (`role="presentation"`, `aria-hidden="true"`, pointer-events none) so
`aria-required-children` stays green; the `childElementCount > 0` guard (`:1432`) must count
`columnheader` children, not spacers. Replace the O(cols²) lookups with Maps built once per
reconcile: `schemaByName` + a 1-based `orderIndexByName` (copy `rebuildColIndexMap`,
`TableBody.ts:367-378`). `aria-colindex` stays derived from `columnOrder` position (gaps still
signal hidden columns); `aria-colcount` already reports full `schema.length`
(`TableContainer.ts:869`) — correct for a windowed grid, do not change it. Header cell ids
(`buildHeaderCellId`) switch from the loop counter (`:1373`) to the column's **global visible
index**, so an id names the same column position regardless of window state.

### 4.2 Header mount budget (measure first — hour one)

Target: **a full window remount (~45 headers at WIDE) completes within one frame, ~16 ms** —
i.e. ≤ ~0.35 ms per header. Before designing further, measure `new ColumnHeader(...)` + append
cost in isolation at WIDE via the demo harness (`?gen=wide`, `performance.mark` around a
scripted 45-header construct/append/destroy loop). This is the go/no-go for the fallback:

- **Under budget**: plain construction per mount; ship it.
- **Over budget**: template cloning — one inert template header, `cloneNode(true)` per mount,
  patch text/attributes/listeners (the SVG-heavy buttons are identical across columns; only
  name, type, ids, ARIA labels, per-column classes differ). Independently, viz canvas attach
  may defer to scroll-idle (Phase 2 supports deferred attach), keeping mount DOM-only.

Record the measured number and the decision in STATUS.md. Whatever the strategy, **unmount must
detach everything mount attached**: `ColumnHeader.destroy()` (verified complete for its own
listeners/subscriptions/resizer, `ColumnHeader.ts:1029-1067`) plus the three gaps this phase
owns — dismiss `ColumnHeaderTooltipPopover`/`AnnotationPopover` when their anchor is inside the
unmounting header (anchor predicates + `hide()`), detach that element's `ColumnReorder` handler
(add a per-element detach, not a full `refresh()` per unmount), and hand the viz instance back
to Phase 2's `VizDataController` (DOM detach, data retained).

### 4.3 Incremental updates replace wipe-and-rebuild

`render()` splits into three tiers, dispatched by comparing a header-structure signature
(schema identity, `tableName`, `visibleColumns` array, window span, pinned/anchor set):

1. **Window shift** (horizontal scroll): mount/unmount at the edges, update spacer widths.
   Never touches `TableBody`, panels, or scroll restoration. Driven by the same scroll handler
   that re-windows the body (`:693-705` sync stays).
2. **Column-set/order change** (`visibleColumns` write — hide/show/reorder/derived): keyed
   reconcile by column name against the new window: unmount removed, mount added, `insertBefore`
   moved, patch `aria-colindex`/ids/widths on survivors. **`TableBody` survives** — delete the
   destroy/recreate at `:1440-1486` from this path; its own `visibleColumns` subscription
   (`TableBody.ts:402-426`) already re-renders (reorder) or refetches (set change); keep
   `whenBodyReady`/`currentBodyInit` semantics for paths that still create a body. Key the
   restored-column highlight (`:1542-1558`) to visibility transitions, never mounts — scrolling
   into the window must not flash.
3. **Structural change** (schema identity or `tableName` flip — a load): full rebuild, once.
   The load-time double render collapses: the second signal's `render()` sees an unchanged
   signature (the batch wrote both signals before either subscriber ran, `State.ts:195-211`)
   and no-ops. Keep `render()` synchronous — callers assert DOM right after state writes.

Focus/cursor: `reconcileCursorColumn` (`:1601-1609`) keeps firing only on visibility changes,
never for unmounted-but-visible columns. `syncActiveDescendant` (`:882-913`) needs no change —
anchoring keeps the cursor header mounted; its dangling-IDREF guard covers races. The rAF
focus-restore (`:1568+`) applies only to tier-3 rebuilds; tiers 1–2 must not touch focus.

### 4.4 Subscription multiplexer

Mounted headers no longer subscribe individually. `TableContainer` subscribes **once per
signal** — `sortColumns`, `totalRows`, `pinnedColumns`, `filtersByColumn`, `visibleColumns`,
`columnHeaderTooltips`, plus one annotation-store `change` listener — and dispatches to mounted
headers. `ColumnHeader` gains a constructor option (e.g. `subscribe: false`) plus a public
per-signal refresh entry point wrapping the private updaters at `ColumnHeader.ts:578-650`; a
freshly mounted header pulls current values once (the constructor already does, `:611-629`).
Direct `/advanced` construction without the option keeps self-subscribing — no break. Result:
subscriber counts are a small constant instead of O(mounted), and mount/unmount storms produce
zero subscribe churn. `readSubscriberCounts` (Phase 0) asserts it.

### 4.5 Pinned styles and FLIP scoped to mounted headers

`updatePinnedColumnStyles`' header loop (`:1226-1242`), `updateColumnWidths` (`:1185-1194`),
`updateHeaderCursorStyles` (`:1616-1623`), the `pinnedColumns` rect snapshot (`:1026-1041`),
and the FLIP pass (`:1514-1539`) all become O(window) by construction — verify none reaches for
the full column list, and that mount applies current width/pin/cursor state so a header
scrolled into view is born correct. The body half (`:1244-1266`) was adapted by Phase 3 — do
not regress it. Full gesture optimization (per-mousemove costs, Map clones) stays in Phase 6.

### 4.6 `getColumnHeaders()` returns mounted headers — caller audit

`getColumnHeaders()` (`:2004-2006`) and the KeyboardNavigator callback (`:432`) now return only
mounted headers. Adapt every caller:

- `DataTable.ts:789` (`attachVisualizations`): Phase 2 already made viz creation lazy; rewire
  its per-header pass to run from a **mount hook** (`TableContainer` calls back on every header
  mount/unmount) instead of enumerating headers eagerly. Cache hit ⇒ draw without refetch.
- `refreshNonVizStats` (`DataTable.ts:1183-1203`): iterates mounted headers; the same mount
  hook re-renders the stats slot for a newly mounted header so stats lines are never stale.
- `KeyboardNavigator` (`:457,:546-549,:798-803`): correct as-is under anchoring — the cursor,
  focused-controls, and layout columns are always mounted. Cursor writes must reconcile the
  window synchronously so far jumps (Ctrl+ArrowRight) mount the target header the same frame.
- JSDoc + generated API docs updated (§10); the old "all visible columns" contract is gone.

### 4.7 Risk notes / fallbacks

- **Header mount cost over budget even with template cloning**: keep windowing; raise overscan
  asymmetry (larger trailing edge) and mount in two rAF slices (structure first, action panel
  next frame). Record in STATUS.md; do not abandon the phase.
- **Focus/roving-tabindex across unmounts**: anchoring is the primary defense; write the F2 +
  horizontal-scroll keyboard spec **early** (milestone 3, not last). If a hole is found, widen
  the anchor set — never let real DOM focus be destroyed by a window shift.
- **Popover anchored to an unmounting header**: dismiss on unmount (§4.2). Scroll-driven hides
  already work via the capture-phase window listeners.
- **Phase 3 window module not reusable as-is** (body-coupled): extract it; if extraction would
  destabilize the body, duplicate the computation behind one shared unit test asserting both
  produce identical windows, and flag the debt in STATUS.md for Phase 5.
- **`sameColumnSet` refetch on hide/show** (`TableBody.ts:416-426`) makes hide/show cost a
  body refetch: acceptable — Phase 5's projection clipping makes those fetches cheap; assert
  query counts, don't chase render micro-costs.

## 5. Implementation milestones (commit at each)

1. O(1) lookup maps in the header path + header-structure signature plumbing (no behavior
   change; all suites green). — _commit: "Replace header loop lookups with O(1) column maps"_
2. Mount-cost measurement at WIDE; decision in STATUS.md; template-clone construction landed
   **only if** over budget. — _commit: "Measure header mount cost and pick the mount strategy"_
3. Header windowing: shared window consumption, spacers, anchor set, mount/unmount lifecycle
   (popover dismissal, per-element reorder detach), keyboard/F2/deep-jump browser spec. —
   _commit: "Window the header row behind spacers with anchored columns"_
4. Incremental tiers: signature dispatch, keyed reconcile, TableBody survival, single effective
   load render; update the stale 534-query comment (`TableBody.ts:409-414`). — _commit: "Diff
   header updates instead of wiping on column changes"_
5. Subscription multiplexer + `subscribe: false` seam + subscriber-count assertions. —
   _commit: "Multiplex header state subscriptions through the container"_
6. Mount hook wiring: Phase 2 viz attach/detach on mount/unmount, stats-slot refresh,
   `getColumnHeaders` JSDoc + caller adaptations. — _commit: "Attach visualizations on header
   mount and detach on unmount"_
7. Budgets tightened, gated perf specs, baselines re-captured, docs + changeset (§10). —
   _commit: "Tighten column window budgets for windowed headers"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size
npm run docs:api:check
npm run test:browser                   # smoke tier + column oracle + a11y suites
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # WIDE re-capture (append-only)
```

Budget changes in `tests/budgets.ts` (default-run, machine-independent — README Glossary rule):

- `COLVIRT.DOM_NODES_MAX` **tightened to ~12,000 at WIDE** (headers now windowed; set from
  measured + headroom, and record the measured number).
- `COLVIRT.HEADERS_RENDERED_MAX` (new): ≤ visible + overscan + pinned (~45 at WIDE default
  widths) — asserted via `[role="columnheader"]` count during and after horizontal sweeps.
- `COLVIRT.RESIZE_OBSERVERS_MAX` ≈ 50 and `COLVIRT.MUTATION_OBSERVERS_MAX` ≈ 5 (Phase 2's
  shared theme observer) — live gauges via Phase 0 `installObserverCensus`.
- `COLVIRT.SORT_SIGNAL_SUBSCRIBERS_MAX` (new): small constant via `readSubscriberCounts` —
  proves the multiplexer (pre-phase: one per mounted header).
- `INTERACTION.QUERIES_PER_HIDE_SHOW_MAX` ≤ 2 via `__getStatsForTests` deltas: hide/show no
  longer triggers full-viz-recreate. If Phase 2's cache semantics legitimately need more,
  record the actual, budget it, and note in STATUS.md that Phase 6 owns tightening.

Phase-specific asserts (in the suites): column oracle 0 violations through `sweepHorizontal`
**including the header `data-column` sequence** = expected window slice; listener census
net-zero across a mount/unmount storm (sweep 0→max→0 ×3, `installListenerCensus`);
`aria-colindex` ascending with gaps, `aria-colcount` = schema length; axe green (spacers break
no `aria-required-children`; roving tabindex unchanged); load performs one effective header
build (probe on the rebuild path); popovers report hidden after their column is hidden.
Wall-clock (only under `RUN_BROWSER_PERF=1`): horizontal scroll-storm frame p95 at WIDE via
`frameSampler`; full-window remount ≤ ~16 ms (§4.2). Under `RUN_BASELINE=1`: re-capture WIDE
(viz on + off); report regenerated.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`{{TIER}} = wide`, `viz=on`, `{{READY_BUDGET_MINUTES}}` from the post-Phase-2 WIDE baseline,
`{{DOM_BUDGET}} = COLVIRT.DOM_NODES_MAX`, query budgets from `tests/budgets.ts`,
`{{SORT_COL}} = col_1`. Phase-specific emphasis per step:

- Step 3: snapshot must show `domNodes` under the tightened budget with 1,000 columns loaded.
- Step 5 (the heart of this phase): sweep 0 → 25% → 50% → 75% → max. Headers **and their
  histograms** stream in with no blank header bands persisting > ~1 s; header `data-column`
  sequence equals the expected window slice at every stop; sampled cell matches the oracle.
- Step 6–7: sort from a **freshly mounted** header (sweep far right, then click its sort
  button); brush a histogram on a mid-session-mounted header; both behave like load-time ones.
- Step 8: pin the first data column, sweep — pinned header stays leftmost (anchored). Hide and
  reorder from header buttons; undo/redo both; headers reconcile without a full-table flash
  and the body never blanks (a placeholder flash is the destroyed-TableBody tell).
- Extra (after step 8): keyboard pass — click a deep cell, Ctrl/Cmd+ArrowRight to the last
  column, F2 into header controls there, arrow across buttons, Escape out; focus never falls
  to `document.body`. Show a header tooltip, scroll its column out — popover dismisses.
- Step 10: theme flip is now cheap (~45 canvases, not 1,000) — expect sub-second, no stall.
- Steps 11–12: zero new console errors; attach the final `window.__dtPerf.refresh()` snapshot
  and screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; `npm run size` budgets untouched.
- [ ] `COLVIRT.DOM_NODES_MAX` tightened to ~12,000 at WIDE; `HEADERS_RENDERED_MAX`, observer
      and subscriber budgets landed with measured values recorded.
- [ ] Column oracle (incl. header sequence) green through horizontal sweeps; listener census
      net-zero across mount/unmount storms.
- [ ] Hide/show/reorder run without TableBody destroy/recreate and within the query budget;
      load performs one effective header build.
- [ ] Mount-cost measurement + strategy decision recorded in STATUS.md (§4.2).
- [ ] Keyboard spec proves F2 controls mode + cursor survive windowing at deep horizontal
      positions; axe suite green.
- [ ] Popovers dismiss when their header unmounts (test + manual step).
- [ ] WIDE baselines re-captured (append-only), report regenerated, before/after in STATUS.md.
- [ ] Chrome template executed end-to-end; evidence attached to STATUS.md.
- [ ] Changeset + docs obligations (§10) done; STATUS.md row + handoff filled.

## 9. Out of scope

Resize/pin gesture optimization, keynav polish, and the searchable column picker (Phase 6);
row-fetch column projection and cache reshaping (Phase 5); visualization data machinery/caching
(done in Phase 2); body window algorithm changes beyond reuse/extraction (Phase 3 owns it);
OffscreenCanvas (README §9, deferred); any opt-out flag for header windowing (README §2.1 —
new default, migration note instead).

## 10. Docs / changeset obligations

- **Changeset (minor)** — `Changed`: `getColumnHeaders()` returns only mounted (windowed)
  headers; off-screen column headers are no longer in the DOM; header updates are incremental
  (no full rebuild on hide/show/reorder). Migration note: consumers that scraped header DOM or
  relied on `getColumnHeaders()` covering every visible column should read
  `state.visibleColumns` / schema signals instead.
- `getColumnHeaders()` JSDoc rewritten to state the mounted-headers contract (`TableContainer`
  is `/advanced` public API — `src/advanced.ts:32`); regenerate typedoc output
  (`docs/api/advanced/classes/TableContainer.md:139`). `docs/api-reference.md` does not itemize
  `getColumnHeaders` today (verified — only the `TableContainer` row at `:247`); touch it only
  if wording there implies eager headers.
- `docs/concepts/architecture.md`: add a paragraph on column windowing covering both axes now
  that headers match the body (window + spacers + anchored columns).
- API-surface snapshot: update via `npx vitest -u` only if the diff is exactly the intended
  JSDoc/option additions (e.g. the `subscribe` option); anything else is a leak.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the measured header mount cost and §4.2
strategy verdict (plain vs template-clone; viz attach timing); final budget values (tightened
`COLVIRT.*`, new `INTERACTION.QUERIES_PER_HIDE_SHOW_MAX`); WIDE baseline before/after
(domNodes, observer/subscriber counts, load ms, scroll-storm p95); exact names/locations of
the shared window module and mount/unmount hook (Phase 5 projects fetches from the same
window; Phase 6 builds gestures on the hook); §4.6 caller adaptations beyond those listed; and
line-drift warnings for `TableContainer.ts` (Phases 5 and 6 both cite its render path).
