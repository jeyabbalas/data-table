# Phase 1 — VirtualScroller scroll-space compression

> Part of [implementation-plan/README.md](./README.md) — read that first for the
> bug report, root causes, working agreements, and branch rules. You are on
> branch `fix-virtual-scroll-large-datasets`.

## Goal

Fix bug 1 (unreachable bottom rows past the browser's max-element-height clamp):

- The scrollbar reaches the **true last row** for arbitrarily large datasets
  (design target 50M+ rows at any `rowHeight`).
- Datasets below the cap behave **bit-for-bit identically** to today (no
  regression risk for the common case).
- `scrollToRow(index)` lands exactly on any index; wheel/keyboard scrolling
  keeps its current feel at any dataset size.
- Real-browser proof via a fast Playwright spec.

## Prerequisites

None (first phase). Working tree = branch point of `main` plus this
`implementation-plan/` directory.

## Targeted code review (do this before editing)

1. `src/table/VirtualScroller.ts` — whole file (498 lines). Understand:
   construction modes (external scroll container vs legacy, `:101-149`); the
   rAF-throttled scroll handler (`:208-220`); `updateVisibleRange` notify-only-on-
   range-change (`:225-234`); `calculateVisibleRange` math (`:239-268`);
   `updateViewportPosition` transform (`:273-275`); `setTotalRows` (`:295-312`);
   `scrollToRow` and its `offsetHeight` clamp (`:350-379`); public getters.
2. `src/table/TableBody.ts:160-200` — how the scroller is composed
   (`externalScrollContainer: options.scrollContainer`, which
   `TableContainer.ts:1431` sets to `.dt-body-scroll`); and `:519-580`
   (`handleScroll`/`fetchAndRender`) — you make one transitional edit there.
3. `src/table/KeyboardNavigator.ts:895-915` — `scrollFocusedCellIntoView` does
   `vs.getScrollTop()` and compares against `row * rowHeight`: virtual-space
   math reading a physical value. You fix this.
4. `src/styles/05-data-grid.css` — `.dt-virtual-viewport` (absolute, `top: 0`)
   and `.dt-virtual-content` rules + comments.
5. `tests/table/VirtualScroller.test.ts` — the geometry-stubbing idiom
   (`Object.defineProperty(scroller.getScrollContainer(), 'clientHeight', …)`,
   e.g. `:67-79`), the viewport-positioning assertions (`:602-623`), and the
   1M-row case (`:743-762`) that pins the unclamped spacer height.
6. `tests/performance/scroll-handler.bench.test.ts` — the 1M-row budget your
   change must not regress (median ≤1 ms, p99 ≤16.6 ms per scroll dispatch).
7. `tests/browser/row-height.spec.ts:31-66` — the Playwright pattern for
   importing library source into a page (`import('/data-table/src/index.ts')`
   inside `page.evaluate`); you'll do the same with `/data-table/src/advanced.ts`.
8. `tests/api-surface.jsdoc.test.ts` (or equivalently named) — exported symbols
   need JSDoc; your new public method must carry it.

## Design specification

### Constants and options

- Module-level `const DEFAULT_MAX_VIRTUAL_HEIGHT = 15_000_000;` in
  `VirtualScroller.ts` with a JSDoc block explaining: Blink/WebKit saturate
  element heights at ≈33,554,431 px, Gecko at ≈17,895,697 px; 15M gives a 16%
  margin under the tightest engine and stays below 2²⁴ (the float32
  1-px-quantization band), and datasets up to `15,000,000 / rowHeight` rows
  (468,750 at the default 32 px) keep today's exact behavior.
- `VirtualScrollerOptions` gains
  `maxVirtualHeight?: number | undefined` — JSDoc: caps the physical spacer
  height; raising it past ~17.8M px breaks Firefox; primarily a test hook
  (tests inject small values to exercise compression at human scale). Do **not**
  re-export the constant through `src/advanced.ts` (no new export keys).

### New per-instance state

```ts
private virtualHeight = 0;          // V = totalRows * rowHeight (float64 — exact for any plausible N)
private physicalHeight = 0;         // P_req = min(V, maxVirtualHeight) — the height we WRITE
private compressionActive = false;  // V > maxVirtualHeight (arithmetic only — never measured)
private virtualScrollTop = 0;       // vTop — the anchor, compressed mode only
private lastPhysicalScrollTop = 0;  // lastS — seeded in the constructor BEFORE the initial updateVisibleRange()
private readonly maxVirtualHeight: number;  // options.maxVirtualHeight ?? DEFAULT_MAX_VIRTUAL_HEIGHT
```

### Mapping (the heart of the change)

Definitions per event: `s = scrollSource.scrollTop`, `vh =
scrollSource.clientHeight`, `H = rowHeight`, `N = totalRows`, `V = N*H`,
`P = scrollSource.scrollHeight > 0 ? scrollSource.scrollHeight : physicalHeight`
(measured physical extent — self-corrects engines that clamp below 15M, e.g.
Chrome at high zoom; jsdom, which reports 0, falls back to `physicalHeight`),
`maxScroll = max(0, P − vh)`, `maxVTop = max(0, V − vh)`.

**Identity mode (`!compressionActive`)** — the existing code path, untouched:
`vTop ≡ s` definitionally; `scrollHeight` must never be read (tests spy on
this).

**Compressed mode** — update the anchor first:

```
delta = s − lastS
if      maxScroll ≤ 0:       vTop = 0
else if s ≤ 0:               vTop = 0                                  // top reconciliation — MANDATORY:
                                                                       // without it, linear drift traps the
                                                                       // user above row 0 (scrollTop can't go
                                                                       // below 0, so no more events fire)
else if s ≥ maxScroll − 1:   vTop = maxVTop                            // bottom reconciliation (−1 = hidpi
                                                                       // fractional-scrollTop tolerance)
else if |delta| ≤ vh:        vTop = clamp(vTop + delta, 0, maxVTop)    // LINEAR: wheel, trackpad momentum
                                                                       // frames, arrow/PageDown — all < vh
                                                                       // per event → native feel at any scale
else:                        vTop = (s / maxScroll) * maxVTop          // PROPORTIONAL: thumb drags (1 px of
                                                                       // thumb ≈ tens of thousands of px),
                                                                       // Home/End, programmatic jumps.
                                                                       // Divide BEFORE multiplying: s*maxVTop
                                                                       // can exceed 2^53 at 50M rows.
lastS = s
```

**Range (both modes; this replaces the body of `calculateVisibleRange`):**

```
rawStart = floor(vTop / H);  rawEnd = ceil((vTop + vh) / H)
end   = min(N, rawEnd + bufferRows)
start = max(0, min(rawStart − bufferRows, end))
```

The `min(…, end)` term is a **deliberate latent-bug fix**: today `start` is only
clamped at 0, so a `totalRows` shrink under a live scrollTop can produce
`start > end` → negative `LIMIT` in `TableBody.buildRowQuery`. Keep a comment
saying exactly that.

**Offset (both modes):**

```
offsetY = s − vTop + start * H
```

Identity mode: `s === vTop` → `offsetY = start * H`, today's exact value.
Compressed-mode boundary proofs (put these in a code comment):

- `s = 0` → `vTop = 0`, `start = 0` → `offsetY = 0`: row 0 at the top.
- `s = maxScroll` → `vTop = maxVTop` → `rawEnd = ceil((V − vh + vh)/H) = N` →
  `end = N`; the last row's physical bottom = `s − vTop + N*H = (P − vh) − (V −
vh) + V = P` — exactly the spacer's bottom edge, which coincides with the
  viewport's bottom edge at max scroll. Last row fully visible.
- Between row-boundary crossings, linear deltas change `s` and `vTop` by the same
  amount → `offsetY` unchanged → no corrective repaint (native scroll shifts the
  already-painted rows; no shimmer).

### Method-by-method changes

- **`calculateVisibleRange()`** — implement the above. Keep the existing
  `totalRows === 0` and `viewportHeight === 0` early returns.
- **`updateVisibleRange()`** — currently notifies only when start/end change.
  New rule: **reposition** the viewport when `offsetY` OR start/end changed;
  **notify callbacks** only when start/end changed (preserves TableBody's
  fetch-dedupe semantics; compressed-mode boundary snaps can move `offsetY`
  without changing the range).
- **`updateViewportPosition()`** — `this.viewportContainer.style.top =
`${offsetY}px`` replaces the `transform: translateY(…)`. Rationale (comment):
  `top` resolves through layout (LayoutUnit fixed-point — exact at our
  magnitudes) while compositor transforms are float32 (1-px quantization above
  ~8.4M px). `.dt-virtual-viewport` is already `position: absolute; top: 0` in
  CSS, so the inline style simply overrides. There is no transform-only frame to
  keep "GPU accelerated": `offsetY` changes only when rows are also being
  inserted/removed, which does layout anyway.
- **`setTotalRows(count)`** — recompute `V`, `compressionActive`, `physicalHeight
= min(V, maxVirtualHeight)`; write `${physicalHeight}px` to `contentContainer`
  **and** (external mode) `bodyContainer`; then re-anchor **preserving
  position** — never proportionally re-derive (that would teleport a
  linearly-scrolled user):
  - identity → compressed transition: `vTop = min(s, maxVTop)` (s was virtual);
  - otherwise: `vTop = min(vTop, maxVTop)` (clamp for shrink);
  - `lastS = s`; then `updateVisibleRange()`.
    If the browser subsequently clamps `scrollTop` (content got shorter), its own
    scroll event arrives with a large negative delta → proportional branch →
    proportional landing (correct: the old position no longer exists).
- **`scrollToRow(index, align)`** — compute the target in **virtual** space:
  ```
  i    = clamp(index, 0, N−1)
  vTgt = align 'start' ? i*H : 'center' ? i*H − vh/2 + H/2 : i*H − vh + H
  vTgt = clamp(vTgt, 0, maxVTop)
  identity:    sTgt = vTgt        // arithmetic clamp against physicalHeight − vh replaces
                                  // the contentContainer.offsetHeight read (same value below
                                  // the cap, and no longer trusts a browser-clamped measurement)
  compressed:  sTgt = maxVTop > 0 ? round((vTgt / maxVTop) * maxScroll) : 0
               vTop = vTgt        // write the anchor DIRECTLY — exactness must not depend on
                                  // inverting the lossy proportional map (rounding sTgt costs
                                  // up to ~half a compression ratio in virtual px if re-derived)
  scrollSource.scrollTop = sTgt
  lastS = scrollSource.scrollTop  // read BACK — the browser may clamp/round; the async scroll
                                  // event then sees delta ≈ 0 → linear branch → vTop unchanged
                                  // → landing is stable with no suppression flag
  updateVisibleRange()            // synchronous, as today
  ```
  For `align='start'`, `floor(vTgt/H) = i` exactly → row `i` renders at the
  viewport top for **any** index. Note in a comment: targets within ~one
  compression ratio of an exact boundary get snapped by the boundary branches on
  the follow-up scroll event — the target row stays fully visible (same class of
  clamp `scrollToRow` already performs today).
- **New public method** `getVirtualScrollTop(): number` — returns
  `compressionActive ? this.virtualScrollTop : this.scrollSource.scrollTop`.
  JSDoc: "Virtual-space counterpart of `getScrollTop()`; identical below the
  height cap." (The jsdoc API test requires documentation.)
- **`VisibleRange.offsetY` JSDoc** (`:38-39`) — re-specify: "Physical Y offset in
  px at which the viewport container is positioned inside the (possibly
  height-capped) content element. Equals `start * rowHeight` whenever the
  dataset fits under the cap."
- **Class JSDoc** — add a short "Scroll-space compression" paragraph describing
  the cap + dual-mode mapping.

### Call-site fixes outside VirtualScroller

- **`src/table/KeyboardNavigator.ts` (~`:905`)** — in
  `scrollFocusedCellIntoView`, change `const scrollTop = vs.getScrollTop();` to
  `vs.getVirtualScrollTop();`. The surrounding `rowTop/rowBottom` comparisons are
  virtual-space; identity mode is value-identical.
- **`src/table/TableBody.ts` (~`:570-578`) — TRANSITIONAL edit** (Phase 3
  deletes this whole mechanism; add a `// Phase 3 replaces this` comment):
  replace the fabricated replay
  ```ts
  await this.handleScroll({
    start: pending.start,
    end: pending.end,
    offsetY: pending.start * this.rowHeight,
  });
  ```
  with
  ```ts
  await this.handleScroll(this.virtualScroller.getVisibleRange());
  ```
  keeping `pendingFetch` purely as the "work is pending" trigger. This removes
  the `scrollTop == start × rowHeight` identity assumption and always replays
  the freshest window.
- **`src/styles/05-data-grid.css`** — comment updates only: `.dt-virtual-viewport`
  ("positioned via inline `style.top`; layout-unit precision is exact under the
  height cap, unlike float32 compositor transforms") and `.dt-virtual-content`
  ("height set dynamically = min(totalRows × rowHeight, height cap)"). No rule
  changes.

## Ordered tasks

1. Implement the `VirtualScroller.ts` changes (constants, options, state,
   mapping, `setTotalRows`, `scrollToRow`, `getVirtualScrollTop`, `style.top`,
   `start ≤ end` clamp, JSDoc).
2. Update existing `tests/table/VirtualScroller.test.ts` expectations (see
   below); confirm every ≤1000-row case passes **unchanged** — that is the
   identity-regression gate.
3. Add the compressed-mode unit suite.
4. Fix `KeyboardNavigator.ts` + its test mock.
5. Make the transitional `TableBody.ts` edit; run the TableBody race suites.
6. Update the CSS comments and the perf bench.
7. Add the Playwright spec.
8. Run verification; commit; update the README status table.

## Tests

### Updates to `tests/table/VirtualScroller.test.ts`

- Viewport-positioning assertions (`:602-623`): expect
  `viewport.style.top === '160px'` etc. (transform assertions removed).
- 1M-row case (`:743-762`): spacer expectation `'32000000px'` →
  `'15000000px'`; retitle to "caps the spacer at MAX_VIRTUAL_HEIGHT"; keep the
  DOM-sparsity assertions.
- `scrollToRow` suite: the `offsetHeight` stubs become inert (identity clamp is
  arithmetic now); assertions should pass unchanged — verify, don't rewrite.

### New compressed-mode suite (`tests/table/VirtualScroller.compression.test.ts`, jsdom)

Harness: `rowHeight: 32, maxVirtualHeight: 3200, bufferRows: 5`, stub
`clientHeight = 320`, `setTotalRows(1000)` → V = 32,000, P_req = 3,200, stub
`scrollHeight = 3200` where needed → maxScroll = 2,880, maxVTop = 31,680,
compression ratio ≈ 11. Stub geometry via `Object.defineProperty` (house
pattern). Cases:

1. Spacer heights capped: `contentContainer.style.height === '3200px'`; in
   external-scroller mode the body container is capped identically.
2. Top boundary: `scrollTop = 0` → `{start: 0, offsetY: 0}`.
3. Bottom boundary: `scrollTop = 2880` → `end === 1000`, `start === 985`,
   `offsetY === 2880 − 31680 + 985*32 === 2720`; last-row bottom
   `offsetY + (end − start)*32 === 3200 === P`.
4. Linear: from a mid anchor, deltas +32 / +100 / −100 (all < vh) move
   `getVirtualScrollTop()` by exactly the delta.
5. Proportional: a delta > 320 yields `vTop === s/2880 * 31680` (±1e-6).
6. Top-trap regression: proportional jump to `s = 500`, then linear steps down
   to `s = 0` → range `start === 0`.
7. Bottom snap tolerance: `s = 2879.5` takes the bottom branch (`end === 1000`).
8. `scrollToRow` exactness: for k ∈ {0, 123, 500, 999}, `'start'` →
   `floor(getVirtualScrollTop()/32) === k` and physical
   `scrollTop === round(vTgt/31680 * 2880)`; spot-check `'center'`/`'end'`
   formulas; wheel-after-jump continuity (delta +32 afterwards advances `start`
   by exactly 1).
9. Shrink under live scroll (both modes): `setTotalRows(1000)` scrolled deep,
   then `setTotalRows(10)` → resulting range has `start <= end` (guards the
   negative-LIMIT bug).
10. Identity purity: default cap, 1000 rows — a `scrollHeight` getter spy is
    **never** invoked, and `offsetY === start*32` throughout.
11. Measured-below-requested: stub `scrollHeight = 1600` (< P_req 3200) →
    `scrollTop = 1280` (= measured maxScroll) still yields `end === 1000`.
12. Grow across the cap boundary: identity dataset scrolled to `s`, then
    `setTotalRows` pushes V past the cap → `getVirtualScrollTop() === s`
    immediately (anchor continuity, no teleport).

### Other suites

- `tests/table/KeyboardNavigator.test.ts` — add `getVirtualScrollTop: () => 0`
  to the `vs` mock (mirror any per-test `getScrollTop` overrides); add one
  compressed-mode case: `getScrollTop` small but `getVirtualScrollTop` large →
  `scrollFocusedCellIntoView` must use virtual space (asserts `scrollToRow`
  called/not-called correctly).
- `tests/table/TableBody.race.test.ts` and
  `tests/table/TableBody.scrollOverlap.race.test.ts` — run them after the
  transitional edit; the replay now reads `getVisibleRange()`. Adjust only if an
  assertion was coupled to the replayed window's exact identity (exploration
  found no `offsetY` coupling).
- `tests/performance/scroll-handler.bench.test.ts` — budgets unchanged (the
  1M-row bench now exercises the compressed **linear** path, since 32M px >
  15M px). Add an interleaved delta pattern where every ~10th event jumps ≥1e6
  px, to bench the proportional branch. Update the header comment.

### Playwright spec — `tests/browser/virtual-scroll-cap.spec.ts`

No DuckDB; fast. Model the page-mount on `tests/browser/row-height.spec.ts`.
In `page.evaluate`, `await import('/data-table/src/advanced.ts')`, create a
600 px-tall host, mount a `VirtualScroller` in legacy mode (style its
`.dt-virtual-scroll` element `height:100%; overflow:auto` inline), and register
a minimal `onScroll` renderer that fills the viewport container with
32-px-tall divs carrying `data-row-index`. `setTotalRows(2_000_000)`
(V = 64M px — above both engine clamps and the cap). Assert:

1. The content element's `getBoundingClientRect().height === 15_000_000`
   (the request is honored by the browser, not silently clamped).
2. `scrollTop = 1e9` (browser clamps to max) → settle a couple of rAFs → the
   range `end === 2_000_000` and the `[data-row-index="1999999"]` element's
   rect bottom equals the scroll container's rect bottom ±1 px.
   **This is the assertion that fails on unfixed `main`.**
3. `scrollToRow(1_234_567, 'start')` → that row's rect top equals the container
   top ±1 px.
4. From there, `page.mouse.wheel(0, 120)` ×5 → after each, `start` advances by
   ≤10 rows and consecutive ranges overlap (linear feel; a proportional bug
   would jump thousands).
5. `scrollTop = 0` → row 0 rendered at the top.

## Verification criteria

All must pass:

```bash
npx vitest run tests/table/VirtualScroller.test.ts tests/table/VirtualScroller.compression.test.ts \
  tests/table/KeyboardNavigator.test.ts tests/table/TableBody.race.test.ts \
  tests/table/TableBody.scrollOverlap.race.test.ts tests/performance/scroll-handler.bench.test.ts
npx playwright test tests/browser/virtual-scroll-cap.spec.ts   # first run: npx playwright install chromium
npm run test:coverage      # thresholds: statements 76 / branches 63 / functions 81 / lines 77
npm run typecheck && npm run lint && npm run format:check
npm run test:browser
```

Expected: everything green; the new Playwright spec's step 2 demonstrably
exercises the previously-broken geometry (optionally confirm it fails when the
`VirtualScroller.ts` changes are stashed).

## Commit guidance

Two commits work well:

1. `Cap virtual scroll height and map scroll space for large datasets`
   (VirtualScroller + KeyboardNavigator + TableBody transitional + CSS comments
   - unit/bench tests)
2. `Add browser spec for height-capped virtual scrolling`

Finish by flipping Phase 1's row to `[x]` in `implementation-plan/README.md`
(include in commit 2).

## Seams & out of scope

- Do **not** restructure `TableBody`'s fetch pipeline — Phase 3 owns that. Your
  only `TableBody` change is the transitional replay edit.
- Do not add worker/bridge changes (Phase 2) or big-dataset e2e helpers
  (Phase 4) or docs rewrites (Phase 5).
- `smoothScrollToTopAndRefresh` (TableBody `:448-483`) needs no change: its
  per-frame steps are large → proportional branch, monotonic to 0; terminal
  `scrollToRow(0)` is exact.
- Known accepted behaviors (documented in README risks): single-frame flicks
  > viewport take the proportional branch; thumb drift during sustained linear
  > scrolling.
