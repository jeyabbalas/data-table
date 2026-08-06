# Phase 5 — Docs, changeset, manual verification, full gate

> Part of [implementation-plan/README.md](./README.md) — read that first. You are
> on branch `fix-virtual-scroll-large-datasets`.

## Goal

Bring documentation in line with the new architecture, write the release
changeset, verify the fix against the **actual bug parquet** in a live Chrome
session, and run the complete PR gate so the branch is merge-ready.

## Prerequisites

Phases 1–4 complete (README status table); `npm run test:browser` and
`npm run test:coverage` green at start.

## Targeted code review (do this before editing)

Read the _final_ state of the changed code so the docs you write describe
reality, not this plan: `src/table/VirtualScroller.ts` (constants, mapping,
`getVirtualScrollTop`), `src/table/TableBody.ts` (block pipeline, options,
fast path), `src/data/WorkerBridge.ts` (`QueryOptions`),
`src/worker/dispatcher.ts` (queue comment), `src/DataTable.ts`
(`CreateDataTableOptions`). Then read each doc listed below in full before
editing it — several restate the old spacer math in prose.

## Tasks

### 1. Documentation updates

- `docs/performance.md` — the spacer-math section (states
  "`clientHeight` read at VirtualScroller… spacer height written at …; at 1M
  rows that is a 32,000,000 px element"): rewrite for the 15M px cap +
  compression; update the scale table ("100K–1M rows … design target" → the
  scrollbar is correct to 50M+; DuckDB query latency is the practical
  ceiling); note the unbounded-container failure mode now saturates at ~469K
  rendered rows (viewport = capped 15M px) instead of the full dataset —
  advice unchanged; document block-quantized fetching, prefetch, the enlarged
  row cache, and the rowid fast path; refresh the hot-paths and benchmark
  sections if line refs/budgets moved.
- `docs/concepts/architecture.md` (virtual-scroller section, ~`:165-250`) —
  add a "Scroll-space compression" subsection: the cap constant, dual-mode
  mapping formulas (copy from `phase-1-scroll-compression.md`), `style.top`
  positioning rationale, and the `VisibleRange.offsetY` re-specification;
  describe the new fetch pipeline (render-always, blocks, abort, epoch);
  refresh stale line references.
- `README.md` (container-sizing section, ~`:117-190`) — update the row-count
  math prose and any "32,000,000 px" mention.
- `docs/troubleshooting.md` (~`:571`) — same spacer-math mention.
- `AGENTS.md` (~`:534` pitfall + anywhere phrasing implies a >1M-row scroll
  ceiling) — keep the latency caveat, drop the implicit scroll ceiling;
  document the new options briefly.
- `llms.txt` — grep for spacer/row-count mentions and align.
- Search-and-destroy pass: `grep -rn "32,000,000\|32000000" README.md docs/
AGENTS.md llms.txt` must return only intentional history-free text.
- New public API documented: `fetchBlockSize`, `rowCacheRows`, `prefetch` on
  `createDataTable`; `maxVirtualHeight` on `VirtualScrollerOptions`;
  `getVirtualScrollTop`; `QueryOptions`. Run `npm run docs:api` to regenerate
  `docs/api-reference.md` and commit the result.

### 2. Changeset

`npx changeset` → **minor** bump, Keep-a-Changelog headings:

- **Fixed** — Scrollbar now reaches the last row for datasets whose scroll
  height exceeds browser element-height limits (previously stuck at row
  ~1,048,576 in Chrome / ~559,240 in Firefox at the default 32 px row height).
- **Fixed** — Stale or incorrect cell values no longer flash during rapid
  scrolling on large datasets; superseded row fetches are cancelled and every
  scroll frame renders consistently.
- **Added** — `fetchBlockSize`, `rowCacheRows`, and `prefetch` options on
  `createDataTable`; `VirtualScroller.getVirtualScrollTop()` and
  `maxVirtualHeight` on the advanced surface.
- **Changed** — The worker now executes queries serially with priority
  scheduling and genuine query cancellation.

### 3. Manual verification in live Chrome (the original repro)

Drive a real Chrome session (Claude-in-Chrome MCP or hands-on) against the
demo, using the ground-truth table in
[README.md](./README.md#ground-truth-for-the-bug-parquet-used-in-phase-5):

1. `npm run dev` → `http://localhost:5173/data-table/` (note the `/data-table/`
   base path — `/` 404s). Wait for `#load-file-btn` to enable (DuckDB booted).
2. Upload `bugs/scroll/data_with-county_2022.parquet` via the `#file-input`
   picker; click `#load-file-btn`; wait for the grid.
3. Confirm the info line reports 1,510,911 rows; console:
   `document.querySelector('.dt-grid').getAttribute('aria-rowcount')` matches
   the code's rows+offset convention.
4. **The original gesture:** mouse-drag the vertical scrollbar thumb of
   `.dt-body-scroll` to the very bottom. Within ~1 s the bottom three rows must
   match ground truth rows 1,510,908–1,510,910 (`56 | 56045 | Eye and Orbit |
Asian/NHPI … | Male/Female/Male | 0 | …`) — compare the string/int columns;
   `crudeRate` is NaN in the last two rows. Pre-fix failure signature: landing
   near row ~1,048,575.
5. Console probe →
   ```js
   (() => {
     const e = document.querySelector('.dt-body-scroll');
     const r = [...document.querySelectorAll('.dt-body .dt-row[data-row-index]')].map(
       (x) => +x.dataset.rowIndex,
     );
     return {
       atBottom: e.scrollTop + e.clientHeight >= e.scrollHeight - 1,
       maxIndex: Math.max(...r),
       lastRowId: document.querySelector('.dt-row[data-row-index="1510910"]')?.dataset.rowId,
     };
   })();
   ```
   Expect `{atBottom: true, maxIndex: 1510910, lastRowId: "1510910"}`.
6. Midpoint: set `scrollTop = (scrollHeight − clientHeight) / 2` → first
   visible index ≈ 755,455 ±0.5%; spot-check that row against ground truth
   (`13 | 13127 | Lymphocytic Leukemia | … | Male`).
7. Keyboard: click a cell → `Ctrl+End` → last row focused and visible;
   `Ctrl+Home` → row 0 shows `All | All | All | All | All | 608,371`.
8. **Flicker:** scrub the thumb vigorously ~10 s (flings, reversals); stop
   anywhere: rows fill via placeholders → correct data only; no in-place value
   swaps. Then:
   ```js
   [...document.querySelectorAll('.dt-body .dt-row[data-row-id]')].every(
     (r) => r.dataset.rowId === r.dataset.rowIndex,
   );
   ```
   → `true` (valid while unsorted/unfiltered). Sort by `deaths`, scrub again,
   revisit one position twice → identical values both visits.
9. Console free of errors throughout (aborted fetches must be silent).
10. Optional extras: repeat step 4 at 250% browser zoom (exercises the
    measured-`scrollHeight` fallback); record a GIF of steps 4 + 8 for the PR.

Record the outcome of every step in your final summary; any failure here
reopens the responsible phase rather than being patched ad hoc.

### 4. Full PR gate

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run build
npm run size
npm run docs:api:check
npm run test:browser
npm run test:perf          # optional but recommended once on this branch
```

All green.

### 5. Wrap up

- Flip Phase 5 (and confirm 1–4) to `[x]` in
  `implementation-plan/README.md`, with a one-line result note each.
- Commits, e.g.:
  1. `Document scroll-space compression and block-based row fetching`
  2. `Add changeset for large-dataset scrolling fixes`
- Leave the branch ready for PR. **Do not push or open a PR unless the
  maintainer asks.** Suggested PR body skeleton: the two bug statements, the
  four-part architecture summary, the accepted-risks list from the README, the
  manual-verification results (with GIF), and the changeset text.

## Seams & out of scope

- No behavioral `src/` changes in this phase (JSDoc-only touches are fine if
  `docs:api` needs them). A failed manual step reopens the relevant phase.
- Whether `implementation-plan/` itself is deleted before merge is the
  maintainer's call at PR time — leave it in place.
