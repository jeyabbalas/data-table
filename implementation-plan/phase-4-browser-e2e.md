# Phase 4 — Large-scale browser e2e suite

> Part of [implementation-plan/README.md](./README.md) — read that first. You are
> on branch `fix-virtual-scroll-large-datasets`.

## Goal

Prove both fixes in real Chromium at 1.6M rows with **deterministic**
assertions, and add perf guardrails:

- Bug 1: the scrollbar reaches the true last row; intermediate positions map
  proportionally; `scrollToRow` and keyboard navigation are exact at the far
  end; small datasets keep identity behavior.
- Bug 2: rendered rows are always self-consistent — during storms and at rest —
  using a hard oracle, not screenshots or timing.

## Prerequisites

Phases 1–3 complete (README status table). Sanity: `npm run test:browser` green
(includes Phase 1's `virtual-scroll-cap.spec.ts`).

## Targeted code review (do this before editing)

1. `tests/browser/helpers/demo.ts` — `mountEmptyTable` (`:251-274`): the
   pattern of `page.evaluate` importing `/data-table/src/index.ts` and calling
   `createDataTable({...})`; `settle` (`:284-301`): quiet-frames wait parked on
   `window`; `loadCsv` (`:197`): DataTransfer injection (you won't use it for
   big data, but copy its waiting discipline).
2. `playwright.config.ts` — baseURL `http://localhost:5199/data-table/`,
   webServer auto-boot, per-test timeout (120 s default — the binding
   constraint), `workers: 1` + `retries: 1` on CI, expect timeout 15 s.
3. `src/DataTable.ts` — public `readonly bridge: WorkerBridge` (`:302`),
   `loadData(source, options)` signature and accepted source types (confirm an
   `ArrayBuffer` + `{sourceFormat: 'parquet', tableName?}` path exists — check
   `src/data/DataLoader.ts` sniffing/dispatch).
4. `src/data/WorkerBridge.ts:341` — `exportToBuffer(sql, 'parquet', signal?)`
   → `Uint8Array`; skim the worker side (`src/worker/dispatcher.ts` export
   case) so you know it does `COPY (…) TO` + `copyFileToBuffer`. Precedent for
   the exact flow: `demo/main.ts:482-484`.
5. `src/table/Cell.ts` — integers render via `toLocaleString` ("1,599,999") —
   this is why every text assertion targets the **varchar** column, never the
   formatted id cell.
6. DOM conventions (set in `src/table/TableBody.ts`): data rows carry
   `data-row-index` (`:1062`) and `data-row-id` (`:1084`);
   `aria-rowindex = index + 2` (`:1065`); placeholders carry
   `data-row-index`/`aria-rowindex` and the `dt-cell--placeholder` cell class
   (plus the `data-placeholder` marker Phase 3 added); grid `aria-rowcount` is
   maintained by `TableContainer` (~`:833`). **Verify the exact aria offsets in
   code before asserting them.**
7. Scroll element: `.dt-body-scroll` (external scroll container —
   `TableContainer.ts:1431`); rows under `.dt-body .dt-row`; viewport
   `.dt-virtual-viewport`.
8. `tests/performance/scroll-handler.bench.test.ts` — structure of the budget
   test you'll extend; `tests/performance/benchmarks.duckdb.test.ts` — the
   `RUN_DUCKDB_PERF` gate and its 1M-row `range()` seeding idiom.

## Design specification

### Helper — `tests/browser/helpers/bigTable.ts`

```ts
export const GEN_COLUMNS = ['id', 'grp', 'val'] as const;
export function expectedGrp(i: number): string {
  return 'g' + (i % 97);
}

export async function mountBigTable(
  page: Page,
  opts: { rows: number; rowHeight?: number },
): Promise<void>;
export async function waitForRowsResolved(page: Page): Promise<void>;
export async function installRowInvariantProbe(page: Page): Promise<void>;
export async function readViolations(page: Page): Promise<Violation[]>;
export async function readVisibleRows(
  page: Page,
): Promise<{ index: number; rowid: number; cells: string[] }[]>;
```

`mountBigTable` runs entirely in-page via **public API** (no fixtures, no
network):

1. `page.goto('./')`; `page.evaluate`: import `/data-table/src/index.ts`;
   create a 600 px-tall host div; `const table = await createDataTable({
container, persistence: false, visualizations: false })` — visualizations
   off: header plots would add multi-second stats queries on 1.6M rows and are
   irrelevant here. Store `window.__t = table`.
2. `await table.bridge.query(\`CREATE OR REPLACE TABLE gen_src AS
   SELECT CAST(i AS INTEGER) AS id, 'g' || (i % 97) AS grp,
   (i % 1000) / 10.0 AS val FROM range(0, ${rows}) t(i)\`);`
3. `const buf = await table.bridge.exportToBuffer(
'SELECT id, grp, val FROM gen_src ORDER BY id', 'parquet');`
4. `await table.bridge.query('DROP TABLE gen_src');`
5. `await table.loadData(buf.buffer, { sourceFormat: 'parquet' });` — the
   **production load path**: the parquet loader injects `__rowid__` in file
   order, so `__rowid__ === position === id`. Drop the buffer reference.
6. Wait for `.dt-grid[role="grid"]` and ≥1 rendered row.

Every cell is a pure function of the row index → specs compute expectations
without any fixture. **The flicker oracle:** while unsorted/unfiltered,
`data-row-id === data-row-index` must hold for every rendered non-placeholder
row at every instant, and the `grp` cell text must equal
`expectedGrp(index)` — any stale-range render violates it immediately.

`waitForRowsResolved`: `page.waitForFunction` — no `.dt-cell--placeholder`
under the host AND a serialized `{index → [rowid, firstCellText]}` map of
visible rows is unchanged across two consecutive polls (state parked on
`window`, mirroring `settle`).

`installRowInvariantProbe`: in-page `MutationObserver` on
`.dt-virtual-viewport` (`subtree, childList, characterData, attributes` filtered
to `data-row-index`/`data-row-id`) plus a rAF sampler; each callback validates
every `.dt-body .dt-row[data-row-id]` (rowid === index; `grp` text matches) and
pushes violations `{t, index, rowid, text}` to `window.__dtScrollViolations`.
Safe from torn reads: `renderVisibleRows` is synchronous; observer callbacks
run at microtask checkpoints after a pass completes.

### Spec — `tests/browser/scroll-extent.spec.ts` (bug 1)

`test.slow()`. One `test()` per dataset size, `test.step()` sub-assertions so
mount+generate+load is paid once.

**Block A — N = 1,600,000** (51.2M px uncapped → deep into compressed mode):

1. _Bottom reachability:_ `el.scrollTop = el.scrollHeight` →
   `waitForRowsResolved` → a `.dt-row[data-row-index="1599999"]` exists with
   `data-row-id="1599999"`; its `aria-rowindex` equals the grid's
   `aria-rowcount` (use the code-verified offsets); its `grp` cell text is
   `expectedGrp(1599999)`; its rect bottom equals the scroll container's rect
   bottom ±1 px; rendered indices are contiguous; no placeholders. Environment
   guard: `el.scrollHeight < 1_600_000 * 32` (true post-fix because the library
   caps; documents that compressed mode is actually engaged).
2. _Proportionality:_ for f ∈ {0.25, 0.5, 0.75}:
   `el.scrollTop = f * (el.scrollHeight − el.clientHeight)` → settle → first
   fully-visible `data-row-index` ≈ `f · N` within ±1,600 rows (0.1% — the
   pre-fix error was ~460K), strictly increasing across the three f values.
3. _scrollToRow exactness:_ via `window.__t.container.getTableBody()
.scrollToRow(i, 'start')` for i ∈ {1_048_570 (old clamp edge), 1_599_940,
   1_599_999} → row visible with matching `data-row-id`; then
   `scrollToRow(0)` → row 0 visible.
4. _Keyboard:_ click a cell → `Control+End` → focused row is the last row and
   on-screen; `Control+Home` → row 0; two `PageDown`s from the last page don't
   overshoot or blank the viewport.

**Block B — N = 10,000 (identity guard):** `el.scrollHeight === 10_000 * 32`
exactly; for a few k, `el.scrollTop = k * 32` → first visible
`data-row-index === k`. (Proves the cap/mapping never engages below the
threshold.)

### Spec — `tests/browser/scroll-flicker.spec.ts` (bug 2)

`test.slow()`.

1. _Settled determinism (N = 1,600,000, K = 4):_ an in-page driver performs a
   fixed-seed 12-jump pseudo-random `scrollTop` walk (jumps 40–80 ms apart —
   real scroll events → overlapping fetch races), then returns to the anchor
   `A = 0.37 · (scrollHeight − clientHeight)`; `waitForRowsResolved`; snapshot
   `readVisibleRows()`. Repeat K times. Assert: all K snapshots deep-equal
   **and** equal the formula-derived expectation (`rowid === index`,
   `grp === expectedGrp(index)`) — catching "deterministically wrong" too.
2. _Mid-storm invariant (N = 200,000 — the race is height-independent; smaller
   N keeps runtime bounded):_ `installRowInvariantProbe` → ~8 s storm driven
   in-page: bursts of ±400 px steps every ~16 ms, a teleport every ~300 ms,
   direction reversals → settle → `readViolations()` is empty (print all
   violations on failure).
3. _Sorted mode:_ click one column header (sort) — the rowid==index oracle no
   longer applies; instead run 2 anchor-return trips (as in step 1) and assert
   the two snapshots deep-equal.

### Perf guardrails

- `tests/performance/scroll-handler.bench.test.ts`: add a
  `TOTAL_ROWS = 50_000_000` variant with the **same** budgets (median ≤1 ms,
  p99 ≤16.6 ms per dispatch) — proves compressed-mode math is O(1). Runs in
  normal `npm test` like the existing case.
- Optional (only if quick): a `RUN_DUCKDB_PERF`-gated case in
  `tests/performance/benchmarks.duckdb.test.ts` seeding 1.6M rows via
  `range()` and running a 200-iteration scroll-walk of block-shaped queries
  under a total budget (~5 s), documenting the worker-side latency envelope.

### Runtime & CI notes

- The per-test 120 s cap is the binding constraint, not the webServer timeout;
  `test.slow()` triples it to 360 s. Structure = one `test()` per dataset.
- Expected wall time: extent ~60–120 s, flicker ~90–150 s locally; CI
  (`workers: 1`) adds ~3–5 min to the browser job — acceptable.
- No timing-sensitive `expect`s anywhere: fixed-seed walks + invariant/oracle
  assertions only. DuckDB CDN fetch is existing exposure (retries cover it).
- Memory hygiene: `DROP TABLE gen_src` before `loadData`; drop the buffer
  reference after; nothing else retained.

## Ordered tasks

1. Write `bigTable.ts` (mount, waiters, probe, readers).
2. Write `scroll-extent.spec.ts`; verify Block A fails if you temporarily
   revert Phase 1's `VirtualScroller` change (optional but a strong signal —
   `git stash` the src change, run, unstash).
3. Write `scroll-flicker.spec.ts`.
4. Extend the scroll-handler bench (and optionally the DuckDB perf suite).
5. Full verification; commit; README status flip.

## Verification criteria

```bash
npx playwright test tests/browser/scroll-extent.spec.ts tests/browser/scroll-flicker.spec.ts
npm run test:browser                        # entire browser suite green
npm run test:coverage                       # bench addition runs here; thresholds hold
npm run typecheck && npm run lint && npm run format:check
```

All green; both new specs complete within their budgets; flicker probe reports
zero violations across the storm.

## Commit guidance

One commit: `Add browser regression suite for large-dataset scrolling`
(helper + two specs + bench variant). Flip Phase 4's row in
`implementation-plan/README.md`.

## Seams & out of scope

- No `src/` changes in this phase. If a spec exposes a real defect in Phases
  1–3 work, **stop and report** in your summary (with the failing assertion)
  rather than patching src ad hoc — the maintainer decides whether to reopen a
  phase.
- Do not use the git-ignored `bugs/` parquet in committed specs (Phase 5 uses
  it manually).
- Do not add Firefox/WebKit projects to `playwright.config.ts` (CI is
  Chromium-only by convention); write assertions engine-agnostically so a
  `firefox` project could be added later.
