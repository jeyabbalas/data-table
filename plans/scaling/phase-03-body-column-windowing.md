# Phase 3 — Body column windowing

Size: **L** · Depends on: **Phase 0** (executed after Phase 2 so re-captured baselines reflect the
new load semantics; technically independent of P1/P2) · Blocks: **Phases
[4](./phase-04-header-column-windowing.md), [5](./phase-05-projection-clipping.md),
[6](./phase-06-interaction-sweep.md)**

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first — Phases 0–2
handoffs may have moved the anchors below. This phase makes `TableBody` render only the
**horizontally visible column window** (visible + overscan + pinned columns), with flexbox spacer
elements preserving scroll geometry. At WIDE (1,000 cols, 1280×800) this cuts the body from ~30–35K
rendered cells to ~1.4K (~45 cells × ~32 rows). **Headers stay fully rendered this phase** —
alignment holds because each spacer's width equals the summed occupied widths of the columns it
replaces. [Phase 4](./phase-04-header-column-windowing.md) windows the headers.

Windowing is **unconditional** — no public toggle or option (README §2.1 new-defaults decision; row
virtualization is the precedent and has never had an off switch). Visually identical; repo
releasable at phase end. Relevant README sections: §5.D (DOM-cost findings), §5.H (flexbox rows and
`.dt-width-spacer` substrate, `colIndexMap`), §6 (tiers), Glossary (column window/oracle, budgets).

## 2. Problem statement

- Every visible row renders a cell for **every** visible column: `renderVisibleRows` sizes rows to
  `visibleColumns.length` (`src/table/TableBody.ts:1149,1175`) and `updateRowContent` loops them
  all, ~14 DOM writes per cell (`:1469-1528`). ~73K DOM elements at WIDE (~38/header × 1,000 + ~30K
  body cells).
- Horizontal scrolling triggers **zero** TableBody work — no `scrollLeft` subscriber exists.
  `.dt-body-scroll` owns both axes (`src/table/TableContainer.ts:605-609`); `setupScrollSync` only
  mirrors `scrollLeft` into the header strip (`:687-706`); `VirtualScroller`'s rAF handler
  recomputes only the row range from `scrollTop` (`src/table/VirtualScroller.ts:252-294, 347-390`).
  Off-screen columns are simply always in the DOM.
- Per-render waste on top of the count: `getComputedStyle` per **row** (`TableBody.ts:1453-1455`);
  pinned-offset Map rebuilt per **row** (`:1457-1467`); focus-ring toggle loops every cell of every
  row (`:1218-1222`); annotation classification per cell even with an empty store (`:1595-1661`);
  pooling clones whole rows via `cloneNode(true)` (`:1378`), cap 100 (`:1401-1403`) — up to 100K
  detached cells. Interaction paths touch every cell: `updateCellWidths` (`:2012-2042`) and
  `TableContainer.updatePinnedColumnStyles`'s body loop (`TableContainer.ts:1244-1266`).
- Several sites couple **child index ↔ `visibleColumns` index** and break the moment spacers or a
  windowed subset shift children: focus ring (`TableBody.ts:1218-1222`), row shape check (`:1170`),
  cell ids (`:1480-1482` via `buildCellId :1347`), click-to-focus resolver (`:1762-1771`),
  `updateFocusStyles` (`:1988,:1999`), `updateCellWidths` (`:2019`), and the pinned body loop
  (`TableContainer.ts:1249-1250`). `syncActiveDescendant` builds the same cell id from
  `visibleColumns.indexOf` (`TableContainer.ts:894-896,950-952`).

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `src/table/TableBody.ts` — the render pipeline: `renderVisibleRows` (`:1112-1252`),
  `updateRowContent` (`:1409-1529`), `getOrCreateRow` (`:1280-1324` — already adjusts cell count on
  reuse), `buildCellId` (`:1347-1349`), `returnRowToPool` (`:1364-1404`), `createPlaceholderRow`
  (`:1713-1736` — one labeled cell, `aria-busy`, no listeners), `attachRowEventListeners`
  (`:1741-1775`), `updateFocusStyles` (`:1979-2007`), `updateCellWidths` (`:2012-2042`),
  `rebuildColIndexMap` (`:367-378`), state subscriptions (`:383-541` — which signals re-render vs
  re-fetch), `handleScroll` (`:647-660`).
- **Fetch path — confirm you are NOT touching it.** `buildRowQuery` projects all visible columns
  (`TableBody.ts:972-1001`); `rowDataCache` stores full-width rows. Both stay unchanged — the window
  controls DOM only. Projection is [Phase 5](./phase-05-projection-clipping.md).
- `src/table/TableContainer.ts` — `setupScrollSync` (`:687-706`), `syncActiveDescendant` +
  `resolveInGrid` + `buildCellId` (`:882-952`), `updateGridCounts` (`:862-870` — `aria-colcount` is
  already the full `schema.length`), `updatePinnedColumnStyles` (`:1202-1280`), TableBody wiring
  (`:1448-1476` — `scrollContainer: this.bodyScroll`,
  `onRowsRendered: () => this.syncActiveDescendant()`), header-only FLIP pin animation
  (`:1509-1540`, untouched).
- `src/table/VirtualScroller.ts` — `handleScroll` rAF throttle (`:252-294`, the pattern your
  horizontal hook mirrors), `createWidthSpacer` (`:239-246`), `setContentWidth` (`:474-480`),
  `getScrollContainer()`.
- `src/table/KeyboardNavigator.ts` — `setFocusAbsolute` (`:874-888`), `scrollFocusedCellIntoView`
  (`:895-947`; the horizontal pass `:916-946` already computes the target column's pixel span and
  writes `bodyScroll.scrollLeft`).
- `src/core/Actions.ts:1078-1112` — `toggleColumnPin` moves pinned columns to the **front**: the
  pinned group is the leftmost prefix of `visibleColumns`; §4.1 relies on this.
- CSS substrate: `src/styles/05-data-grid.css:174-182` (`.dt-row` is `display: flex`), `:207-217`
  (`.dt-cell`: `flex-shrink: 0`, inline `width`, 1px right border, 0.75rem side padding). **The
  library ships no global `box-sizing` reset** (the demo sets `border-box` in `demo/demo.css:15`;
  host pages may not) — see §4.2.
- Phase 0 artifacts you consume (exact names): `tests/budgets.ts` (`COLVIRT` placeholder namespace);
  `tests/fixtures/tiers.ts` (`cellOracle`, `ORACLE_FN_SOURCE`); `tests/browser/helpers/wideTable.ts`
  (`mountTierTable`, `installColumnInvariantProbe`, `readColViolations`, `readVisibleGrid`,
  `sweepHorizontal`); `tests/browser/helpers/metrics.ts` (`domNodeCount`, `frameSampler`,
  `bridgeStats`); the demo `?gen=` harness (`demo/perf.ts`, `#dt-perf-panel`, `window.__dtPerf`);
  `tiers.smoke.spec.ts` / `tiers.full.spec.ts`; `tests/helpers/tableBodyHarness.ts` (stubs
  `clientHeight`; you add `clientWidth` + a horizontal-scroll helper).
- Suites that encode "all columns rendered" and need expectation updates, not product workarounds:
  `tests/table/TableBody*.test.ts` (`rowEl.children` counts — recount as `.dt-cell`, excluding
  spacers), `tests/browser/focus-lifetime.spec.ts` / `scroll-extent.spec.ts` / `row-height.spec.ts`;
  `tests/a11y/axe.test.ts` (`aria-required-children` **enabled** — spacers must be ARIA-transparent,
  §4.2).

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Column window computation — `src/table/ColumnWindow.ts` (new)

Pure, dependency-free, unit-testable:

```ts
interface ColumnWindow {
  start: number; // first windowed index into visibleColumns (>= pinnedCount)
  end: number; // exclusive
  leftSpacerPx: number; // Σ occupied widths of [pinnedCount, start)
  rightSpacerPx: number; // Σ occupied widths of [end, N)
  totalWidthPx: number; // Σ occupied widths of [0, N) — scroll geometry
}
```

- **Prefix sums** over per-column _occupied_ width (`columnWidths.get(name) ?? 150` + the §4.2 box
  overhead), cached as a `Float64Array`, invalidated when `visibleColumns` (identity),
  `columnWidths` (identity), or the overhead changes. Binary-search `scrollLeft` and
  `scrollLeft + viewportWidth` for the visible index range.
- **Overscan** (internal constants, not options): extend the visible pixel range by one
  `viewportWidth` per side, then widen to ≥ `MIN_OVERSCAN_COLUMNS = 10` columns per side; clamp to
  `[pinnedCount, N]`. Tune against the §6 baseline and record the final values.
- **Pinned prefix**: pinned columns occupy `visibleColumns[0 .. P-1]` (`Actions.ts:1078-1112`),
  always force-rendered outside the window. Fallback if the prefix invariant is ever violated (e.g.
  a hand-edited restored session): `P = lastPinnedIndex + 1` — force-render through the last pinned
  column (correct, merely less economical); note it in STATUS.md.

### 4.2 Row structure and spacers

Every **data** row renders
`[P pinned cells] [left spacer] [window cells start..end-1] [right spacer]` — both spacers always
present (0-width at the edges) so child geometry is stable:
`childIndex(absIdx) = absIdx < P ? absIdx : absIdx - start + P + 1`. Placeholder rows are unchanged
(one labeled cell, `aria-busy`, no spacers).

- Spacer element: `div.${classPrefix}-col-spacer`, `role="presentation"` + `aria-hidden="true"` (the
  a11y suite runs `aria-required-children` on rows — a bare div child of `role="row"` fails it),
  `data-col-spacer="left"|"right"` for tests, inline `flex: 0 0 <px>` width. CSS in
  `src/styles/05-data-grid.css` (`pointer-events: none`; no new variables — `check:css-vars`
  unaffected).
- **Occupied width ≠ configured width**: without a host `border-box` reset, `.dt-cell`'s 24px
  padding + 1px border sit outside the inline `width`; a spacer replacing M cells has one box, not
  M, so it must cover `Σ (width_i + overhead)`. Hoist **one** `getComputedStyle` per render pass
  (replacing the per-row read at `TableBody.ts:1453-1455`) yielding both the pinned baseZ
  (`--dt-z-pinned-col`) and the overhead (`0` when `boxSizing === 'border-box'`, else
  `paddingLeft + paddingRight + borderRightWidth`). Feed the same overhead into §4.1's prefix sums,
  the totalWidth sum (`:1230-1240`), and `updateCellWidths` (`:2027-2031`) so body, header
  `minWidth`, and `setContentWidth` stay consistent under either box model.

### 4.3 Horizontal scroll hook + `refreshColumnWindow()`

- New in `TableBody`: a passive `scroll` listener on `virtualScroller.getScrollContainer()` (===
  `.dt-body-scroll`, wired at `TableContainer.ts:1452`), rAF-throttled exactly like
  `VirtualScroller.handleScroll` (`VirtualScroller.ts:258-270`). Per frame: skip if `scrollLeft`
  unchanged (vertical flows through the scroller's own subscriber); recompute the window;
  `renderVisibleRows()` only when `(start, end)` changed. Detach in `destroy()`.
  `viewportWidth`/`scrollLeft` are read fresh each recompute, so resizes need no subscription.
- Public `refreshColumnWindow(): void` on `TableBody`: synchronously recompute + re-render if the
  window moved, bypassing the throttle. Consumers: KeyboardNavigator (§4.5), tests. TableBody is an
  `/advanced` export — JSDoc with `@example`, API-surface snapshot and `docs/api-reference.md`
  regeneration required (repo convention).

### 4.4 `updateRowContent` rewrite + de-coupling child indices

Rewrite the per-cell loop (`TableBody.ts:1469-1528`) to iterate only `[0, P) ∪ [start, end)`, and
fix every coupling listed in §2:

- **Cell ids keyed on the absolute visible index**: `buildCellId(rowIndex, absColIdx)` where
  `absColIdx` is the position in the full `visibleColumns` array — NOT the loop/child index.
  `syncActiveDescendant` already computes `visibleColumns.indexOf(column)`
  (`TableContainer.ts:894-896`), so `aria-activedescendant` resolution (`resolveInGrid`, `:924-933`)
  needs **no container-side change**.
- `aria-colindex` untouched: `colIndexMap` numbers from `columnOrder` (`TableBody.ts:367-378`);
  absolute indices with gaps for absent columns are what the ARIA grid pattern prescribes;
  `aria-colcount` is already the full schema count (`TableContainer.ts:869`).
- Maintain `visibleIndexMap: Map<string, number>` (name → `visibleColumns` index) alongside
  `lastVisibleColumns`; replace every body-side `visibleColumns.indexOf` (`:1219`, `:1988`,
  `:1999`).
- Per-render hoists: the §4.2 computed-style read; the pinned-offset Map (`:1457-1467`) built **once
  per render pass** and passed down.
- Focus ring: replace the every-cell loop (`:1218-1222`) with targeted toggles — clear the
  previously ringed cell, set the focused one, via `rowElementMap` + `visibleIndexMap` +
  `childIndex()`; tolerate an unmounted cell (no-op). Click-to-focus resolves via
  `cellEl.dataset.column` (written at `:1493`), not `Array.from(rowEl.children).indexOf`
  (`:1762-1771`).
- Row shape check (`:1170`): compare against the expected structure (`P + (end − start) + 2`
  children) or a `data-window="start:end"` stamp; rebuild on mismatch via the pool path.
- Annotation early return: skip per-row/per-cell annotation bookkeeping when
  `this.annotations.count() === 0` — the strip loop at `:1601-1615` runs ~14 `classList.remove` per
  cell for zero annotations today. Run one full strip pass when the store transitions to empty
  (drive from the `change` subscription, `:534-540`).

### 4.5 Keynav minimum integration

`scrollFocusedCellIntoView` (`KeyboardNavigator.ts:895-947`) already writes `bodyScroll.scrollLeft`
(`:942-946`) — but the scroll event lands a task later and the recompute a rAF after that, so focus
could resolve against a not-yet-mounted column. After each horizontal `scrollLeft` write, call
`this.getTableBody()?.refreshColumnWindow()` — the target column mounts synchronously, and
`onRowsRendered → syncActiveDescendant` (`TableContainer.ts:1460`) re-points `aria-activedescendant`
at the live cell. Pinned columns are skipped there (`:917-918`) and always mounted anyway. Fallback
if a residual race shows in the spike: force-include `focusedCell.column` as a contiguous window
extension (`start = min(start, focusIdx)`, `end = max(end, focusIdx + 1)`), self-healing on the next
scroll; record whichever ships. Full keynav sweep: [Phase 6](./phase-06-interaction-sweep.md).

### 4.6 Pool rework — no more `cloneNode(true)`

`returnRowToPool` clones entire rows to shed listeners (`TableBody.ts:1364-1404`). Replace with
explicit recycling: attach the three row listeners (`:1741-1775`) through a per-row
`AbortController` (`{ signal }`-bound); on pool return, `abort()` — the same element is pooled,
keeping the existing id/class/ARIA scrubbing (`:1380-1398`). Pool entries are **window-sized**;
`getOrCreateRow` already adjusts cell count on reuse (`:1284-1299`) — extend it to the spacer-aware
structure and current window size. Keep the 100-row cap: ≤ ~4.5K detached cells at ~45 cells/row (vs
100K today).

### 4.7 Window-scoping the remaining whole-row walkers

- `updateCellWidths` (`:2012-2042`): iterate rendered cells via `dataset.column`, update both spacer
  widths from recomputed prefix sums, re-derive totalWidth/contentWidth/header `minWidth` with the
  §4.2 overhead. A width change moves window boundaries — recompute the window in the same pass.
- `TableContainer.updatePinnedColumnStyles` body loop (`TableContainer.ts:1244-1266`): key by
  `dataset.column` (skip spacers) instead of pairing `cells[i]` with `visibleColumns[i]` —
  window-scoped for free since only windowed cells exist.
- `reapplyAnnotationsToVisibleRows` (`TableBody.ts:1678-1708`) already walks rendered cells by
  `data-column` — verify, don't rewrite.
- Geometry invariant: `setContentWidth(totalWidthPx)` and `headerRow.style.minWidth` (`:1240-1249`)
  still cover **all** visible columns — `scrollWidth`, scrollbar range, and header alignment are
  unchanged by construction.

### 4.8 Risk notes / fallbacks

- **Riskiest assumption — pixel-exact alignment** of the spacer-based body vs the fully rendered
  header, across pinned columns, width changes, and both box models. **Hour-one spike, before wiring
  any state**: hardcode a static window (e.g. columns 10–30) in `renderVisibleRows`, mount
  `?gen=custom&rows=1000&cols=50&viz=off`, Playwright-screenshot-diff the grid region against a
  pre-change capture at `scrollLeft = 0` and one mid-scroll position. Zero visible diff gates
  proceeding; a horizontal shift means §4.2's overhead handling is wrong — fix that first. If
  sub-pixel drift accumulates at 1K columns (fractional resize widths), round occupied widths at the
  prefix-sum layer and re-diff. Record outcome + screenshots in STATUS.md.
- **A11y**: absolute `aria-colindex` with absent mid-row columns is exactly what the ARIA grid
  pattern sanctions. Add a windowed-body scenario to `tests/a11y/axe.test.ts` (spacer roles per
  §4.2).
- **Interactions this phase**: ColumnResizer/ColumnReorder target header elements — untouched and
  correct; body-side effects flow through §4.7. Pin/unpin still destroys and recreates headers +
  body (`TableContainer.ts:1440-1486`) — slow at 1K columns but correct; Phase 6 optimizes.
- **jsdom**: extend `tests/helpers/tableBodyHarness.ts` with a stubbed `clientWidth` and a
  `scrollToColumnPx(px)` helper (set `scrollLeft`, dispatch `scroll`, run the rAF). jsdom computes
  no layout — window math stays purely arithmetic (§4.1; the overhead reads 0 there).

## 5. Implementation milestones (commit at each)

1. Alignment spike per §4.8 — throwaway, **no commit**; findings + screenshots to STATUS.md before
   proceeding.
2. `src/table/ColumnWindow.ts` + unit tests (prefix-sum caching/invalidation, binary-search edges,
   overscan clamping, pinned prefix + violated-prefix fallback, box overhead, zero/one column,
   `scrollLeft` past content). — _commit: "Add column window computation with cached prefix sums"_
3. Structural rewrite at **full window** (spacers present at 0 width; ids rekeyed absolute;
   `data-column` click resolution; `visibleIndexMap`; per-render hoists; focus-ring scoping;
   annotation early return; shape check) — behavior-identical, all existing suites green. — _commit:
   "Restructure body rows around an absolute column window"_
4. Activate windowing: `ColumnWindow` wired to `scrollLeft`, rAF hook, `refreshColumnWindow()`,
   keynav integration, window-scoped `updateCellWidths` + `updatePinnedColumnStyles`; jsdom harness
   tests (rendered `data-column` sequence, spacer widths, pinned exclusion, id keying, focus across
   the boundary). — _commit: "Render only the visible column window in body rows"_
5. Pool rework per §4.6 + tests (listener detachment on abort, reuse resizes to current window, cap
   semantics). — _commit: "Recycle pooled rows per cell instead of cloning"_
6. `COLVIRT` budgets + browser assertions: body-window column oracle through `sweepHorizontal`
   (incl. jump-to-end), header/body x-alignment probe, cells-per-row + DOM budgets, axe scenario. —
   _commit: "Add column window budgets, oracle and axe coverage"_
7. Gated perf runs + re-captured WIDE/GRID baselines + changeset + docs (§10). — _commit: "Record
   baselines and document body column windowing"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage                  # ColumnWindow, windowed-body harness, axe, pool suites
npm run build && npm run size
npm run docs:api:check                 # refreshColumnWindow lands in the API reference
npm run test:browser                   # tiers.smoke + existing suites, updated expectations
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # WIDE + GRID re-captured, committed
```

Budgets (`COLVIRT` namespace in `tests/budgets.ts`; default-run budgets are machine-independent
counts only — wall-clock stays behind `RUN_*` gates). Pin the spec viewport explicitly
(`test.use({ viewport: { width: 1280, height: 800 } })` — the Playwright project default is Desktop
Chrome's 1280×720 and DOM budgets are viewport-dependent):

- `COLVIRT.CELLS_PER_ROW_MAX = 45` — max `.dt-cell` count over sampled data rows (window + overscan
  - pinned ≈ ~30 at 1280×800/150px, plus headroom). Viewport-derived, so it holds at **every**
    tier — assert in the default smoke run and the gated WIDE/GRID runs.
- `COLVIRT.DOM_NODES_MAX_WIDE` — measured at WIDE, 1280×800, viz=off, +~10% headroom; asserted in
  the gated WIDE run. Expected ≈ 45,000 (headers still fully rendered at ~38 nodes × 1,000 dominate;
  body drops ~30K → ~1.5K; today's baseline ~73K). Record the measured number;
  [Phase 4](./phase-04-header-column-windowing.md) tightens toward the ≤ ~12,000 end-state. Also
  tighten Phase 0's `WIDE_CI.DOM_NODES_MAX` (300 cols, expected ≈ 15K vs ~120K pre-optimization) for
  the default CI smoke.
- `COLVIRT.ORACLE_VIOLATIONS = 0`; `COLVIRT.ALIGNMENT_EPSILON_PX = 1`.

Phase-specific asserts (inside the suites):

- **Column oracle, body-window semantics** (extend `installColumnInvariantProbe` — Phase 0 built it
  to become load-bearing here): at every `sweepHorizontal` stop, including a jump to max
  `scrollWidth` — (a) rendered body `data-column` sequence per settled row is
  `pinned prefix + a contiguous slice of visibleColumns`; (b) every column whose pixel span
  intersects the viewport is present; (c) spacer widths equal the prefix-sum complement within
  `ALIGNMENT_EPSILON_PX`; (d) sampled cell text matches `cellOracle(row, col, seed)`; (e) header
  `data-column` sequence is still the **full** list (headers unwindowed this phase). Violations = 0.
- **Alignment probe**: via `readVisibleGrid` rects, `|header.x − cell.x| ≤ ALIGNMENT_EPSILON_PX` for
  every rendered body column at each sweep stop — including pinned columns and after a width change.
- **Row oracle still 0** through the Phase-0 vertical scroll storm and a combined vertical +
  horizontal storm (axes alternating).
- **jsdom window math** (`tableBodyHarness`): window contents after synthetic horizontal scrolls;
  ids keyed absolute (`dt-…-cell-<row>-<absIdx>`); pinned column rendered while scrolled far right;
  focus ring survives a window move; pool reuse adjusts structure; `refreshColumnWindow()`
  synchronous contract.
- Axe suite green incl. the windowed-body scenario; API-surface snapshot diff contains only
  `refreshColumnWindow` (+ any `@internal` `__…ForTests` seams); `npm run size` increase justified
  only by `ColumnWindow` (~1–2 KB).

RUN-gated (record, don't hard-assert): `frameSampler` p95 frame delta during horizontal-sweep and
combined-axis storms at WIDE improves vs the Phase 0/2 baseline; re-run `npm run perf:baseline` for
WIDE (viz on + off) and GRID, commit the new JSONs (append-only, README §8.6), regenerate the
report.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`{{TIER}} = wide`, first `viz=off`, then an abbreviated `viz=on` pass (steps 1–5, 7, 11).
`{{READY_BUDGET_MINUTES}}`: from the latest WIDE baseline. `{{DOM_BUDGET}}` =
`COLVIRT.DOM_NODES_MAX_WIDE`. Phase-specific deltas:

- Step 3: also assert `domNodes` ≈ ~40% of the Phase 0 WIDE capture (headers still dominate).
- Step 5 (the heart of this phase): at each `scrollLeft` stop (0 → 25% → 50% → 75% → max), assert
  one settled row's body `data-column` sequence equals `pinned prefix + contiguous slice` covering
  the viewport-intersecting columns (compute expected from `window.__dtPerf.table.state` widths);
  headers remain the full list. No blank column bands persisting > ~1s; no header/body misalignment
  (screenshot each stop).
- Step 5b (new): combined-axis — set `scrollTop` to 50%, sweep `scrollLeft`, vertical-jump again;
  rows fill, the window tracks, both oracle spot checks pass.
- Step 5c (new): keyboard walk — click a cell near the window's right edge, hold `ArrowRight` across
  the boundary for ~30 columns. The cursor never disappears: each step scrolls the column in, the
  ring sits on the correct cell, the grid's `aria-activedescendant` resolves. No console errors.
- Step 8: resize a windowed column ±100px (body + spacers stay aligned with headers), pin the first
  data column then sweep (pinned cell stays put, painted over the window), hide/show a column,
  undo/redo — all correct; jank allowed (Phase 6). Re-assert the step-5 invariant after each
  operation.
- Steps 10–12 as templated: theme flip, zero new console errors for the session, cleanup. Attach the
  final `window.__dtPerf.refresh()` snapshot + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; API snapshot moves only by the documented additions.
- [ ] Alignment spike executed **first**; evidence in STATUS.md.
- [ ] Both oracles: 0 violations through sweeps, jump-to-end, and combined-axis storms — WIDE_CI in
      CI, WIDE/GRID gated.
- [ ] `COLVIRT` budgets committed with measured values; `WIDE_CI.DOM_NODES_MAX` tightened.
- [ ] Body visually identical at every sweep stop (screenshots); headers fully rendered;
      pinned/focus/annotation behavior intact.
- [ ] `rowDataCache` + `buildRowQuery` untouched (diff inspection — fetches still full-width).
- [ ] WIDE + GRID baselines re-captured and committed; report regenerated; DEEP spot-checked (20
      columns sit inside one window — no regression).
- [ ] Chrome template executed (both viz modes); changeset + docs landed per §10; STATUS.md row +
      handoff filled.

## 9. Out of scope

Header/viz windowing and incremental header updates
([Phase 4](./phase-04-header-column-windowing.md)); fetch projection + cache keying — rows stay
full-width ([Phase 5](./phase-05-projection-clipping.md)); resize/pin/reorder gesture optimization
and the full keynav sweep ([Phase 6](./phase-06-interaction-sweep.md)); any public option, toggle,
or event for windowing (unconditional, README §2.1); Arrow IPC or any worker-boundary change;
`VirtualScroller`'s vertical model.

## 10. Docs / changeset obligations

- **Changeset: MINOR.** `Changed`: body cells for horizontally off-screen columns are no longer in
  the DOM — code querying `.dt-cell` (scrapers, extensions, tests) sees only the rendered window
  plus pinned columns; select by `[data-column="…"]` after scrolling the column into view.
  `aria-colcount`/`aria-colindex` remain absolute; scroll geometry is unchanged. No new options.
- `docs/concepts/architecture.md`: add a "Column windowing" subsection under the virtual scroller
  section (window computation, spacers, pinned prefix, overscan; headers windowed next phase).
- `docs/api-reference.md` regenerated for `TableBody.refreshColumnWindow()` (JSDoc with `@example`);
  API-surface snapshot updated deliberately.
- `docs/performance.md`: one paragraph — rendered cells are O(viewport), not O(columns); pointer to
  the `COLVIRT` budgets.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: spike outcome (aligned, or what §4.2 fix was
needed); final overscan constants and why; measured cells/row + DOM nodes at WIDE and WIDE_CI
(before → after) and the exact budget values shipped; sweep-storm frame p95 before → after (gated
run); whether the pinned-prefix invariant held (or the fallback engaged); pool design as landed; any
child-index couplings found beyond §2's list; and precise line-number drift for
[Phase 4](./phase-04-header-column-windowing.md) (header render loop, `updatePinnedColumnStyles`
header half) and [Phase 5](./phase-05-projection-clipping.md) (`buildRowQuery`, `rowDataCache`,
`ensureFetched`), which consume this phase's window as their source of truth.
