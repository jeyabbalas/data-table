# Phase 1 — Load path: single-pass typed materialization, real progress, zero-copy ingest

Size: **L** · Depends on: **Phase 0** · Blocks: **Phase 7 (rank index), Phase 10 (direct-scan)**

---

## 1. Context

Read [`README.md`](./README.md) (whole file), [`STATUS.md`](./STATUS.md), then this doc. This
phase makes the materialized load path do minimum work: one full-table write instead of up to
four, O(1)-ish type probes instead of O(VARCHAR-cols × 3), zero redundant main-thread copies of
the source bytes, honest progress reporting, and sane DuckDB configuration at init. It also
establishes the seam Phase 10 retargets: loaders factored as **"detect types on a sample →
materialize once with explicit types"**, so the direct-scan phase can swap the materialization
step for CSV/JSON→Parquet conversion without re-touching detection.

Relevant README sections: §3 (2× transient copy + 4–5 source-byte copies), §5.B (rewrite chain),
§5.C (full-buffer ingest), §5.A last bullet (per-VARCHAR probes), §9 ("Streaming CSV parse"
deferred — byte-level read progress is the achievable granularity). Phase 0 artifacts consumed
here (see [phase-00-harness.md](./phase-00-harness.md)): `tests/fixtures/tiers.ts` (tier specs,
`tierCSV`, `cellOracle`), the bridge `__getStatsForTests` seam, `dt:load:*` marks, the demo
`?gen=` harness with `#dt-perf-panel` / `window.__dtPerf`, `tests/budgets.ts`, and the baseline
JSONs under `plans/scaling/baselines/`.

## 2. Problem statement

All anchors verified at the branch point (`c326e9e`); re-locate before coding (§3).

- **Up to 4 full-table materializations per load.** The initial
  `CREATE OR REPLACE TABLE … AS SELECT row_number() … __rowid__, * FROM read_xxx(…)`
  (`src/worker/loaders/csv.ts:128`, `json.ts:142`, `parquet.ts:92`) is followed by up to three
  sequential `CREATE TABLE __temp_… AS SELECT [TRY_CAST(col)] … ORDER BY "__rowid__"` + `DROP` +
  `ALTER … RENAME` rewrites — one per converted type class
  (`src/worker/loaders/common.ts:292-345` timestamp, `:355-398` date, `:408-451` time). Each is a
  full copy plus a full sort at ~2× transient memory, uncancelable
  (`src/worker/dispatcher.ts:389-404`: for `load` tasks `cancelSent()` cannot interrupt
  `conn.query`).
- **O(VARCHAR-cols × 3) serialized probe queries.** `detectTimestampColumns` /
  `detectDateColumns` / `detectTimeColumns` (`common.ts:144-278`) each issue
  `SELECT DISTINCT "col" … WHERE "col" IS NOT NULL LIMIT 100` per column per pass, then classify
  in JS (`isISOTimestamp` `:92`, `isISODate` `:105`, `isTimeFormat` `:118`, threshold 0.95).
  `SELECT DISTINCT` on a low-cardinality column is a full-scan hash aggregate — at DEEP scale
  that is 5M rows per categorical column per pass. `enhanceSchemaTypes` also re-issues `DESCRIBE`
  between passes and at the end (`common.ts:499,516,530`). Statement count per CSV load =
  5 fixed (`SET TimeZone` `csv.ts:55`, preflight `DESCRIBE` probe `:112-114`, CTAS, `COUNT`
  `:136`, `DESCRIBE` `:140`) + V + (V−T₁) + (V−T₁−T₂) probes + up to 9 rewrite statements + up to
  3 refresh `DESCRIBE`s. At WIDE-CSV (1,000 cols, 300 VARCHAR under the tier cycle): **~770
  statements and 4 full-table writes**. At WIDE_CI (300 cols): ~240 statements.
- **4–5 copies of the source bytes.** Main thread materializes the whole source
  (`src/data/DataLoader.ts:59` File `.text()`/`.arrayBuffer()`, `:76` URL), `postMessage` clones
  it with **no transfer list** (`src/data/WorkerBridge.ts:507`), the CSV loader re-encodes
  string→bytes (`csv.ts:58-59`), the JSON loader decodes ArrayBuffer→string (`json.ts:76`) then
  re-encodes (`json.ts:82`), the dispatcher encodes string parquet sources (`dispatcher.ts:307`),
  and `registerFileBuffer` copies into the WASM heap. `isNDJSON` splits the **entire** text into
  lines just to inspect the first one (`json.ts:30-41`, split at `:31`).
- **Progress is fiction.** Four hardcoded points (`reading` 0 → `parsing` 25 → `indexing` 90),
  stopping at 90% before the slowest stages run (`dispatcher.ts:268-313`); `indexing` claims
  `cancelable: false` (`:287,299,312`). `ProgressPayload.loaded/total/estimatedRemaining` are
  declared but never populated (`src/worker/types.ts:67-74`). Worse: the public `loadProgress`
  event is declared (`src/core/TableEvents.ts:58`) and promised by JSDoc (`src/DataTable.ts:360`)
  but **never emitted** — the callback chain is severed at `DataLoader.load`
  (`DataLoader.ts:103-106` passes no `onProgress` to `bridge.loadData`) and `Actions.loadData`
  (`src/core/Actions.ts:516-526`), even though the bridge already delivers `progress` messages to
  a callback when given one (`WorkerBridge.ts:565-569`).
- **DuckDB runs unconfigured.** Init sets only `castDecimalToDouble`
  (`src/worker/duckdb.ts:44`); no `memory_limit` against the ~4 GB WASM ceiling (README §3), and
  `preserve_insertion_order` is left at its memory-hungry default.
- **Redundant preflight.** Each loader spends one `DESCRIBE SELECT * FROM read_xxx(…)` solely to
  reject a source `__rowid__` column (`csv.ts:112-114`, `json.ts:130-132`, `parquet.ts:81`).

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- `src/worker/loaders/common.ts` — whole file: matchers (`:72-129`), the three detect fns
  (`:144-278`), the three convert fns (`:292-451`, note the `ORDER BY "__rowid__"` rationale
  comment `:319-321` and `LOAD_PARSE_FAILED` error shape), `enhanceSchemaTypes` (`:466-535`),
  `LoaderContext` (`:17-20` — your DI seam for Node tests and for any new injected capabilities).
- `src/worker/loaders/{csv,json,parquet}.ts` — full statement sequence per load; the
  reserved-name preflight and its `wrapReservedColumnError` defense-in-depth; parquet skips the
  probe when `options.columns` is given (`parquet.ts:80-86`).
- `src/worker/dispatcher.ts:257-340` (load case + progress emissions), `:389-404` (cancel
  semantics for running loads), `:85-108` (`__…ForTests` seam precedent).
- `src/data/WorkerBridge.ts` — `sendMessage` (`:464-509`; Phase 0's stats wrap this — coordinate
  your transfer-list change with it), `loadData` (`:353-379`), progress delivery (`:565-569`).
- `src/data/DataLoader.ts` — `load` (`:49-114`), `normalizeSource` in `src/DataTable.ts:436-443`
  (Blob→ArrayBuffer), facade `loadDataImpl` (`DataTable.ts:1206-1315`: `loadStart` at `:1212`,
  `actions.loadData` at `:1248`, `loadComplete` at `:1271`).
- `src/core/Progress.ts` (types + unused `estimateTimeRemaining`), `src/core/TableEvents.ts:58`.
- `src/table/TableBody.ts:838-869` (density valve: permanent fast-path disable + OFFSET retry)
  and `:1003-1062` — **every block-fetch SQL already carries an explicit
  `ORDER BY … "__rowid__"`** (fast path `:1028`, tiebreaker `:1041-1060`). This is the evidence
  base for the `preserve_insertion_order` evaluation.
- Tests: `tests/worker/loaders/*.integration.test.ts` (Node DuckDB via `ctx()`),
  `datetimeStress.test.ts` (the behavioral lock: 450 rows / 40 cols; `date_standard`→date,
  `time_standard`→time, `timestamp_standard`→timestamp, `range_*`→timestamp, `ambig_date` and
  `str_date_us/eu/long` **stay** string, `str_date_compact` CSV→integer),
  `numericStress.test.ts`, `idempotentReload.test.ts`, `reserved-column.test.ts`;
  `tests/helpers/duckdbNode.ts`, `tests/helpers/mockWorker.ts` — **its `postMessage(msg)` takes
  one arg (`:119-144`): a transfer list is silently ignored and buffers are NOT detached by the
  mock** — extend it to record the second argument; real detachment is asserted in the browser.
- Phase 0 deliverables you consume: `tests/fixtures/tiers.ts` (`TIERS`, `tierCSV`, `cellOracle`),
  `tests/budgets.ts` (fill the `LOAD` namespace), `tests/browser/helpers/wideTable.ts`,
  `tiers.smoke.spec.ts` / `tiers.full.spec.ts`, `demo/perf.ts` readout. Check Phase 0's STATUS.md
  handoff for drift in any of these names.

## 4. Design (decided choices vs. open decisions; deviations go to STATUS.md)

### 4.1 Batched type detection — decided

Replace the three per-column detect fns with one planner in `common.ts`:

```ts
planTypeConversions(conn, tableName | sourceRelation, stringColumns): Promise<{
  timestamp: string[]; date: string[]; time: string[];
}>
```

- **Sampling**: deterministic head sample — restrict to `"__rowid__" < 4096` (zonemap-pruned;
  constant `DETECT_SAMPLE_ROWS = 4096`) when probing the materialized table, or a
  `LIMIT 4096`-bounded subquery when probing a `read_xxx` relation (streams; stops parsing at the
  limit). Within the sample, per-column `SELECT DISTINCT … LIMIT 100` subqueries batched via
  `UNION ALL` in chunks of ~64 columns, each row tagged with its column name:
  `SELECT 'col' AS c, v FROM (SELECT DISTINCT "col" AS v FROM src WHERE "col" IS NOT NULL LIMIT 100)
UNION ALL …` → **⌈V/64⌉ queries total** instead of up to 3V full-scan aggregates.
- **Classification stays in JS** with the _same_ matchers (`isISOTimestamp`/`isISODate`/
  `isTimeFormat`), the same 0.95 threshold, and the same timestamp → date → time priority (the
  patterns are mutually exclusive per value, so one fetched sample classifies all three classes
  in one pass). Semantics drift is bounded to: distinct values now come from the head sample
  rather than the whole table (a column whose first 4,096 rows are all NULL is no longer probed
  deeper — record this in the changeset note). The datetime-stress suite is the behavioral lock;
  it must stay green unmodified.
- Delete `detectTimestampColumns`/`detectDateColumns`/`detectTimeColumns` after grepping for
  external consumers (none known in `src/`; tests referencing them get ported to the planner).

### 4.2 Single-pass materialization — decided floor, per-format upgrade

Refactor each loader into the two-stage seam **detect → materialize** (Phase 10 retargets stage
2 at Parquet conversion):

- **Guaranteed floor (all formats), ship first**: keep the initial CTAS, run the §4.1 planner on
  the materialized table, then — if anything converts — issue **one combined rewrite**: a single
  `CREATE TABLE __temp_… AS SELECT` with all TRY_CAST projections (timestamp+date+time together)
  `ORDER BY "__rowid__"`, then `DROP` + `RENAME`, then one final `DESCRIBE`. The three
  inter-pass `DESCRIBE`s (`common.ts:499,516,530`) collapse to that one. **CTAS count ≤ 2; total
  statements ≈ 6 + ⌈V/64⌉, column-count-independent in practice.**
- **Per-format upgrade to CTAS = 1 (open decision (a), recommendation below)**: probe the
  _source relation_ (`read_csv_auto`/`read_json_auto`/`read_parquet`) with the planner _before_
  materializing, then fold the TRY_CAST projections into the **initial** CTAS. TRY_CAST
  semantics are preserved exactly; the cost is bounded head re-parses of the source per probe
  chunk. Parquet is the easy win (columnar head reads are cheap, and its preflight `DESCRIBE`
  probe `parquet.ts:81` merges into the same pre-pass). Alternative for CSV only (open decision
  (b)): typed re-read via `read_csv(file, types={…})` — see risk §4.8 before choosing it.
- **Reserved-name preflight fold — decided**: on any source-probing path, the existing
  `DESCRIBE SELECT * FROM read_xxx(…)` becomes the planner's column list — one query serving both
  purposes; on the floor path it stays as-is (already only 1 query). Keep
  `wrapReservedColumnError` defense-in-depth untouched.

### 4.3 Zero-copy ingest — decided

- `DataLoader.load` normalizes **every** source to an `ArrayBuffer`: File/URL reads switch
  `.text()` → `.arrayBuffer()` for csv/json too (`DataLoader.ts:59,76`); inline strings are
  `TextEncoder.encode`d once on the main thread. **BOM guard**: sniff the first 2–3 bytes; only
  UTF-16 BOMs (`FF FE` / `FE FF`) take the legacy decode-to-string path (DuckDB reads UTF-8
  only; today's `.text()` masks UTF-16 sources — do not regress them silently).
- `WorkerBridge.sendMessage` gains an optional `transfer?: Transferable[]` parameter, forwarded
  as `postMessage(message, transfer)` (`:507`); `loadData` passes `[source]` when the payload is
  an ArrayBuffer. **The caller's buffer is detached after `loadData`** — this is the new default
  (README §2.1), documented via changeset migration note ("pass `buf.slice(0)` to keep a copy").
- Worker side: `csv.ts` registers the received bytes directly (its ArrayBuffer branch already
  does); `json.ts` drops the decode/re-encode round-trip (`:76,:82`) and registers the original
  bytes; `dispatcher.ts:307`'s string→encode parquet branch becomes a legacy path (the bridge no
  longer sends strings). `LoadPayload` keeps `ArrayBuffer | string` for worker-protocol
  back-compat.

### 4.4 NDJSON sniff — decided

Replace `isNDJSON(fullString)` (`json.ts:30-41`) with a bounded sniff over the first
`SNIFF_WINDOW_BYTES = 1 MiB`: decode only that prefix, take the text up to the first `\n`
(tolerate `\r\n`), `JSON.parse` it; object-and-not-array ⇒ NDJSON — identical semantics for any
source whose first line fits the window. No newline in the window ⇒ treat as `array` (today's
behavior for single-line sources); a first NDJSON record larger than 1 MiB misdetects — accepted
edge, escape hatch is the existing `options.format`.

### 4.5 Honest progress — decided

- **Percent bands** (monotone by construction): `reading` 0–15 (main thread: byte-accurate
  `loaded`/`total` from `File.size` / `Content-Length` / buffer length; `total` omitted when
  unknown), `parsing` 15–60 (worker: after register, after initial CTAS, after COUNT/DESCRIBE),
  `indexing` 60–95 (after each planner chunk — proportional to chunks done — and after the
  combined rewrite), 95–100 finalize; emit exactly one `percent: 100` before the `result`
  message.
- **Plumbing**: the dispatcher builds a stage reporter bound to `respond(id, 'progress', …)` and
  threads it into the loaders via an optional `reportProgress` on `LoaderContext` (the existing
  injection seam); populate `loaded`/`total` (bytes for `reading`, probe-chunk counts for
  `indexing`). Main-thread reading progress is emitted by `DataLoader`; reconnect the severed
  chain `DataLoader.load` → `bridge.loadData(…, onProgress)` → `actions.loadData` → facade, where
  `loadDataImpl` applies a **monotonic clamp** (percent never decreases across the
  main-thread/worker handoff) and finally **emits `loadProgress`** — making `TableEvents.ts:58`
  and the `DataTable.ts:360` JSDoc true for the first time. Recommended: a separate optional
  callback parameter on `actions.loadData`, keeping the exported `LoadDataOptions` untouched.
- **Cancelability flags become honest** (open decision (e)): today a running load cannot be
  interrupted (`dispatcher.ts:389-404`), so `cancelable: true` during `parsing` is false
  advertising. Either route loader statements through a pending-query runner injected via
  `LoaderContext` (same mechanism as `executeQueryCancellable`, `src/worker/duckdb.ts:197-220`)
  and mark all stages cancelable, or keep `conn.query` and report `cancelable: false` for
  worker-side stages / `true` for the main-thread `reading` stage (abortable fetch). Recommend
  the honest-flags minimum; take the runner only if it drops in cleanly.

### 4.6 DuckDB config at init — decided value-shape, open values

After `db.connect()` in `initializeDuckDB` (`src/worker/duckdb.ts:47`), run `SET` statements:

- `SET memory_limit = '2.5GB'` (open decision (d): 2.5–3.0 GB; recommend 2.5 GB — below the
  ~3.2 GB practical WASM ceiling with headroom for Arrow materialization; guardrail UX on hitting
  it is Phase 10's).
- `SET preserve_insertion_order = false` **only if validated** (open decision (c)): every
  block-fetch already orders explicitly (`TableBody.ts:1028,1041-1060`), aggregates are
  order-free, and export SQL carries the `__rowid__` tiebreaker (README §5.H) — so the expected
  blast radius is zero, and the density valve (`TableBody.ts:838-869`) makes any residual
  violation slow-but-correct, not wrong. Validation gate: full loader suite + the
  `tiers.smoke.spec.ts` row oracle + a deep-scroll storm at DEEP must show **0 violations and 0
  density-valve console warnings**. If it breaks row identity, ship without it and record why in
  STATUS.md.

### 4.7 Open decisions (recommendation bolded)

| #   | Decision                                   | Options                                        | Recommendation                                                                              |
| --- | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| a   | Where detection probes run, per format     | materialized table (floor) vs. source relation | **Floor first for all; upgrade parquet, then CSV/JSON if the spike holds** (CTAS 2 → 1)     |
| b   | CSV typed re-read (`read_csv` `types={…}`) | vs. inline TRY_CAST                            | **Only if the §4.8 spike proves parity** — TRY_CAST is the semantic reference               |
| c   | `preserve_insertion_order = false`         | on vs. off                                     | **On, gated by the row-identity oracle staying green**; off + STATUS.md rationale otherwise |
| d   | `memory_limit` value                       | 2.5–3.0 GB                                     | **2.5GB**                                                                                   |
| e   | Load cancelability                         | pending-query runner vs. honest flags          | **Honest flags minimum**; runner if trivial via `LoaderContext`                             |

### 4.8 Risk notes / fallbacks

- **Riskiest assumption — typed re-read parity (hour-one spike).** `read_csv` with explicit
  `types` must match TRY_CAST semantics. Known hazard: the 0.95 threshold admits columns with up
  to 5% non-conforming values — TRY_CAST NULLs those **cells**, while a typed read errors the
  load (or, with `ignore_errors`, drops whole **rows**). Spike: prototype typed re-read in Node
  (`createNodeDuckDB`) and run `csv.integration` + `datetimeStress` against it in the first
  hour. Any mismatch ⇒ fall back to inline TRY_CAST (floor or §4.2 source-probe variant) — the
  phase does not depend on (b).
- **Worker test doubles vs. transfer lists — run `npx vitest run tests/data tests/worker`
  immediately after the `sendMessage` change.** `mockWorker` ignores extra args (safe at
  runtime) but detaches nothing; don't write a detach assertion against it — assert the recorded
  transfer argument there, and assert real detachment in the browser spec.
- **Head-sample detection misses** (all-NULL heads): acceptable; documented in the changeset. If
  a real fixture regresses, raise `DETECT_SAMPLE_ROWS` before redesigning.
- **`SET memory_limit` failing under duckdb-wasm** (version quirk): wrap in try/catch, emit a
  worker-side warning payload, continue — never fail init over configuration.
- **WIDE viz=on baselines are pathological until Phase 2** — compare load-path numbers with
  `viz=off` captures only.

## 5. Implementation milestones (commit at each)

1. §4.1 planner + parity unit tests (same fixtures classify identically; priority order;
   threshold; all-NULL column) + loader integration suites green. — _commit: "Batch load-time
   type detection into sampled set probes"_
2. §4.2 floor: combined single rewrite, `enhanceSchemaTypes` refactor, delete dead converts;
   query-count test via a counting `conn` proxy in `LoaderContext` (`tests/worker/loaders/`
   `queryBudget.test.ts`, custom 100×2,000 tier from `tiers.ts`): total statements ≤
   `DT_BUDGET.LOAD.QUERIES_MAX`, `CREATE …TABLE… AS` count ≤ `DT_BUDGET.LOAD.CTAS_MAX`. —
   _commit: "Collapse type conversions into one combined rewrite"_
3. §4.8 spike, then per-format CTAS=1 upgrades that survive it (parquet expected; CSV/JSON per
   spike). Skip the commit if the floor is retained everywhere — record why in STATUS.md. —
   _commit: "Materialize typed columns in one pass for eligible formats"_
4. §4.3 zero-copy: DataLoader ArrayBuffer normalization + BOM guard, `sendMessage` transfer
   param, worker-side de-dup of encodes (`json.ts`, `dispatcher.ts:307`), `mockWorker` transfer
   recording + bridge unit test; browser detach assertion (post-`loadData`
   `buf.byteLength === 0`) added to the Phase 0 mount helper path. — _commit: "Transfer source
   buffers to the worker instead of cloning"_
5. §4.4 sniff + unit tests (`array` JSON, NDJSON, CRLF NDJSON, first-line-exceeds-window,
   ArrayBuffer input never fully decoded). — _commit: "Sniff NDJSON from a bounded byte prefix"_
6. §4.5 progress: worker stage reporter, `loaded`/`total`, facade monotonic clamp +
   `loadProgress` emission; jsdom test (sequence non-decreasing, ends at exactly 100, `reading`
   carries bytes, event fires on the public emitter). — _commit: "Report honest byte and stage
   progress during load"_
7. §4.6 config + oracle validation run (loader suites + smoke spec + DEEP scroll storm). —
   _commit: "Set DuckDB memory limit and evaluate insertion order"_
8. Budgets in `tests/budgets.ts` `LOAD` namespace, RUN-gated wall-clock asserts in
   `tiers.full.spec.ts`, WIDE/DEEP (+ WIDE-CSV) baseline re-capture committed, docs + changeset
   (§10). — _commit: "Add load budgets and re-capture wide and deep baselines"_

## 6. Programmatic verification

Budgets (add to `tests/budgets.ts`, namespace `LOAD`; counts assert in default runs, wall-clock
only behind env gates):

| Constant                      | Value  | Asserted where                                                    |
| ----------------------------- | ------ | ----------------------------------------------------------------- |
| `DT_BUDGET.LOAD.QUERIES_MAX`  | 15     | Node loader harness, counting-proxy `LoaderContext` (default run) |
| `DT_BUDGET.LOAD.CTAS_MAX`     | 2      | SQL-shape assertion over the captured statements (default run)    |
| `DT_BUDGET.LOAD.WIDE_LOAD_MS` | 30_000 | `RUN_BROWSER_PERF=1` full-tier spec, WIDE viz=off `loadMs`        |
| `DT_BUDGET.LOAD.DEEP_LOAD_MS` | 60_000 | `RUN_BROWSER_PERF=1` full-tier spec, DEEP `loadMs`                |

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage                  # planner parity, query budget, sniff, transfer, progress,
                                       # loader + datetime/numeric-stress + idempotentReload green
npm run build && npm run size          # library budgets must hold (no new deps)
npm run docs:api:check
npm run test:browser                   # tiers.smoke (WIDE_CI): row+column oracles 0 violations,
                                       # detach assertion, zero density-valve warnings
RUN_BROWSER_PERF=1 npx playwright test tests/browser/tiers.full.spec.ts   # WIDE/DEEP + load-ms budgets
npm run perf:baseline && npm run perf:baseline:report                     # re-capture WIDE, DEEP (+ WIDE-CSV if Phase 0 captured it)
```

Phase-specific asserts inside the suites: loader statement count ≤ 15 and CTAS ≤ 2 at a
100×2,000 custom tier (old code: ~90+ statements, 4 CTAS — the test proves column-count
independence); progress sequence monotone, terminal 100, `loaded`/`total` populated in
`reading`; source ArrayBuffer `byteLength === 0` after `loadData` (browser); NDJSON sniff units;
`tierCSV`-driven WIDE-CSV mount reaches ready (gated run); schema conversions for tier classes
15–17 still present in `state.schema` (proves detection still fires end-to-end); new baseline
JSONs committed alongside the old (append-only, README §8.6).

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with:
**tier `wide`, `viz=off`** (isolates the load path; step 7 dropped per its viz=on condition).
Placeholders: `READY_BUDGET_MINUTES` = Phase 0's WIDE viz=off baseline ceiling (cap 10);
`LOAD_MS_EXPECTATION` = order-of-magnitude better than the Phase 0 baseline `loadMs`, target ≤
`DT_BUDGET.LOAD.WIDE_LOAD_MS` (30 s); `QUERY_BUDGET`/`DOM_BUDGET` = record-only this phase
(bridge-level `queryCount` does not see loader-internal statements; DOM is Phase 3's problem);
`SORT_COL` = `col_1`; `SORT_QUERY_BUDGET`/`RESIZE_EXPECTATION`/`THEME_EXPECTATION` = record-only
(pre-P3/P6 they are known-slow at 1K cols); `EXPORT_SIZE_RANGE` = 10⁵–10⁷ bytes for 1,000 rows ×
1,000 cols parquet. Row-oracle spot checks in step 4 are **load-bearing here**: they are the
`preserve_insertion_order` field validation — any violation or density-valve console warning
fails the phase.

Then a phase-specific pass in a **second tab** at `?gen=wide-csv&viz=off` (1,000×5,000 in-page
CSV — the text-format path):

1. Panel reaches `ready`; record `loadMs` vs. the pre-phase capture; console clean.
2. Progress honesty, page-side via `javascript_tool` (safe: replaces only this tab's tier
   table with a small dataset):

   ```js
   const t = window.__dtPerf.table;
   const ev = [];
   const un = t.on('loadProgress', (e) => ev.push({ ...e }));
   const csv =
     'a,b,ts\n' +
     Array.from(
       { length: 2000 },
       (_, i) => `${i},${i % 7},2024-01-0${(i % 9) + 1}T00:00:0${i % 10}`,
     ).join('\n');
   await t.loadData(csv, { sourceFormat: 'csv' });
   un();
   ({
     n: ev.length,
     last: ev.at(-1),
     mono: ev.every((e, i) => !i || e.percent >= ev[i - 1].percent),
     bytes: ev.some((e) => e.stage === 'reading' && e.loaded !== undefined),
   });
   ```

   **Assert**: `n > 4` (more granular than the old 4 points), `mono === true`,
   `last.percent === 100`, `bytes === true`.

3. Transfer check:

   ```js
   const buf = new TextEncoder().encode('a,b\n1,2\n3,4\n').buffer;
   await window.__dtPerf.table.loadData(buf, { sourceFormat: 'csv' });
   buf.byteLength; // assert === 0 (detached)
   ```

4. Final console sweep (zero new errors), close the tab.

Attach both tabs' final `window.__dtPerf.refresh()` snapshots + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; bundle size budgets untouched.
- [ ] Loader statement count ≤ `DT_BUDGET.LOAD.QUERIES_MAX` (15) and CTAS ≤ 2, asserted in the
      default vitest run via the counting proxy.
- [ ] `datetimeStress` / `numericStress` / `idempotentReload` / integration suites pass
      **unmodified** (behavioral lock).
- [ ] `loadProgress` fires with monotone percent ending at 100; `loaded`/`total` populated for
      `reading`; cancelable flags truthful.
- [ ] Source ArrayBuffers are transferred (detached after `loadData`); no worker-side
      re-encode of already-binary sources; NDJSON sniff bounded.
- [ ] `memory_limit` set at init; `preserve_insertion_order` decision made **with evidence**
      (oracle run) and recorded in STATUS.md.
- [ ] WIDE + DEEP baselines re-captured and committed (append-only); report regenerated;
      before/after headline in STATUS.md.
- [ ] Chrome template + wide-csv pass executed; snapshots and screenshots attached.
- [ ] Changeset + docs updates from §10 in place; API-surface snapshot diff is empty or
      `@internal`-only.

## 9. Out of scope

Direct-scan / no-materialize mode and memory-guardrail UX (Phase 10); OPFS; visualization
gating and the load-promise gate (Phase 2 — do not touch
`Promise.all([whenBodyReady, pendingVizInit])`); streaming CSV parse with row-level progress
(README §9, deferred); worker→main transfer of export buffers (Phase 11); any change to block
fetching or sorted pagination (Phase 7).

## 10. Docs / changeset obligations

- **Changeset (patch)** — "Changed": honest `loadProgress` events (now actually emitted, with
  bytes and stage granularity), faster load path (≤1 conversion rewrite, batched detection),
  source `ArrayBuffer`s are now transferred to the worker (migration note: pass `buf.slice(0)`
  if you reuse the buffer after `loadData`), DuckDB `memory_limit` set at init, head-sample
  detection note (§4.1). No public API additions — `loadProgress` and the `ProgressInfo` fields
  were already typed.
- `docs/performance.md` — update the load-path guidance and the fixture timing table with
  measured before/after numbers; **revise the "Known slow paths" entry (`:467-470`) about
  `DESCRIBE`/schema detection on very wide tables** — it should describe the new bounded
  behavior or be removed.
- If cancelability semantics changed (§4.5 open decision (e)), reflect it in the
  `loadProgress`/cancellation docs section.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: before/after loader statement counts and
CTAS counts at the budget tier; WIDE/DEEP (and WIDE-CSV) `loadMs` before → after; which
per-format materialization shipped (floor / source-probe / typed re-read) and the spike verdict;
the `preserve_insertion_order` decision with oracle evidence; the `memory_limit` value; exact
budget constants added; any `LoaderContext` shape changes (Phase 7 and Phase 10 both build on
it) and line drift in `common.ts` / `dispatcher.ts` / `WorkerBridge.ts` that later phases cite;
the manual-verification snapshots.
