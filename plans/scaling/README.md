# Large-scale dataset support — phased implementation plan

This directory is the execution plan for making `@jeyabbalas/data-table` fast and correct on
**~1,000-column × ~5,000,000-row** datasets. It was produced by a deep review of the codebase
(three parallel exploration passes over the data pipeline, the rendering layer, and the
state/persistence/test infrastructure) followed by a design pass. Every claim below carries a
`file:line` reference into the codebase as it stood at the branch point (commit `c326e9e`).

**If you are a Claude Code agent executing a phase: read this file top to bottom, then
[`STATUS.md`](./STATUS.md), then your phase document. Do not start coding before finishing all
three.**

---

## 1. Mission and non-goals

**Mission.** A user who loads a wide (1K-column), deep (5M-row), or combined (1K × 5M) dataset
gets: a responsive first paint in seconds, smooth scrolling on both axes, usable sorting and
filtering, working export, and graceful, well-messaged behavior at the memory ceiling — with the
library's existing feature set (visualizations, filters, derived columns, annotations,
persistence, undo) intact.

**Non-goals** (decided during planning; see [§9 Deferred and rejected](#9-deferred-and-rejected)):
no server-side compute mode, no wasm64 build, no SharedArrayBuffer-by-default, no Arrow IPC
worker transport (re-evaluated after Phase 5), no shadow DOM, no column-group headers.

## 2. Decisions already made (user-confirmed — do not relitigate)

1. **New defaults, not opt-in flags.** Where scalable behavior is strictly better, it becomes the
   default. Every observable change ships with a changeset and a migration note. Opt-outs are
   added only where a real use case needs the old semantics (e.g.
   `visualizations: { eager: true }` for screenshot/PDF pipelines that need every chart drawn
   before proceeding).
2. **The direct-scan phase (Phase 10) is in scope.** It is the only route to the full 1K × 5M
   target given the 4 GB WebAssembly ceiling (see §3). It begins with a mandatory feasibility
   spike whose findings may narrow its scope — but the phase itself is not optional.
3. **13 phases (0–12), executed sequentially, one independent agent session each.** The repo must
   be releasable (all gates green) after every phase.
4. **This plan lives at `plans/scaling/`** and never ships to npm (`package.json` `files` is
   dist-only). Performance baselines are committed under `plans/scaling/baselines/`.

## 3. Physical constraints (memorize these)

- **DuckDB-WASM is 32-bit: a hard ~4 GB heap ceiling** (practical safe ceiling ~3.2 GB). The
  database is in-memory only as configured today — no `memory_limit`, no `temp_directory`, no
  spill (`src/worker/duckdb.ts:44` sets only `castDecimalToDouble`).
- **1K × 5M numeric cells ≈ 40 GB uncompressed.** It can never be materialized as an in-memory
  table. Even 1K × 1M doubles = 8 GB. The combined tier is reachable _only_ by querying the file
  directly (Phase 10).
- **The current load path transiently holds ~2× the table** (CTAS rewrites drop the old copy only
  after the new one exists, `src/worker/loaders/common.ts:292-451`) plus up to 4–5 copies of the
  raw source bytes (see hazard C in §5).
- **One query at a time.** The worker dispatcher is a serial two-priority FIFO
  (`src/worker/dispatcher.ts:46-72`); DuckDB-WASM runs single-threaded unless the host page is
  cross-origin isolated. Any "fan out N queries" design is really "queue N queries".
- **Browser element heights saturate** (~33.5M px Blink, ~17.9M px Gecko). The virtual scroller
  already handles this with a 15,000,000 px cap and a dual-mode scroll mapping
  (`src/table/VirtualScroller.ts:73,311-342`) — exact at 50M+ rows. Do not break it.

## 4. Current architecture in one paragraph

`createDataTable()` builds: `TableState` (~18 whole-collection signals, `src/core/State.ts:22-72`)
→ `StateActions` (mutations + undo capture, `src/core/Actions.ts`) → `WorkerBridge` (promise RPC
to a worker that hosts DuckDB-WASM behind a serial two-priority queue with true cancellation,
`src/data/WorkerBridge.ts`, `src/worker/dispatcher.ts`) → `TableContainer`/`TableBody`
(row-virtualized grid: 128-row block-aligned fetches, row cache with whole-block eviction,
`__rowid__` range fast path when unsorted/unfiltered, `src/table/TableBody.ts`) →
`CrossfilterCoordinator` + per-column canvas visualizations (`src/visualizations/`) →
`SessionStore`/`AutoSave` (IndexedDB snapshots) and `UndoManager` (50-deep snapshot stacks).
Loaders ingest CSV/JSON/Parquet by registering the full buffer in DuckDB's virtual FS and running
`CREATE TABLE AS SELECT row_number() … AS __rowid__, * FROM read_xxx(…)`
(`src/worker/loaders/*.ts`).

## 5. Consolidated findings — the hazards this plan fixes

Line numbers are anchors from the branch point, not gospel: **earlier phases shift code. Always
re-verify a reference before acting on it** (each phase doc has a "targeted review" checklist for
this).

### A. O(columns) query fan-out (dominant load/interaction cost)

- Per-column visualization creation + eager fetch for **every** column at load; each numeric
  column ≈ 2 full-table scans including exact `COUNT(DISTINCT)`
  (`src/DataTable.ts:789-1031`, `src/visualizations/histogram/HistogramData.ts:188`,
  `src/visualizations/valuecounts/ValueCountsData.ts:91`). ~2,000 serialized scans at 1K columns.
- The public load promise waits for all of it:
  `await Promise.all([whenBodyReady, pendingVizInit])` (`src/DataTable.ts:1267`).
- Every filter change refreshes **all** registered visualizations (concurrency cap 4 bounds
  in-flight, not total; `src/visualizations/CrossfilterCoordinator.ts:105-127`). Every
  show/hide/reorder/derived change destroys and recreates every viz
  (`src/DataTable.ts:1161-1175`). Measured precedent in a code comment: one keyboard column move
  at 266 columns = 534 DuckDB queries (`src/table/TableBody.ts:409-414`).
- Type detection at load probes each VARCHAR column with `SELECT DISTINCT … LIMIT 100` up to 3
  times (`src/worker/loaders/common.ts:144-278`).

### B. O(rows × columns) load-time rewrites

- Up to **3 sequential full-table `CREATE TABLE AS SELECT … ORDER BY __rowid__` rewrites** for
  timestamp/date/time conversion (`src/worker/loaders/common.ts:292-451`), each a full copy +
  full sort, uncancelable (`src/worker/dispatcher.ts:286`).
- Progress reporting is 4 hardcoded points ending at 90% before the slowest stages;
  `loaded`/`total` never populated (`src/worker/dispatcher.ts:268-313`,
  `src/worker/types.ts:67-74`).

### C. Full-buffer ingest, multiple copies

- Main thread materializes the whole source (`.text()`/`.arrayBuffer()`,
  `src/data/DataLoader.ts:59,76`), postMessage clones it **without a transfer list**
  (`src/data/WorkerBridge.ts:507`), the loader re-encodes it (`src/worker/loaders/csv.ts:59`),
  `registerFileBuffer` copies it into the WASM heap. NDJSON sniffing splits the entire text into
  lines (`src/worker/loaders/json.ts:31`).

### D. No column virtualization (dominant DOM cost)

- Every visible row renders a cell for **every** visible column; every column gets an eager
  header (~38 DOM nodes, ~13 listeners, 6 signal subscriptions + 1 annotation listener) plus a
  canvas viz with its own `ResizeObserver` + `MutationObserver`
  (`src/table/TableContainer.ts:1359-1395`, `src/table/ColumnHeader.ts:150-340,460-499,578-650`,
  `src/visualizations/BaseVisualization.ts:191-249`). At 1K columns: ~73K DOM elements, ~1K
  canvases (~120 MB backing at dpr 2), ~2K observers, ~7K subscribers, ~2.5K queries.
- Per-render costs: ~14 DOM writes per cell × 35 rows × 1K cols
  (`src/table/TableBody.ts:1469-1528`); annotation classify per cell even with zero annotations
  (`:1595-1661`); focus-ring toggle on every cell (`:1218-1222`); `getComputedStyle` per row
  (`:1455`); O(cols²) `schema.find` + `indexOf` in the header loop
  (`src/table/TableContainer.ts:1360,1369`).
- Row pooling clones entire 1K-cell rows (`cloneNode(true)`, `src/table/TableBody.ts:1378`; pool
  of 100 rows = up to 100K detached cells `:1401-1403`).
- Interaction paths: resize drag clones the whole `columnWidths` Map per mousemove
  (`src/core/Actions.ts:1123-1128`) and rewrites 35K cell widths
  (`src/table/TableBody.ts:2012-2042`); pin/unpin FLIP interleaves `getBoundingClientRect` reads
  with transform writes O(cols) (`src/table/TableContainer.ts:1514-1539`); header rebuild is an
  all-or-nothing `innerHTML` wipe + TableBody destroy/recreate on every `visibleColumns` write
  (`src/table/TableContainer.ts:1338-1340,1440-1486`), and it runs twice at load.
- Row fetches project **all** visible columns — 128 rows × 1,001 columns per block cross the
  worker boundary as plain JS objects (`src/table/TableBody.ts:972-1001`,
  `src/worker/duckdb.ts:213-219`).

### E. O(rows) per-block cost when sorted/filtered

- Sorted or filtered block fetches use `ORDER BY … LIMIT 128 OFFSET k` — a top-(k+128) re-sort of
  the whole table per block, growing with scroll depth (`src/table/TableBody.ts:1023,1054-1062`).
  The unsorted path (`__rowid__` range + zonemaps + density valve, `:846-869,1024-1031`) is fine.

### F. State, selection, persistence at scale

- `selectAll()` materializes a `Set` of 5M numbers (~250–400 MB), and the `selectionChange` event
  copies it again (`src/core/Actions.ts:1974-1982`, `src/DataTable.ts:1095-1097`).
- **Full undo + redo stacks are serialized into every autosave** (1 s debounce): ~10–40 MB JSON
  per save at 1K columns with deep stacks (`src/persistence/serialization.ts:220-221`,
  `src/persistence/AutoSave.ts:32`); the same serialization runs synchronously in `beforeunload`
  (`AutoSave.ts:149-161`). Restore has an O(C²) splice loop (`serialization.ts:309-316`). Quota
  errors trip a silent one-shot circuit breaker (`AutoSave.ts:274-290`).
- Undo snapshots deep-copy 3 × 1K-string arrays + 2 Maps per captured action, 50 deep
  (`src/core/UndoManager.ts:27-36,205-225`).
- Vector derived columns ingest via ~5,000 literal `INSERT … VALUES` round-trips at 5M rows
  (`src/derived/DerivedColumnManager.ts:830-860`) and are deep-copied into session snapshots
  (`serialization.ts:41`).

### G. Export

- CSV/JSON exports accumulate the **entire dataset as JS strings** before Blob-wrapping
  (`src/export/CSVExport.ts:184-204`, `src/export/JSONExport.ts:157-189`,
  `src/export/ExportDialog.ts:644-675`), and the 10K-row batch pagination re-sorts per batch
  (`src/export/ExportQuery.ts:97-103,212-245`). The Parquet path (`COPY … TO` in the worker,
  `src/worker/dispatcher.ts:342-382`) is the sane pattern to generalize.

### H. Assets to build on (do not reinvent)

- Block fetch pipeline with dedupe/abort/epoch/prefetch (`src/table/TableBody.ts:667-908`), the
  two-priority worker queue + true cancellation (`src/worker/dispatcher.ts`), `QueryOptions`
  `{cache, priority}` (`src/data/WorkerBridge.ts:51-64`).
- The epoch / sequence stale-guard idiom (`TableBody.ts:199`, `BaseVisualization.ts:160`,
  `CrossfilterCoordinator.ts:53`).
- `runLimited` bounded concurrency (duplicated in `CrossfilterCoordinator.ts:133-146` and
  `StatsPanelCoordinator.ts` — hoist when touched).
- `filtersToWhereClause(filters, excludeColumn?)` (`src/filters/FilterSQL.ts:235`);
  `ExportQuery` SQL builders with the `__rowid__` determinism tiebreaker.
- `colIndexMap` O(1) column lookup (`src/table/TableBody.ts:367-378`); `.dt-width-spacer`
  scroll-geometry primitive (`src/table/VirtualScroller.ts:239-246,474-480`); flexbox rows with
  inline widths (no global width string) — ideal substrate for column windowing.
- Test seams: `LoaderContext` DI for Node-DuckDB (`src/worker/loaders/common.ts:17-20`),
  `tests/helpers/duckdbNode.ts`, `tests/helpers/tableBodyHarness.ts` (captures every SQL),
  `tests/browser/helpers/bigTable.ts` (generate → parquet → real `loadData`, row-id oracle),
  the `__…ForTests` @internal seam precedent (`src/worker/dispatcher.ts:85-106`).

## 6. Dataset tiers (canonical; defined precisely in Phase 0)

All tiers share one **column-class cycle** (`c % 20`): 0 = monotone INTEGER `col_0` (the row
oracle), 1–9 DOUBLE (~1% NULLs), 10–11 INTEGER, 12–14 categorical VARCHAR (cardinality 26), 15
ISO-timestamp string, 16 ISO-date string, 17 time string (15–17 force all three type-detection +
rewrite passes), 18 native TIMESTAMP, 19 BOOLEAN. Column names are `col_<i>`; every cell is
reproducible via `cellOracle(i, c, seed)`. Nothing large is ever committed — tiers are generated
on demand.

| Tier     | cols × rows                 | Steady RAM | Method                                                      | Used by                                       |
| -------- | --------------------------- | ---------- | ----------------------------------------------------------- | --------------------------------------------- |
| SMOKE    | existing committed fixtures | —          | files in `tests/fixtures/datasets/`                         | existing suites                               |
| WIDE_CI  | 300 × 20K                   | ~63 MB     | generate → parquet → real `loadData`                        | CI browser smoke                              |
| WIDE     | 1,000 × 100K                | ~1.04 GB   | generate → parquet → real `loadData`                        | column-scale phases (P2–P6)                   |
| WIDE-CSV | 1,000 × 5K                  | ~52 MB     | in-page CSV string                                          | load-path phase (text formats)                |
| GRID     | 200 × 500K                  | ~1.04 GB   | generate → parquet → real `loadData`                        | cross-axis interaction                        |
| DEEP     | 20 × 5M                     | ~1.04 GB   | generate → parquet → real `loadData`                        | row-scale phases (P7, P8, P11)                |
| TARGET   | 1,000 × 5M                  | file only  | worker-side streamed `COPY … TO` parquet (~150–400 MB file) | P10 direct-scan mode; probes only before that |

The three ~100M-cell tiers (WIDE, GRID, DEEP) deliberately have the same cell count with
different aspect ratios, so a fix on one axis can be shown not to regress the other.

## 7. Phase index and dependencies

| Phase | File                                                                         | Size | Depends on | One-line goal                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | [phase-00-harness.md](./phase-00-harness.md)                                 | L    | —          | Tier generators, demo `?gen=` harness + metrics readout, bridge query-stats seam, load perf marks, Playwright wide-table helper + column oracle, budgets file, baseline capture |
| 1     | [phase-01-load-path.md](./phase-01-load-path.md)                             | L    | 0          | ≤1 table rewrite at load, batched type probes, zero-copy ingest, honest progress, DuckDB config                                                                                 |
| 2     | [phase-02-lazy-visualizations.md](./phase-02-lazy-visualizations.md)         | L    | 0          | `loadData` resolves at first interactive paint; visualizations become lazy, cached, staleness-aware; `vizReady` event                                                           |
| 3     | [phase-03-body-column-windowing.md](./phase-03-body-column-windowing.md)     | L    | 0          | Body renders only the visible column window (+ pinned) behind flexbox spacers                                                                                                   |
| 4     | [phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md) | M/L  | 2, 3       | Headers window the same way; incremental header updates replace wipe-and-rebuild                                                                                                |
| 5     | [phase-05-projection-clipping.md](./phase-05-projection-clipping.md)         | M    | 3, 4       | Row fetches SELECT only the padded column window; caches merge partial rows; byte-bounded caches                                                                                |
| 6     | [phase-06-interaction-sweep.md](./phase-06-interaction-sweep.md)             | M/L  | 3, 4, 5    | Resize/pin/keynav smooth at 1K cols; searchable column picker                                                                                                                   |
| 7     | [phase-07-rank-index.md](./phase-07-rank-index.md)                           | M/L  | 0, 1       | Sorted/filtered scrolling via a materialized `__rowid__`→rank index; O(block) at any depth                                                                                      |
| 8     | [phase-08-selection-model.md](./phase-08-selection-model.md)                 | M    | 0          | `selectedRows` becomes `explicit \| all-except`; select-all at 5M allocates ~nothing                                                                                            |
| 9     | [phase-09-persistence-undo.md](./phase-09-persistence-undo.md)               | M    | 8          | Bounded autosave payloads, snapshot sharing, O(C) restore, loud quota handling                                                                                                  |
| 10    | [phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md)               | L    | 1, 2, 5, 7 | Query Parquet directly (no materialization); CSV/JSON→Parquet once in worker; memory guardrails; unlocks TARGET                                                                 |
| 11    | [phase-11-bulk-transfer.md](./phase-11-bulk-transfer.md)                     | M/L  | 7, 8, 10   | Streaming exports via `COPY TO`, clipboard caps, Arrow-based vector ingestion                                                                                                   |
| 12    | [phase-12-docs-integration.md](./phase-12-docs-integration.md)               | S/M  | all        | Docs tell the truth with measured numbers; final full-matrix verification                                                                                                       |

Executing in numeric order satisfies every dependency. (P7/P8 could technically run before P3–P6;
do not reorder unless the user asks — STATUS.md assumes numeric order.)

## 8. Execution protocol for phase agents

### 8.1 Session start

1. `git checkout feat/large-scale-support && git pull` (if a remote exists). Confirm a clean
   working tree. **Never commit to `main`.**
2. `npm ci` if `node_modules` is missing or stale; `npx playwright install chromium` if browser
   tests will run.
3. Read this README, then [`STATUS.md`](./STATUS.md) (previous agents' handoff notes may adjust
   your phase), then your phase doc. Mark your phase `in progress` in STATUS.md as your first
   commit (see 8.5).

### 8.2 Targeted review before coding

Your phase doc lists the files to read and the assumptions to re-verify. Line references
throughout this plan are anchors from the branch point — **re-locate them** (the code moves as
phases land). If a load-bearing assumption no longer holds, write what you found in STATUS.md
under your phase, adapt using the phase doc's stated fallback, and continue; if there is no
stated fallback and the change invalidates the phase's approach, stop and report rather than
improvising a redesign.

### 8.3 Repo conventions (from CONTRIBUTING.md / DEVELOPMENT.md — binding)

- **Commits**: imperative mood, sentence case, **no `feat:`/`fix:`/`chore:` prefixes**, subject
  < 72 chars, body explains why. One logical change per commit. Commit at the milestones your
  phase doc marks — never one giant commit at the end.
- **Code**: `dt-` class prefix on all rendered elements (respect `classPrefix`); errors are
  `DataTableError` subclasses with `SCREAMING_SNAKE_CASE` codes chained via `cause`; **no
  `console.log`** in library code — emit `warning`/`error` events; internal signals
  (`createSignal`/`computed`/`batch`) stay unexported.
- **Public API changes** require: JSDoc with `@example`, `docs/api-reference.md` entry, a
  changeset, and an API-surface snapshot update (`npx vitest -u`, then verify the diff is only
  what you intended). `@internal` `__…ForTests` seams are not public API (precedent:
  `src/worker/dispatcher.ts:85-106`).
- **Changesets**: `npx changeset` for anything user-visible; Keep-a-Changelog headings (`Added` /
  `Changed` / `Fixed` / `Changed (breaking)` + `Migration` notes). Per decision §2.1, prefer new
  defaults + migration notes over opt-in flags.
- **Tests** mirror `src/` under `tests/`; default env is node, opt into DOM with
  `// @vitest-environment jsdom`; browser specs are `*.spec.ts` under `tests/browser/` (vitest
  ignores them); wall-clock assertions only behind `RUN_DUCKDB_PERF` / `RUN_BROWSER_PERF` /
  `RUN_BASELINE` env gates.
- **CSS variables**: if you touch `src/styles/`, `npm run check:css-vars` must pass (sync the
  table in `docs/guides/theming.md`).

### 8.4 Gates — all must pass before your final commit

```
npm run lint
npm run format:check        # includes plans/**/*.md — run `npx prettier --write plans/` after editing plan docs
npm run typecheck
npm run test:coverage
npm run build
npm run size
npm run docs:api:check
npm run test:browser        # needs: npx playwright install chromium
```

Plus your phase doc's own programmatic verification (budgets, invariants) and its manual
Claude-in-Chrome script instantiated from
[`templates/verification-chrome.md`](./templates/verification-chrome.md). Perf-gated suites
(`npm run test:perf`, `RUN_BROWSER_PERF=1 npx playwright test`) run when your phase doc says so.

If a pre-existing gate failure blocks you (i.e., it fails on a clean checkout before your
changes), record it in STATUS.md and proceed — you own regressions you introduce, not inherited
breakage. Verify inheritance with `git stash` before concluding.

### 8.5 STATUS.md protocol

- First commit of your session: set your phase's row to `in progress` with the date.
- Last commit: set it to `done`, and fill your **Handoff notes** section: what changed vs the
  phase doc's assumptions, new/renamed files, budget values you set or tightened, baseline
  deltas (before/after numbers), anything the next phase must know (including line-number drift
  in files the next phases reference).
- If you had to deviate from the phase doc, say so explicitly and why.

### 8.6 Baselines

Phase 0 establishes `plans/scaling/baselines/` (JSON per tier + a generated markdown matrix via
`npm run perf:baseline` / `perf:baseline:report`). Phases that claim a performance improvement
re-run the baseline capture for their affected tiers and commit the new JSON — the report then
shows before/after by git SHA. Never overwrite old baseline JSONs; they are append-only history.

### 8.7 Manual verification via Claude in Chrome

Every phase ends with a browser session driven through the Claude-in-Chrome MCP tools against the
local Vite demo, following [`templates/verification-chrome.md`](./templates/verification-chrome.md)
instantiated with your phase's tier, params, and assertions. Ground rules baked into the
template: never click `#file-input` (native chooser), never trigger downloads/clipboard/native
dialogs, poll readiness instead of sleeping, and finish with a console error sweep. Attach the
final metrics snapshot (and screenshots where the template says so) to your STATUS.md handoff.

## 9. Deferred and rejected (with rationale — cite these instead of re-deciding)

| Item                                                | Status       | Rationale                                                                                                                                                                                 |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow IPC for row blocks across the worker boundary | **Deferred** | Phase 5's projection clipping cuts block payloads ~25×; Arrow adds bundle weight + a bridge rewrite. Re-evaluate only if Phase 5 metrics still show serialization > 20% of block latency. |
| wasm64 / Memory64                                   | Rejected     | No stable duckdb-wasm 64-bit distribution; Safari lag. Direct-scan (P10) is the strategy for >4 GB working sets.                                                                          |
| SharedArrayBuffer / COOP+COEP threads by default    | Rejected     | The library cannot impose response headers on host apps; auto bundle selection already uses `coi` when `crossOriginIsolated`. P12 documents the opt-in.                                   |
| Server-side / hybrid compute                        | Rejected     | Library identity is client-side; remote data is covered by URL range-scans in P10.                                                                                                        |
| Shadow DOM isolation                                | Rejected     | Orthogonal to scale; `classPrefix` exists.                                                                                                                                                |
| Multiple DuckDB connections / parallel queries      | Rejected     | Single WASM thread serializes execution anyway; the two-priority queue + cancellation is the right model.                                                                                 |
| IndexedDB row-cache spill                           | Rejected     | Refetching from DuckDB is faster and simpler.                                                                                                                                             |
| Streaming CSV parse with row-level progress         | Deferred     | duckdb-wasm owns the parse; P1's byte-level read progress + honest stage reporting is the achievable granularity.                                                                         |
| Column-group/band headers                           | Rejected     | Feature work, not scale work; P6's column picker is the scale-relevant management tool.                                                                                                   |
| OffscreenCanvas / worker viz rendering              | Deferred     | P2 (lazy) + P4 (windowed) cap live canvases at O(visible); no evidence of need after that.                                                                                                |

## 10. Glossary

- **Tier** — a named synthetic dataset spec (§6), generated on demand, never committed.
- **Row oracle** — the invariant `data-row-id === data-row-index` (+ `col_0` cell text = row
  index) that holds whenever the table is unsorted and unfiltered; probed continuously in
  browser tests (`tests/browser/helpers/bigTable.ts` pattern).
- **Column oracle** — the Phase-0 analogue for the column axis: rendered `data-column` sequence
  equals the expected slice of `visibleColumns`, and sampled cell text matches
  `cellOracle(i, c, seed)`.
- **Column window** — the contiguous run of columns rendered in the DOM (visible + overscan +
  pinned) once Phases 3–4 land.
- **Rank index** — Phase 7's temp table mapping `__rowid__` → position under the current
  sort+filter, making deep sorted scroll O(block).
- **Direct-scan mode** — Phase 10's load strategy: the dataset stays in a Parquet file (memory,
  OPFS, or URL) queried through a view; no table materialization.
- **Budgets** — named numeric limits in `tests/budgets.ts` (Phase 0): machine-independent
  invariants (query counts, DOM counts, byte sizes, oracle violations) assert in default runs;
  wall-clock budgets only under env-gated perf runs.
- **Gates** — the eight commands in §8.4.
- **Epoch guard** — the existing stale-async-result idiom (bump a counter on state change; drop
  results tagged with an old epoch). Copy it for any new async fan-out.
