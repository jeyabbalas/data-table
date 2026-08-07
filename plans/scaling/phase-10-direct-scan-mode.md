# Phase 10 — Big-data direct-scan mode and memory guardrails

Size: **L** · Depends on: **Phases 1, 2, 5, 7** · Blocks: **Phase 11 (exports read through the
view), Phase 12**

---

## 1. Context

Read [`README.md`](./README.md) (whole file), then [`STATUS.md`](./STATUS.md) — especially the
Phase 1, 2, 5, and 7 handoff sections, whose seams this phase consumes — then this document.
This phase breaks the 4 GB WebAssembly ceiling for the combined **TARGET tier (1,000 × 5M)**:
Parquet sources are queried **directly through a VIEW over
`read_parquet(…, file_row_number = true)` with no CTAS materialization** and (where the pinned
duckdb-wasm API allows) no full-file buffer copy; oversized CSV/JSON sources are converted
**once**, in the worker, to Parquet and then direct-scanned; and the load path gains estimated-
footprint guardrails, a surfaced DuckDB `memory_limit`, and graceful memory-exceeded errors.
README §2.2: this phase is user-approved as in scope — the mandatory feasibility spike
(Milestone 1) may narrow it, but not cancel it.

Hard prerequisites and why: Phase 5 (projection clipping — reading 1,000 column chunks per
128-row block from Parquet is unusable; ~40 is fine), Phase 7 (rank index buildable over any
FROM-able relation — sorting/filtering a view has no other O(block) path), Phase 2 (bounded viz
fan-out — every viz query is now a file scan), Phase 1 (typed single-pass loader seam, reused by
the CSV/JSON conversion path; DuckDB config plumbing for `memory_limit`).

## 2. Problem statement

- Every loader materializes the source as a DuckDB table:
  `CREATE TABLE … AS SELECT row_number() … AS __rowid__, * FROM read_parquet(…)`
  (`src/worker/loaders/parquet.ts:92`). 1K × 5M ≈ 40 GB uncompressed — it can never fit; even
  1K × 1M doubles = 8 GB (README §3). The TARGET tier is reachable only by querying the file.
- The registered source file is dropped in a `finally` right after the CTAS
  (`src/worker/loaders/parquet.ts:124-127`) — the current loader cannot leave a file queryable.
- URL sources are fully fetched on the **main thread** (`src/data/DataLoader.ts:59-76`) before
  a byte reaches the worker; `registerFileURL` HTTP range reads would skip that entirely.
- There is no `memory_limit`, no footprint check, and no typed OOM error: DuckDB config sets
  only `castDecimalToDouble` (`src/worker/duckdb.ts:44`; Phase 1 may have added config — re-
  verify), and a DuckDB OOM surfaces as a generic `QUERY_RUNTIME` (`src/core/errors.ts:351`).
- Nothing in the API lets a caller choose or observe a load strategy; nothing refuses a load
  that is guaranteed to OOM, with an actionable message.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- STATUS.md handoffs for Phases 1, 2, 5, 7: the Phase 1 `LoadPayload` shape (zero-copy ingest
  changed it), the exact `memory_limit` value/plumbing Phase 1 configured, Phase 5's projection
  window width, Phase 7's rank-index builder entry point and its "any FROM-able relation"
  contract, and any line-drift notes for the files below.
- Pinned duckdb-wasm registration APIs (verified at 1.33.1-dev57.0; re-verify after any bump) —
  `node_modules/@duckdb/duckdb-wasm/dist/types/src/parallel/async_bindings.d.ts:108-137`:
  `registerFileText` (:110), `registerFileURL(name, url, proto, directIO)` (:112),
  `registerFileBuffer` (:116), **`registerFileHandle<HandleType>(name, handle, protocol,
directIO)` (:118 — present in the async bindings)**, `registerOPFSFileName` (:120), plus
  `dropFile`/`dropFiles`, `copyFileToBuffer`, `globFiles`. `DuckDBDataProtocol` enum
  (`…/bindings/runtime.d.ts`): `BUFFER=0, BROWSER_FILEREADER=2, BROWSER_FSACCESS=3, HTTP=4`.
  `DuckDBConfig` (`…/bindings/config.d.ts`): `opfs.fileHandling: 'auto'|'manual'`,
  `filesystem.allowFullHTTPReads/forceFullHTTPReads`.
- `src/worker/duckdb.ts:17-48` — init + `db.open({...})` (config merge point), `getDatabase`,
  `getConnection` singletons.
- `src/worker/loaders/parquet.ts` (whole file) — reserved-name DESCRIBE preflight (:80-86),
  the CTAS you are bypassing (:92), `enhanceSchemaTypes` call (:108), the `finally` dropFile
  (:124-127) that direct mode must **not** inherit.
- `src/worker/loaders/common.ts` — `LoaderContext` DI seam (:17-20), `quoteIdentifier` (:26),
  `makeReservedColumnError` (:34), the Phase 1 typed single-pass detection seam (was
  :292-451 — re-locate; the conversion path reuses it).
- `src/worker/dispatcher.ts:257-340` (load case; progress emits), `:342-382` (export case —
  the in-worker `COPY (…) TO '<file>'` + `copyFileToBuffer` precedent the conversion path
  generalizes), `src/worker/types.ts:41-45` (`LoadPayload`), `:67-74` (`ProgressPayload`).
- `src/data/DataLoader.ts:49-114` — main-thread fetch/`.arrayBuffer()` you bypass for direct
  URL/File sources; `classifyStringSource` (:129); `DataLoaderOptions` (:24-27).
- `src/data/WorkerBridge.ts:353-393` — `loadData` / `exportToBuffer` signatures; Phase 0 stats
  seam (`__getStatsForTests`).
- `src/core/Actions.ts:516-598` — `loadData` flow: `resetTableState`, state writes
  (`tableName`, `baseTableName`, `totalRows`), session restore keyed on `result.tableName`
  (:549-550). `LoadDataOptions` (:68-75). `getColumnValues` (:1782, reads the effective table).
- `src/table/TableBody.ts:838-877` — the density valve: the `__rowid__` fast path demands
  **dense integers `blockStart … blockStart+limit-1`, exactly `limit` rows**; a violation
  permanently disables the fast path and warns. This is the contract `file_row_number` must
  satisfy.
- `src/derived/DerivedColumnManager.ts:908-978` — `recreateView()`: CTE stack whose base is
  `FROM <baseTableName> t` + vector helper tables `LEFT JOIN … ON t.__rowid__ = hN.__rowid__`
  (:943-945, explicitly **not** the `rowid` pseudo-column — load-bearing: views have none).
- `src/persistence/serialization.ts:153-174` — `snapshotFromState` stores `tableName:
baseTableName ?? tableName` and **no source descriptor**: every mount already re-provides
  the source and restores state keyed by table name. Direct mode inherits this contract as is.
- `src/core/errors.ts:9-26` (code-prefix table), `reconstructError` (:287-352) — `LOAD_*` →
  `LoadError`, `QUERY_*` → `QueryError`; new codes below need **no** new mapping branches.
- `src/core/TableEvents.ts:93-110` — the `warning` event `{ code, message, details }`.
- `src/core/checkBrowserSupport.ts` (55 lines) — sync probe list; OPFS integration point.
- Phase 0 artifacts: `tests/fixtures/tiers.ts` (`targetCopySQL` writes `dt_target.parquet`
  into worker MEMFS), `demo/perf.ts` (`gen=target` currently forces `mode=sql`),
  `tests/budgets.ts` (`BIGDATA` placeholder namespace; confirm the exported object name),
  `tests/helpers/duckdbNode.ts`, `vite.demo.config.ts:68-76` (`/fixtures` dev middleware —
  serves `tests/fixtures/datasets/*`, used by the URL spike; never commit generated files).

## 4. Design (spike first — §4.1 findings gate everything after it)

### 4.1 Milestone 1 — feasibility spike (worker-side; **no `src/` changes**)

Drive from a `RUN_SPIKE=1`-gated Playwright spec (`tests/browser/spike-direct-scan.spec.ts`,
committed for reproducibility) against the Phase 0 harness (`?gen=target&mode=sql`), plus a
Node pre-step using `tests/helpers/duckdbNode.ts` to write a TARGET-tier Parquet to
`tests/fixtures/datasets/` for the URL path (gitignore or delete it; never commit). Measure
heap as order-of-magnitude via `performance.memory` (template caveat applies). Answer five
named questions; each gets a GO/NO-GO row:

- **S-REG — registration without a full copy.** For a >1 GB-scale Parquet (TARGET file, or a
  scaled-down + extrapolated one if generation time forces it): (i) `registerFileURL(name,
url, DuckDBDataProtocol.HTTP, false)` against the Vite dev server (HTTP range reads —
  confirm with `read_network_requests`/server log that requests are ranged, not full); (ii)
  `registerFileHandle(name, file, DuckDBDataProtocol.BROWSER_FILEREADER, true)` with a `File`
  posted into the worker (structured-cloneable); (iii) `registerOPFSFileName('opfs://…')`
  after writing via `COPY … TO 'opfs://…'` (test whether COPY-to-OPFS works at this pin) or
  via `createSyncAccessHandle`; (iv) baseline `registerFileBuffer` (the known full-copy worst
  case). For each: run `COUNT(*)`, DESCRIBE, and a deep 128-row window; record WASM/JS heap
  before/after. **GO** per source kind if probes succeed with heap growth ≪ file size (< 25%).
- **S-ROWID — `file_row_number` semantics.** Over `read_parquet(f, file_row_number = true)`:
  `COUNT(*)`, `MIN/MAX(file_row_number)`, `COUNT(DISTINCT file_row_number)`, and repeated
  `WHERE file_row_number BETWEEN k AND k+127` windows at k ∈ {0, 2.5M, 4,999,000} — assert
  dense `0..N-1`, exactly-128 windows, identical values across repeated queries and through a
  VIEW wrapper. **GO** = matches the density valve's contract (`TableBody.ts:838-877`).
  **NO-GO = stop the phase and report** (README §8.2) — there is no fallback rowid that keeps
  block fetches O(block).
- **S-PUSH — predicate/projection pushdown.** `EXPLAIN ANALYZE` + wall time at TARGET scale
  for: (i) a `file_row_number` range block fetch projecting ~40 columns (row-group pruning?),
  (ii) a single-column histogram-shaped aggregate (column-chunk pruning — should be
  O(column)), (iii) both through a `CREATE VIEW` wrapper (must not defeat pushdown), (iv) both
  through a derived-style CTE view with a `LEFT JOIN` helper table on `__rowid__`
  (`DerivedColumnManager.recreateView` shape). Record ms per shape. **GO** if view-wrapped
  times are within ~2× of bare `read_parquet` and block fetches are interactive-class.
- **S-RANK — Phase 7 rank index over the view at TARGET.** Build the rank index (use Phase
  7's actual builder SQL — re-verify its entry point from STATUS.md) over the spike view on
  `col_1`: build ms, heap delta, then one deep sorted block fetch through it. **GO** if build
  completes within tens of seconds and heap stays ~1 GB-class; record the numbers — they
  become the `TARGET_SORT_BUILD_MS` budget.
- **S-OPFS — availability matrix.** Desk research + runtime probe (`navigator.storage
?.getDirectory`, `createSyncAccessHandle` in a worker) for Chrome/Edge, Firefox, Safari.
  Deliverable: a support table and whether OPFS is usable as (a) conversion target, (b)
  source registration. OPFS must remain **optional** — NO-GO only reorders fallbacks.

**Deliverable (the M1 commit):** a findings table (capability | probe | result | heap | ms |
GO/NO-GO) appended to this file under §4.1 **and** to your STATUS.md section, plus the chosen
scope line for each milestone below. Scope-reduction ladder, worst-case first: if every S-REG
kind is NO-GO, ship **keep-buffer-but-no-CTAS** (register the buffer, build the view, skip
materialization — still halves peak memory and kills the rewrite cost; retune
`TARGET_HEAP_MB`); if only URL is GO, ship URL-first and leave File/OPFS registration as
documented follow-ups; if S-OPFS is NO-GO, the conversion path targets worker MEMFS instead.

### 4.2 Load strategy — public option (Milestones 3+; kinds shipped per **S-REG**)

```ts
export type LoadStrategy = 'materialize' | 'direct' | 'auto';
```

- `loadStrategy?: LoadStrategy` (default `'auto'`) on `CreateDataTableOptions`
  (`src/DataTable.ts:123` block) and on `LoadDataOptions`/`DataLoaderOptions`; plumbed through
  `DataLoader` → `WorkerBridge.loadData` → dispatcher `LoadPayload` (extend Phase 1's payload:
  `strategy: 'materialize' | 'direct'` — `auto` resolves on the main thread where the
  estimator lives, so the worker only ever sees a resolved strategy).
- `LoadResult` (`src/data/DataLoader.ts:17-22`) and the `loadComplete` payload gain
  `strategy: 'materialize' | 'direct'` so apps/tests/the perf panel can observe the choice.
- `auto` resolution: `materialize` iff `estimatedTableBytes × 2.2 ≤ memoryLimitBytes` (2.2 =
  CTAS transient factor, README §3), else `direct` for Parquet-able sources; for CSV/JSON
  above the materialize bound, `direct` implies the conversion path (§4.4) and is chosen only
  if conversion itself fits (§4.5) — otherwise **refuse**, never wedge.
- Direct-mode source descriptors (per S-REG GO set): URL strings skip the main-thread fetch
  entirely (send `{ kind: 'url', url }`; worker calls `registerFileURL(…, HTTP, false)` —
  document the CORS/range-request requirement); `File` objects are posted as-is (no
  `.arrayBuffer()`) and registered via `registerFileHandle(…, BROWSER_FILEREADER, true)`;
  `ArrayBuffer`/inline sources register the buffer (this is also the universal fallback).

### 4.3 Direct Parquet load (Milestone 3; conditional on **S-ROWID GO** — hard gate)

New worker-side `loadParquetDirect(source, options, context?)` beside `loadParquet`, same
`LoaderContext` DI for Node tests:

1. Register the source under `<tableName>.parquet` per descriptor kind — and **do not drop it**;
   the registration now lives as long as the table. Drop any previous registration/view of the
   same name first (re-load path), and extend worker cleanup so `destroy`/next-load unregisters.
2. Reserved-name preflight (`DESCRIBE SELECT * FROM read_parquet('<f>')`, as
   `parquet.ts:80-86`): reject `__rowid__` **and** — direct mode only — `file_row_number`
   (both via `makeReservedColumnError`-style `LOAD_RESERVED_COLUMN_NAME`).
3. `CREATE OR REPLACE VIEW <tableName> AS SELECT CAST(file_row_number AS BIGINT) AS
__rowid__, * EXCLUDE (file_row_number) FROM read_parquet('<f>', file_row_number = true)`.
   **No CTAS anywhere in this path** — that is the `TARGET_NO_CTAS` budget.
4. Row count via `COUNT(*)` on the view (S-PUSH says whether this is metadata-fast; if the
   spike found `parquet_file_metadata` materially faster, use it); schema from `DESCRIBE` on
   the view; **no `enhanceSchemaTypes`** — a view cannot be rewritten. Parquet columns keep
   their file types; ISO-timestamp **strings** stay VARCHAR (degradation surfaced per §4.5).
5. Return `LoadResult` with `strategy: 'direct'`. Everything downstream (`Actions.loadData`
   state writes, `baseTableName`, session restore, derived manager base) is untouched — the
   view answers to the table name.

### 4.4 CSV/JSON above threshold → convert once, then direct-scan (Milestone 4)

For text sources whose estimated table exceeds the materialize bound but whose conversion
fits: register the text, run Phase 1's typed single-pass detection (probes only — retarget its
seam), then **one** `COPY (SELECT <typed projection> FROM read_csv/read_json(…)) TO
'<name>.parquet' (FORMAT PARQUET, ROW_GROUP_SIZE …)` into OPFS if **S-OPFS GO** else worker
MEMFS (the dispatcher export case `:342-382` is the in-worker COPY precedent), drop the text
registration, then enter §4.3 at step 2 against the converted file. The typed projection means
the converted Parquet needs no later type enhancement. Emit honest `ProgressPayload` stages
(`parsing` during COPY, `analyzing` during probes). **Never auto-direct a source whose
conversion itself would exceed limits** — refuse per §4.5.

### 4.5 Memory guardrails (Milestone 2 — pure logic first, no strategy needed)

- **Footprint estimator** (main-thread, beside `DataLoader`): `rows × Σ bytesPerCell(type)`
  with the README §6 model (~10.4 B/cell for the tier mix) as documented constants: 8 for
  DOUBLE/BIGINT/TIMESTAMP/DATE/TIME, 4 INTEGER, 1 BOOLEAN, `16 + avgLen` VARCHAR (avg from a
  bounded sample probe). Inputs: Parquet — DESCRIBE + metadata row count (worker probe); CSV/
  JSON — byte length × a documented expansion factor when rows are unknown. Estimates are
  order-of-magnitude gates, not accounting — keep the constants in one exported table with a
  comment pointing at README §6.
- **`memory_limit`**: Phase 1 configures it (re-verify value + plumbing); this phase surfaces
  it — include `memoryLimitBytes` in every refusal's `details` and in docs; the estimator
  reads the same configured value rather than hardcoding.
- **Refusal / OOM codes** (per the `errors.ts:9-26` prefix table — no new subclasses, no new
  `reconstructError` branches): **`LOAD_MEMORY_EXCEEDED`** (`LoadError`) when estimation
  blocks `materialize` (explicit or auto-with-no-viable-strategy) or blocks conversion —
  message names the source size, the limit, and the actionable next step (use
  `loadStrategy: 'direct'`, convert to Parquet externally, or raise `memory_limit`);
  **`QUERY_MEMORY_EXCEEDED`** (`QueryError`) mapped in the worker when a DuckDB error message
  matches an out-of-memory shape (`/out of memory|failed to allocate/i` — verify exact
  phrasing against the pinned build), `details: { memoryLimitBytes }`.
- **Degradation warning**: on every direct-mode load, emit `warning`
  `{ code: 'DIRECT_MODE_DEGRADED', details: { features: [...] } }` (`TableEvents.ts:93-110`)
  listing the audit-confirmed degradations — minimum `'string-type-detection'`; plus whatever
  M5 confirms (e.g. vector-derived limits).

### 4.6 Feature-interaction audit (Milestone 5 — each row gets a test)

| Feature           | Expectation over the view                                                                                                                                                   | Verify                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Sort / filter     | Rank index builds over the view (Phase 7 contract); O(block) sorted scroll                                                                                                  | browser spec + S-RANK numbers                  |
| Visualizations    | Lazy + bounded (Phase 2); each query is a column-chunk scan                                                                                                                 | browser spec; budgets from S-PUSH              |
| Derived columns   | `recreateView` = VIEW over view; vector helper JOIN on explicit `__rowid__` works                                                                                           | browser spec; document vector limits at TARGET |
| Annotations       | Rowid-keyed; `file_row_number` is stable (S-ROWID)                                                                                                                          | browser spec                                   |
| Persistence       | Snapshot stores table name only (`serialization.ts:153-174`); restore = re-provide the source + `loadData`, state comes back — **identical to today's URL-source behavior** | browser spec (save → reload → restored)        |
| Export            | `ExportQuery` SQL + `COPY TO` read through the view; slice works (throughput = P11)                                                                                         | export-slice assert in the browser spec        |
| `getColumnValues` | Reads the effective table (the view); bounded only via `limit` — docs note for TARGET                                                                                       | spec asserts a `limit` read; docs updated      |

### 4.7 Demo / harness (Milestone 6)

`demo/perf.ts`: add `&strategy=materialize|direct|auto` to the param grammar (invalid →
panel error state, never a dialog); pass it to `loadData`; new readout field
`data-metric="strategy"` fed from `loadComplete.strategy`; **flip `gen=target` from forced
`mode=sql` to default `mode=load`** (generate the file worker-side via `targetCopySQL`, then
`loadData` the registered/OPFS/URL file per the shipped S-REG kind). A failed load (e.g.
deliberate `strategy=materialize` at target) must surface `error.code` in
`[data-metric="error"]` — that is the manual MEMORY_EXCEEDED probe.

### 4.8 Risk notes / fallbacks

- Registration kinds are independent: ship the GO subset; the buffer path is always the
  floor. Record exactly which kinds shipped in STATUS.md — Phases 11/12 phrase docs off it.
- If view-wrapping defeats pushdown (S-PUSH iii), try the table-function directly in the block
  SQL builder for the unsorted path before conceding — but the view is the API contract;
  a NO-GO here is a scope reduction (document higher latencies), not a redesign.
- If TARGET generation is too slow to iterate the spike, calibrate on a 1,000 × 1M file and
  extrapolate; run the full TARGET file once before writing final budget numbers.
- `QUERY_MEMORY_EXCEEDED` message-matching is inherently fuzzy — keep the regex conservative
  (false negatives degrade to today's `QUERY_RUNTIME`, which is safe).

## 5. Implementation milestones (commit at each)

**No milestone after 1 may touch `src/` until the M1 findings table is committed.** Milestones
2–7 each begin by restating (in the commit body) which spike outcomes they are conditioned on.

1. Feasibility spike per §4.1: gated spec + Node pre-step, findings table into this doc §4.1 +
   STATUS.md, GO/NO-GO + scope line per milestone. _No `src/` changes._ — _commit: "Record
   direct-scan feasibility spike findings"_
2. _(unconditional)_ Footprint estimator + strategy resolver (pure, unit-tested) +
   `LOAD_MEMORY_EXCEEDED` / `QUERY_MEMORY_EXCEEDED` mapping + `DIRECT_MODE_DEGRADED` warning
   plumbing + `memory_limit` surfacing. — _commit: "Add load footprint estimation and
   memory-exceeded errors"_
3. _(S-ROWID GO; source kinds per S-REG)_ `loadParquetDirect` + view creation + no-drop
   registration lifecycle + `LoadPayload`/dispatcher/bridge/`DataLoader` plumbing +
   `loadStrategy` and `LoadResult.strategy` public API (JSDoc + `@example`). — _commit: "Add
   direct-scan Parquet loading behind loadStrategy"_
4. _(target FS per S-OPFS)_ CSV/JSON single-pass conversion → Parquet → direct scan; refusal
   path for infeasible conversions; honest progress stages. — _commit: "Convert large CSV and
   JSON sources to Parquet in the worker"_
5. Feature-interaction suite per §4.6 at a WIDE_CI-sized direct-mode Parquet + `__rowid__`
   contract tests + SQL-shape (`TARGET_NO_CTAS`) assert + session-restore round-trip. —
   _commit: "Verify feature interactions over direct-scan views"_
6. Demo/harness per §4.7 + `BIGDATA` budgets filled from spike numbers + `RUN_BROWSER_PERF`
   TARGET spec + baseline capture with a `target` row. — _commit: "Enable the target tier in
   the demo harness via direct mode"_
7. Docs + changeset + API-surface snapshot per §10. — _commit: "Document load strategies and
   add the changeset"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size
npm run docs:api:check
npm run test:browser                    # includes the WIDE_CI direct-mode spec
RUN_BROWSER_PERF=1 npx playwright test tests/browser/direct-mode-target.spec.ts
npm run perf:baseline && npm run perf:baseline:report   # adds the target row
```

Phase-specific asserts (default runs, machine-independent):

- **`BIGDATA.TARGET_NO_CTAS`**: every SQL statement captured during a direct-mode load (Node
  DuckDB via `LoaderContext` with a recording connection) contains **zero** `CREATE TABLE …
AS` — the SQL-shape proof that nothing materializes.
- Strategy unit tests: estimator constants vs README §6 arithmetic; `auto` picks materialize
  under the bound and direct above it; explicit `direct`/`materialize` honored; explicit
  `materialize` above the bound and infeasible conversions reject with `LOAD_MEMORY_EXCEEDED`
  (assert `details.memoryLimitBytes` present); OOM-shaped worker errors map to
  `QUERY_MEMORY_EXCEEDED`; both codes reconstruct to `LoadError`/`QueryError` through
  `reconstructError` with no new branches.
- `__rowid__` contract over the view (micro tier in Node DuckDB): dense `0..N-1`, exact-128
  windows, stable across queries — the density valve's happy path; plus reserved-name
  preflight rejections for `__rowid__` and `file_row_number`.
- WIDE_CI direct-mode browser spec: `loadData(…, { loadStrategy: 'direct' })` → row + column
  oracles green; one sort (rank index over the view), one histogram brush filter, one
  expression + one vector derived column, one annotation, an `exportToBuffer` slice, a
  `getColumnValues` read with `limit`, and a session save → reload → state-restored
  round-trip; `DIRECT_MODE_DEGRADED` warning observed exactly once per load.
- Direct load issues ≤ `BIGDATA.DIRECT_LOAD_QUERIES_MAX` queries (set from the measured
  count + small headroom — registration/preflight/view/describe/count only).

RUN-gated (`RUN_BROWSER_PERF=1`, `test.setTimeout` generous): TARGET end-to-end — generate the
file, `loadData` direct, first paint ≤ `BIGDATA.TARGET_READY_MS` (30_000), heap ≤
`BIGDATA.TARGET_HEAP_MB` (1500), deep scroll / sort-build / histogram within the budgets M1
set from S-PUSH/S-RANK; baseline JSON committed (append-only, README §8.6).

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`?gen=target&viz=on&mode=load` (M6 shipped). Placeholders: `READY_BUDGET_MINUTES` = generation
budget from the Phase 0 target baseline + 1 min load; `LOAD_MS_EXPECTATION` = seconds, not
minutes (≤ 30 s post-generation); `SORT_COL` = `col_1`; `DOM_BUDGET`/`QUERY_BUDGET` from
`tests/budgets.ts`. Phase-specific deltas:

- Step 3: panel shows `strategy` = `direct`; `rows` = 5,000,000, `cols` = 1,000; `heapMB`
  ~1 GB-class (order of magnitude — not 4 GB).
- Step 4: deep scroll + jump to ~row 4,999,000 — placeholders resolve; row oracle spot-checks
  pass (direct mode is unsorted/unfiltered by default, so the oracle is valid).
- Step 5: horizontal sweep at 1,000 columns (Phase 3–5 windowing holds over a view).
- Step 6: sort `col_1` — expect a rank-index build of seconds (record the wall time and the
  query-count delta in STATUS.md against S-RANK's prediction).
- Step 7: one histogram brush filter + chip removal.
- Step 9: page-side `exportToBuffer` of 1,000 rows through the view.
- **Extra step (refusal path)**: open a second tab at
  `?gen=target&mode=load&strategy=materialize` — the panel must reach `data-state="error"`
  with `LOAD_MEMORY_EXCEEDED` in `[data-metric="error"]`, no dialog, no console **error**
  (the refusal is graceful; a `warning` event is fine). Screenshot it.
- Step 11: zero new console errors across the session; attach the final
  `window.__dtPerf.refresh()` snapshot + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] M1 findings table committed (this doc §4.1 + STATUS.md) **before any `src/` change**;
      every later milestone's commit body names its spike conditions.
- [ ] All §6 commands green; `npm run size` within budget (the loader growth is worker-side).
- [ ] `TARGET_NO_CTAS` asserted in a default run; direct load provably never materializes.
- [ ] TARGET tier loads end-to-end via the demo harness: first paint in seconds, heap
      ~1 GB-class, deep scroll + sort + filter usable (RUN-gated spec + manual session).
- [ ] Refusal path demonstrated: explicit materialize at TARGET → graceful
      `LOAD_MEMORY_EXCEEDED` with actionable message + `memoryLimitBytes` detail.
- [ ] Every §4.6 row has a passing test; degradations surfaced via `DIRECT_MODE_DEGRADED`.
- [ ] Session restore of a direct-mode table matches the documented contract (source
      re-provided, state restored) with a test proving it.
- [ ] Baselines: `target` row captured and committed; budgets filled with measured numbers.
- [ ] Public API additions have JSDoc + `@example`, docs entries, changeset, and an
      API-surface snapshot diff containing only the intended members.
- [ ] STATUS.md row + handoff filled per §11.

## 9. Out of scope

Export throughput and streaming export UX (Phase 11 — it reads through the view; leave it a
STATUS note on the shipped registration kinds); Arrow-based vector ingestion (Phase 11);
wasm64 / SharedArrayBuffer (rejected, README §9); server-side compute (rejected, README §9);
revising AGENTS.md / docs latency claims (Phase 12 — leave a note, do not edit the claims);
type-enhancement rewrites for direct-scanned Parquet (documented limitation instead); making
OPFS a hard requirement anywhere.

## 10. Docs / changeset obligations

- **Changeset (MINOR)** — `Added`: `loadStrategy` option, `LoadResult.strategy`,
  `LOAD_MEMORY_EXCEEDED` / `QUERY_MEMORY_EXCEEDED` error codes, `DIRECT_MODE_DEGRADED`
  warning; `Changed`: large sources now auto-select direct-scan instead of failing near the
  memory ceiling (migration note: pass `loadStrategy: 'materialize'` to force the old
  behavior, and expect `LOAD_MEMORY_EXCEEDED` instead of an opaque OOM).
- `docs/guides/loading-data.md`: major "Load strategies and very large files" section —
  strategy semantics, auto thresholds + the bytes-per-cell model, per-source-kind direct
  support (URL/CORS + range-request requirement, File, buffer, OPFS as shipped), the
  conversion path, direct-mode limitations (string type detection, `getColumnValues` limits,
  vector-derived caveats), session-restore contract.
- `docs/performance.md`: tier-matrix row for TARGET with measured numbers; note which
  budgets are RUN-gated.
- `docs/troubleshooting.md`: entries for `LOAD_MEMORY_EXCEEDED` (what it means, the three
  remedies) and `QUERY_MEMORY_EXCEEDED` (raise `memory_limit`, reduce working set).
- `src/core/checkBrowserSupport.ts` docs **only if** an OPFS probe shipped (it must be
  non-fatal/informational — OPFS is optional); otherwise untouched.
- AGENTS.md: do **not** revise the "no latency guarantees" claim (Phase 12); add a one-line
  pointer that Phase 10 landed direct-scan mode, so Phase 12 knows to rewrite it.
- API-surface snapshot: `npx vitest -u`, verify the diff is exactly the new public members.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the complete spike findings table (all
five S-\* rows with numbers); which registration kinds shipped and which were deferred (with
the measured heap figures that justified it); the final auto-threshold formula and
`memory_limit` value surfaced; all `BIGDATA` budget names + values (marking which are
RUN-gated); TARGET baseline headline numbers (readyMs, heapMB, sort-build ms, block-fetch
p95); the confirmed degradation list emitted by `DIRECT_MODE_DEGRADED`; any line-anchor drift
in `parquet.ts` / `dispatcher.ts` / `DataLoader.ts` for Phase 11 (which reads exports through
the view and needs the registration lifecycle you built); and the manual-session snapshot +
screenshot paths, including the refusal-path screenshot.
