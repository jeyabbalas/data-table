# Phase 11 — Bulk transfer: streaming export, clipboard caps, vector ingestion

Size: **M/L** · Depends on: **Phase 7** (rank index — optional reuse), **Phase 8** (selection
model), **Phase 10** (OPFS/file infra, direct-scan reads) · Blocks: **Phase 12**

---

## 1. Context

Read [`README.md`](./README.md) and [`STATUS.md`](./STATUS.md) first — Phases 7, 8, and 10 have
landed since this document's anchors were written, and their handoff notes adjust this phase
(selection representation, rank-index API, OPFS availability, direct-scan view names). This
phase makes bulk data movement scale-safe: CSV/JSON/NDJSON exports run inside DuckDB via
`COPY … TO` (the pattern the Parquet path already uses) instead of accumulating the dataset as
JS strings; the export buffer crosses the worker boundary by transfer, not clone; clipboard
copies are byte-capped with a friendly message; and vector derived columns ingest via Arrow
instead of thousands of literal `INSERT` round-trips. README hazards **G** (export) and the
vector item in **F** are the targets; §5.H's dispatcher/queue/cancel assets are the substrate.

## 2. Problem statement

All anchors from branch point `c326e9e` — re-locate before acting (three phases moved code):

- `exportToCSV` accumulates every row into `lines: string[]` then `join`s
  (`src/export/CSVExport.ts:184-204`); JSON same (`src/export/JSONExport.ts:157-189`, NDJSON
  `:199-215`). A DEEP (20×5M) full export is hundreds of MB of strings; TARGET is tens of GB.
- `fetchBatchedRows` pages `LIMIT 10000 OFFSET n` with a full `ORDER BY` per batch
  (`src/export/ExportQuery.ts:23,97-103,212-245`) — a top-(n+10K) re-sort of the whole table
  per batch, 500 times at DEEP.
- The Parquet path is already worker-side `COPY (sql) TO file` + `copyFileToBuffer` + `dropFile`
  (`src/worker/dispatcher.ts:342-382`, `src/export/ParquetExport.ts:93-118`) but pulls the whole
  output into one `Uint8Array` and structured-clones it (`src/worker/worker.ts:12-15` posts with
  no transfer list) — transient peak ≈ 2× output size.
- The COPY runs via `conn.query()`, which `cancelSent()` cannot interrupt (dispatcher comment
  `:396-400`; `src/worker/duckdb.ts:163-170`) — cancel is delivery-suppression only. And the
  dialog silences only `DOMException AbortError` (`src/export/ExportDialog.ts:682`), while
  bridge aborts reject `QueryError` code `QUERY_ABORTED` (`src/data/WorkerBridge.ts:481-495`) —
  today a mid-flight cancel paints an error message.
- `Clipboard.copyRowsToClipboard` routes through `exportToCSV` with no cap
  (`src/export/Clipboard.ts:68-102`); the ~10 MB browser limits are documented but unenforced
  (`:21-28`). The dialog's Copy button has the same hole (`ExportDialog.ts:695-756`).
- Vectors: `createVectorHelperTable` INSERTs literal `VALUES` in batches of 1,000
  (`VECTOR_BATCH_SIZE`, `src/derived/DerivedColumnManager.ts:43,830-860`) — 5,000 serialized
  round-trips of concatenated SQL at 5M values, formatted by `formatSQLValue`
  (`src/filters/FilterSQL.ts:61-90`).

**Riskiest assumptions, in order:** (1) `COPY TO` output fidelity vs the JS formatters — golden
tests come FIRST (§4.1); (2) COPY output materialization peak in the wasm FS at DEEP — an
hour-one measurement gates the hand-off design (§4.2); (3) `insertArrowTable` mechanics —
verified in the pinned typings (§3), but parity is proven in Node before UI wiring (§4.6).

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- The export modules end to end:
  `src/export/{ExportQuery,CSVExport,JSONExport,ParquetExport,Clipboard,ExportDialog}.ts`. Note:
  `escapeCSVField` applies `neutralizeFormulaPrefix` to **every** cell — negative numbers
  export as `'-42` today (`CSVExport.ts:79-109,138-147`; documented in
  `tests/export/CSVExport.test.ts:78-84,187-188`) and header cells are escaped too (`:188`).
- Worker-boundary value shapes: `convertBigInts` maps BIGINT→Number
  (`src/worker/duckdb.ts:132-157`), and Arrow `row.toJSON()` yields **epoch-ms numbers** for
  TIMESTAMP/DATE (see `src/table/Cell.ts:232-320` accepting number/bigint) — today's CSV/JSON
  exports emit epoch numbers, not ISO strings; the `instanceof Date` branches are dead on the
  worker path.
- `src/worker/dispatcher.ts` export case (`:342-382`), `handleCancel` (`:405-444`; running
  non-init targets forwarded to `cancelSent()` `:429-441`), `RunnableType` (`:35`);
  `executeQueryCancellable` (`src/worker/duckdb.ts:197-220`) vs `executeQuery` (`:171-180`, the
  documented fallback); `ExportPayload { sql; format: 'parquet' }` (`src/worker/types.ts:47-50`);
  `WorkerBridge.exportToBuffer` (`:387-393`) and `sendMessage`'s transfer-less `postMessage`
  (`:507`).
- Phase 8's landed selection model: what `state.selectedRows` and `ExportContext.selectedRows`
  (`ExportQuery.ts:17`) are now (`explicit | all-except` per README §7), and what
  `buildSelectedRowsQuery` / `fetchSelectedRows` became. Phase 10's landed file infra: OPFS
  registration helpers, and the direct-scan view `state.tableName` resolves to — exports must
  read through it (verify `COPY (SELECT … FROM <view>)` works in direct mode). Phase 7's rank
  index name/lifecycle (§4.2).
- Pinned duckdb-wasm (installed `1.33.1-dev57.0`, spec `^1.33.1-dev45.0`):
  `…/dist/types/src/parallel/async_connection.d.ts:34`
  `insertArrowTable(table: arrow.Table, options: ArrowInsertOptions): Promise<void>` (options
  `{ name, schema?, create? }`); `async_bindings.d.ts` — `copyFileToBuffer(name)` is
  **whole-buffer only** (`:126`), plus `dropFile`, `globFiles`, and `registerFileHandle` with
  `DuckDBDataProtocol.BROWSER_FSACCESS = 3` for OPFS handles. No ranged file read exists.
- Bundling: `vite.config.ts` externalizes duckdb-wasm for the **lib** entries (`:88-95`) but the
  worker sub-build inlines it — `dist/assets/worker-*.js` (~211 kB raw / ~42 kB brotli) already
  contains `duckdb-browser.mjs` **plus 85 `apache-arrow` modules** (verify via its sourcemap).
  `.size-limit.cjs` has **no worker-chunk entry** today; root entry cap is 8.1 kB.
  `apache-arrow@17.0.0` is transitive-only (via duckdb-wasm) — not declared here.
- `DerivedColumnManager`: vector path (`:830-860`), 0-based `__rowid__` alignment with the
  loaders' `row_number() OVER () - 1` (`src/worker/loaders/csv.ts:128`), helper-table LEFT JOIN
  in `recreateView` (`:922-978`), type map (`:883-906`), `assertVectorLength` (`:690-702` —
  throws `VECTOR_LENGTH_MISMATCH` unless length == totalRows); caller
  `StateActions.addDerivedColumn` (`src/core/Actions.ts:1305`).
- Test seams and public surface: `tests/helpers/duckdbNode.ts` (real `AsyncDuckDB` + connection
  in Node — golden and Arrow tests run here, no browser); dispatcher unit tests via synthetic
  `respond`; `tests/export/*`; Phase 0's bridge stats seam and `tests/budgets.ts` `EXPORT`
  namespace. `src/advanced.ts:113-127` re-exports every export helper (public API);
  `Strings.export` (`src/core/Strings.ts:223-270`, defaults `:642+`).

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Golden fidelity tests + compatibility matrix (do this FIRST)

Before changing product code, capture the current formatters' outputs on the SMOKE fixtures
(`tests/fixtures/datasets/`, loaded via `duckdbNode.ts` through the real loaders so worker-shape
values are faithful) for CSV (each delimiter × headers on/off × nullValue '' and 'NULL'), JSON
array (pretty off), and NDJSON; commit them under `tests/export/goldens/`. Comparator:
byte-equality after a **documented normalizer** (allowed diffs below); JSON via `JSON.parse`
deep-equality plus key order. The matrix (the golden spec's doc block, summarized in the
changeset) starts from these verified rows; fill the engine column from the actual run:

| Semantics         | JS today (verified)                               | COPY expectation (verify against engine) | Decision                                        |
| ----------------- | ------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Delimiter/quoting | RFC 4180, quote-when-needed                       | `DELIMITER`/`QUOTE`/`ESCAPE` options     | must match                                      |
| Formula prefixes  | `'` prepended to `= + - @ \t \r` on **all** cells | none                                     | replicate for VARCHAR cols only (see below)     |
| Negative numbers  | `'-42` (over-escape)                              | `-42`                                    | **Changed** — numerics no longer prefixed       |
| Timestamps/dates  | epoch-ms numbers                                  | `YYYY-MM-DD HH:MM:SS(.ffffff)` text      | **Changed** — adopt engine text; migration note |
| BIGINT > 2^53     | precision loss (`convertBigInts`)                 | exact digits                             | **Changed** (improvement)                       |
| NULL vs `''`      | both → `nullValue`                                | NULL → `NULLSTR`; `''` force-quoted `""` | **Changed** (improvement)                       |
| NaN/±Infinity     | CSV `NaN`/`Infinity`; JSON `null`                 | verify engine output both formats        | matrix records; normalize or document           |
| Header row        | names formula-neutralized + escaped               | `HEADER` writes raw names, RFC quoting   | **Changed**; documented                         |
| NDJSON            | `\n`-joined, no trailing newline                  | trailing newline                         | allowed diff (normalizer)                       |
| JSON `pretty`     | JS indent post-format                             | no COPY equivalent                       | `pretty: true` stays on the legacy JS path      |

Formula-injection protection stays: build it **into the SQL projection** for VARCHAR-typed
columns only — `CASE WHEN regexp_matches(c, '^[=+\-@\t\r]') THEN chr(39) || c ELSE c END` — via
a new `buildExportProjection(columns, schema, format)` in `ExportQuery.ts` (schema is already in
`ExportContext`); numeric/temporal columns project raw. Every **Changed** row ships in the
changeset with a migration note; anything the golden run reveals beyond this table is either
replicated in the projection (`strftime` if the engine's date text is rejected) or added to the
matrix + changeset. The golden suite must pass (modulo normalizer) before the dialog switches.

### 4.2 Worker COPY pipeline

- Widen `ExportPayload` to
  `{ sql; format: 'parquet' | 'csv' | 'json' | 'ndjson'; options?: { header?: boolean; delimiter?: string; nullValue?: string } }`.
  The dispatcher assembles the option list itself: `FORMAT CSV, HEADER true|false,
DELIMITER '<d>', NULLSTR '<s>'`; `FORMAT JSON, ARRAY true` for arrays; `FORMAT JSON, ARRAY
false` with file extension `.ndjson` for NDJSON (never emit `FORMAT NDJSON`). **Escape every
  option string** by doubling single quotes — `delimiter`/`nullValue` are dialog- and
  consumer-supplied text landing inside SQL; tab delimiter via `E'\t'`. Verify exact option
  spellings (`NULLSTR` vs `NULL`) against the pinned engine in the Node suite; record them.
- Run the COPY through `executeQueryCancellable` (the `conn.send` pending-query path) instead
  of `exportConn.query`, so the existing cancel path genuinely interrupts it. Verify in Node
  that `send()` executes COPY with result parity; fallback (per `duckdb.ts:171-180`): keep
  `conn.query` and record in STATUS.md that export cancel remains delivery-suppression. The
  catch block already `dropFile`s on failure (`:367-371`) — keep it, and add a test that a
  cancelled COPY leaves no `__export_*` file (`globFiles` assert).
- **Buffer hand-off:** extend `Respond` (`dispatcher.ts:32`) with optional
  `transfer?: Transferable[]`; `worker.ts` passes it to `self.postMessage(response, transfer)`.
  The export buffer is **transferred**, not cloned. No ranged read API exists (§3), so the
  two-tier design: (a) wasm FS + transferred single buffer (default); (b) at TARGET/direct
  mode, when Phase 10's infra reports OPFS available, register an OPFS `FileSystemFileHandle`
  via `registerFileHandle(name, handle, BROWSER_FSACCESS, true)` and COPY straight into it —
  the main thread then downloads from the disk-backed OPFS `File`, no heap copy. Scope (b) per
  Phase 10's spike findings; if OPFS-write is unavailable, ship (a) and document TARGET full
  export as unsupported.
- **Hour-one measurement (gates the above):** before wiring the dialog, measure DEEP full-CSV
  COPY + hand-off peak (worker `performance.memory` where present + wasm FS file size). If
  peak ≈ 2× output even with transfer (wasm-FS copy + buffer coexisting), the OPFS route
  becomes mandatory at DEEP too — decide from the numbers, write them down.
- Optional RUN-gated experiment (not a gate): when Phase 7's rank index exists for the current
  sort, compare `COPY (… ORDER BY sort)` vs a join against the rank index at DEEP; keep the
  faster, numbers in STATUS.md either way.

### 4.3 Main-thread rewiring

- `WorkerBridge.exportToBuffer(sql, format, signal?, options?)` widens its `format` union and
  forwards `options` — public API, MINOR 'Added'. COPY messages stay uncached (`isCacheable`
  is SELECT-only, `WorkerBridge.ts:456-458`).
- `exportToCSV` / `exportToJSON` keep their `Promise<string>` signatures (public on
  `/advanced`) but become COPY-backed: buffer → `TextDecoder`. Document that string returns are
  bounded by JS string limits (~0.5–1 GB) and point large consumers at `exportToBuffer`.
  `pretty: true` array JSON is the one path keeping the legacy `fetchAllRows` accumulation
  (explicit cosmetic opt-in; documented in `docs/performance.md`).
- `ExportDialog` downloads never materialize a string: CSV/JSON/NDJSON go
  `exportToBuffer` → `new Blob([buf])` → `triggerDownload` (mirroring the Parquet arm at
  `:664-676`). Delete the LIMIT/OFFSET batch path once only the `pretty` variant needs it.
- **Cancel normalization:** treat `QueryError` codes `QUERY_ABORTED`/`QUERY_CANCELLED` the
  same as `DOMException AbortError` in both dialog handlers (`:682,:745`) — silent reset, no
  error paint. Fixes the pre-existing wart for Parquet too.
- **Progress:** COPY is one long query and the dispatcher is a serial one-task queue — a
  mid-COPY file-size poll cannot be answered by the busy single-threaded inner worker, so
  file-size polling is **rejected** (record this; do not build it). Ship indeterminate busy
  state + working Cancel: the dialog already flips Download→Cancel with a `--loading` class
  (`setExportingState`, `:781-788`); add `aria-busy` and keep Copy disabled.

### 4.4 Selected-rows export at scale (Phase 8 model)

Re-verify Phase 8's landed representation first. **All-except** exports as a
`NOT IN (exceptions)` predicate inside the single COPY (numbered-CTE or rank-index variant —
match whatever Phase 8 gave the grid). **Explicit** sets above `INDEX_CHUNK_SIZE` must not
explode the SQL text: ingest the index list into a worker-side temp table using §4.6's Arrow
ingestion, COPY joins against it (`WHERE __row_idx__ IN (SELECT idx FROM __dt_export_sel__)`),
drop it in a `finally`. Small explicit sets (≤ 10K) keep the inline `IN` list; contiguous
ranges keep the single-query `LIMIT/OFFSET` fast path (`ParquetExport.ts:63-67` precedent).
Both variants get end-to-end tests through the real dialog handlers with a stubbed bridge,
plus a Node COPY round-trip.

### 4.5 Clipboard cap

`EXPORT.CLIPBOARD_MAX_BYTES = 8_000_000` in `tests/budgets.ts`, mirrored into a library
constant (budgets never ship; the library owns the value, the budget asserts they agree). In
`copyRowsToClipboard` and `ExportDialog.handleCopy`: (1) cheap pre-check — estimate bytes as
`rowCount × avg(sampled first 100 rows' TSV width)`, refuse when the estimate exceeds 2× cap;
(2) exact check on the materialized payload's byte length before any `navigator.clipboard`
call. Refusal throws `ExportError` code `CLIPBOARD_LIMIT_EXCEEDED`; the dialog renders the new
`Strings.export.clipboardTooLarge(actualMB, capMB)` message (suggesting file export) in its
existing error area — pattern-match the `importSuccess` function-valued key precedent.
Changeset 'Changed'.

### 4.6 Vector ingestion via Arrow

- New worker message type `ingest` (extend `RunnableType`, normal priority) with payload
  `{ tableName, columnName, duckdbType, length, data }`, where `data` is a typed branch
  `{ kind: 'typed', buffer: ArrayBuffer, dtype: 'f64' | 'i64' | 'bool', validity?: ArrayBuffer }`
  or a generic branch `{ kind: 'values', values: (string | number | boolean | null)[] }`.
- `WorkerBridge.sendMessage` gains an optional `transfer: Transferable[]` parameter
  (`postMessage(message, transfer)` at `:507`). Typed buffers are **copied out of the caller's
  array once** (never transfer the consumer's own buffer — `VectorColumnDef.values` belongs to
  them) and the copy is transferred.
- Worker side: `import { tableFromArrays, vectorFromArray, … } from 'apache-arrow'` — the same
  module instance duckdb-wasm already pulls into the worker chunk (§3), so `insertArrowTable`
  receives a compatible `arrow.Table`. Build `__rowid__` (0..N-1, Int64, generated worker-side
  — matches the loaders' 0-based ids) + the value column; ingest into a staging table with
  `{ name, create: true }`; then
  `INSERT INTO <helper> SELECT __rowid__, CAST(v AS <duckdbType>) FROM staging` and drop
  staging. The CAST hop covers every `vectorTypeToDuckDBType` target
  (DECIMAL/UUID/DATE/TIMESTAMP/TIME/INTERVAL via the generic string branch) without hand-built
  Arrow types; f64/i64/bool skip the CAST when types match. Null semantics must equal
  `formatSQLValue`'s (`NULL` for null/undefined and non-finite numbers).
- `createVectorHelperTable` keeps its CREATE/DROP shell and swaps the INSERT loop for one
  `bridge.ingestVector(...)` call when `values.length > EXPORT.VECTOR_ARROW_MIN_VALUES`
  (= 10_000); below it, the literal-INSERT path stays (avoids Arrow overhead on tiny vectors;
  doubles as the permanent fallback — flip the threshold to `Infinity` and record it if
  `insertArrowTable` misbehaves). Chunk generic-values messages at 500K values
  (`create: false` appends); typed buffers go in one message.
- Declare `apache-arrow: ^17.0.0` in **devDependencies** (build/typecheck only — the worker
  chunk inlines it; consumers never resolve it). Add a `.size-limit.cjs` entry for
  `dist/assets/worker-*.js`: measure post-change brotli, cap at +5%; the root-entry 8.1 kB cap
  already proves Arrow never leaks into the main-thread bundle.

### 4.7 Budgets (`tests/budgets.ts`, EXPORT namespace)

Machine-independent, default-run: `EXPORT.FULL_EXPORT_BRIDGE_MESSAGES_MAX = 3` (a full CSV/JSON
export is exactly one `export` message — COPY + read + drop happen inside it — plus dialog
incidentals; zero `LIMIT/OFFSET` batch SELECTs, zero per-batch ORDER BY, asserted on captured
SQL/messages via a stubbed bridge and Phase 0's `__getStatsForTests`);
`EXPORT.CLIPBOARD_MAX_BYTES = 8_000_000`; `EXPORT.VECTOR_ARROW_MIN_VALUES = 10_000`;
`EXPORT.VECTOR_INGEST_MESSAGES_100K_MAX = 4` (vs 100 today). Wall-clock, RUN-gated only:
`EXPORT.DEEP_EXPORT_CSV_MS = 60_000` (full 5M×20 CSV); peak-heap is recorded, not asserted.

### 4.8 Risk notes / fallbacks

- Golden diffs beyond the §4.1 matrix that can't be projected away in SQL → document +
  changeset; a correctness regression with no SQL workaround keeps that one format on the JS
  path, stated in STATUS.md — never silent format drift.
- `conn.send` refusing COPY → `conn.query` fallback (cancel stays suppression-only; note it).
- `insertArrowTable` failures → threshold to `Infinity` (all-INSERT), ingestion budgets marked
  skipped, STATUS.md records the duckdb-wasm issue.
- OPFS write unavailable per Phase 10 findings → transferred-buffer path only; TARGET full
  export documented as bounded by the 4 GB heap.
- If the hour-one DEEP measurement shows even the transfer path exceeding safe headroom, stop
  and report per README §8.2 rather than inventing a chunked-COPY scheme (multi-file COPY per
  rank range re-introduces per-part sorts — rejected).

## 5. Implementation milestones (commit at each)

1. Golden capture on SMOKE fixtures (pre-change outputs committed), normalizer, matrix
   skeleton, hour-one DEEP COPY peak measurement in STATUS.md. — _commit: "Capture golden
   exports and export-memory measurements"_
2. Worker: widened `ExportPayload`, option assembly + escaping, cancellable COPY, transferable
   respond; dispatcher tests (synthetic respond) incl. cancel-drops-file. — _commit: "Stream
   exports through cancellable worker-side COPY"_
3. Main thread: `exportToBuffer` widening, COPY-backed CSV/JSON/NDJSON, projection builder,
   dialog Blob path + cancel normalization; golden suite green. — _commit: "Route CSV and JSON
   exports through the COPY pipeline"_
4. Selected-rows variants through Phase 8's model incl. temp-table join for large explicit
   sets. — _commit: "Export scaled selections through a single COPY"_
5. Clipboard cap + Strings + tests. — _commit: "Cap clipboard copies at a safe byte budget"_
6. Arrow vector ingestion + threshold fallback + worker-chunk size budget; parity tests across
   all ten vector types. — _commit: "Ingest vector columns via Arrow tables"_
7. RUN-gated perf specs, DEEP baseline re-capture (add the export column), docs + changeset +
   API snapshot. — _commit: "Record deep-tier export baselines and update docs"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size          # includes the NEW worker-chunk entry; root entry unchanged
npm run docs:api:check
npm run test:browser
RUN_DUCKDB_PERF=1 npm run test:perf
RUN_BROWSER_PERF=1 npx playwright test tests/browser/export.deep.spec.ts   # this phase's spec
npm run perf:baseline && npm run perf:baseline:report                       # DEEP re-capture
```

Phase-specific asserts (inside the suites): golden CSV/JSON/NDJSON equality modulo the
normalizer, every **Changed** matrix row covered by an explicit expectation; full export = 1
`export` message, 0 batch SELECTs, no `LIMIT`/`OFFSET`, single `ORDER BY` (captured SQL);
selected-rows all-except and explicit-large variants row-exact vs an oracle query; clipboard
over-cap → `CLIPBOARD_LIMIT_EXCEEDED` and the clipboard spy records **zero** write attempts;
vector: N=100K → ≤ `EXPORT.VECTOR_INGEST_MESSAGES_100K_MAX` messages (vs 100 today) and
helper-table contents identical to the INSERT path on a small all-types fixture; cancellation:
abort mid-COPY rejects abort-style, dialog resets silently, `globFiles` shows no `__export_*`
leftovers. RUN-gated: `DEEP_EXPORT_CSV_MS ≤ 60_000`, peak-heap recorded, TARGET slice export in
direct mode succeeds, DEEP baseline JSON committed (append-only).

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with
`?gen=deep&viz=off` (`{{TIER}}` = deep; `{{READY_BUDGET_MINUTES}}` from the DEEP baseline;
budgets from `EXPORT.*`). Steps 4–8 and 10 run as templated; step 9 is replaced by this block —
ground rules still apply (never trigger a native download or the real clipboard):

- **Download guard first**: via `javascript_tool`, stub
  `HTMLAnchorElement.prototype.click = () => {}` so an unexpectedly fast export cannot open
  the native download UI.
- **Buffer path**: export a filtered subset as CSV page-side —
  `await window.__dtPerf.table.bridge.exportToBuffer('SELECT … ORDER BY "__rowid__"', 'csv')`
  — assert `byteLength` plausible for the filtered row count (record it) and content-sniff:
  first line is the header, second line's first field matches the oracle.
- **Cancel mid-flight**: open the export dialog, choose CSV / all rows, click Download; within
  ~2 s click the same button (now Cancel). Assert the dialog returns to idle (button text back
  to Download, no error text painted) and query stats show no continued export traffic after a
  settle poll.
- **Clipboard over-cap**: select all rows (Phase 8 select-all), open the dialog, click Copy.
  The cap pre-check throws **before** any clipboard write, so no permission prompt: assert the
  friendly `clipboardTooLarge` message renders in the dialog error area. If selection copy is
  unreachable in this harness, verify via unit test only and note it in STATUS.md.
- **Vector ingestion**: page-side, build `values = new Float64Array(5_000_000)` filled by loop
  (`assertVectorLength` demands one value per row — first assert the negative: a 1M-value
  vector rejects with `VECTOR_LENGTH_MISMATCH`), then
  `await window.__dtPerf.table.actions.addDerivedColumn({ kind: 'vector', name: 'v5m', vectorType: 'float', values })`
  — completes in seconds (vs minutes on the 5,000-INSERT path), column visible with correct
  sampled cells after a horizontal sweep.
- Finish with the template's console sweep (step 11: zero new errors for the session) and
  cleanup (step 12). Attach the final snapshot + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; `npm run size` includes the worker-chunk entry; root entry
      byte-stable.
- [ ] Golden suite green; every divergence normalized-and-documented or changeset'd.
- [ ] DEEP full CSV export inside budget under `RUN_BROWSER_PERF`; peak-heap recorded; export
      column in the re-captured DEEP baseline.
- [ ] Cancel genuinely interrupts a running COPY (or the `conn.query` fallback is recorded);
      no `__export_*` files survive any failure path.
- [ ] Clipboard cap enforced in both entry points; message localizable via `Strings`.
- [ ] 100K-value vector ingests in ≤ budgeted messages with contents identical to the INSERT
      path; ≤ 10K vectors still use the literal path.
- [ ] Selected-rows exports correct in both Phase 8 variants at DEEP.
- [ ] Chrome script executed; evidence in STATUS.md.
- [ ] Changeset + docs + API snapshot updated; STATUS.md row + handoff filled.

## 9. Out of scope

New export formats (xlsx, Arrow IPC files); download-stream API redesign (Blob assembly is
fine); `FileSystemWritableFileStream` save-picker UX; changing Parquet export semantics beyond
the shared buffer/cancel improvements; pretty-JSON streaming; row-level export progress.

## 10. Docs / changeset obligations

- **Changeset (MINOR)** — 'Changed': CSV/JSON/NDJSON exports now run inside DuckDB (list every
  Changed matrix row: negative-number prefixing, timestamp/date text, BIGINT exactness,
  NULL-vs-empty, header escaping, NDJSON trailing newline); clipboard copies capped at 8 MB
  with a descriptive error. 'Added': `exportToBuffer` format widening + options; export cancel
  that truly interrupts; `Strings.export.clipboardTooLarge`. Migration notes for consumers
  parsing exported timestamps/epoch numbers.
- `docs/api-reference.md`: export helpers table (~`:353-362`) — `exportToBuffer` signature,
  clipboard cap, string-length caveat on the string-returning helpers (and fix the stale
  `copyToClipboard(rows, opts)` row while there).
- `docs/performance.md`: rewrite the export guidance — remove "exports materialize in JS"
  framing, document the COPY pipeline, the `pretty` exception, the clipboard cap, and the new
  worker-chunk size line (the `:515-529` bundle table also still shows dropped CJS rows —
  refresh it).
- API-surface snapshot (`npx vitest -u`) — diff must contain only the intended additions.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the final compatibility matrix (or a
pointer to the golden spec's doc block) with every Changed row; hour-one and final DEEP
peak-memory numbers and which hand-off tier shipped (transfer-only vs OPFS, and why); whether
COPY ran via the cancellable path or the documented fallback; exact `EXPORT.*` budget values;
worker-chunk size before/after and the new `.size-limit.cjs` cap; the rank-index COPY
experiment numbers; DEEP baseline before/after (export column); any Phase 8/10 shape drift you
absorbed — Phase 12 rewrites the docs from your recorded numbers.
