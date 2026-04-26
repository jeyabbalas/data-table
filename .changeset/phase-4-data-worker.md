---
'@jeyabbalas/data-table': patch
---

Phase 4 — Worker, data loading, type inference. Closes the largest remaining test gap in the repo and fixes the long-standing worker `cancel` TODO.

**Worker-side cancel implemented**

- `src/worker/dispatcher.ts` (extracted from `worker.ts` for testability) now tracks an in-flight `{ id, type }` reference and, on receipt of a `cancel` message whose `targetId` matches, calls `connection.cancelSent()`. Mismatched targetIds reply with `{ cancelled: false, reason: 'no-matching-inflight' }`. Previously the worker accepted the cancel message but did nothing — DuckDB kept grinding the orphaned query.
- New error code `QUERY_CANCELLED` (worker-side, when DuckDB interrupts an in-flight query/load/export) is distinct from the existing `QUERY_ABORTED` (bridge-side, when the consumer's `AbortSignal` fires before the worker reply lands). Consumers branching on `QUERY_ABORTED` continue to work; `QUERY_CANCELLED` is purely additive. See [`docs/migration-guides/phase-4-cancel-codes.md`](../docs/migration-guides/phase-4-cancel-codes.md).
- DuckDB does not ship a typed `CancelledError`; the worker maps interrupt-shaped rejection messages (`INTERRUPT`, `interrupted`, `cancelled`) to `QUERY_CANCELLED` via a single `isCancelRejection` helper. Future DuckDB-WASM versions could add a typed cancel class — the heuristic lives in one place behind a documented helper.
- `docs/troubleshooting.md` gains the `QUERY_CANCELLED` row; `tests/api-surface.error-codes.test.ts` (Phase 3 lock) auto-validates the addition.

**Loaders made testable: optional `{ db, conn }` context**

- `loadCSV` / `loadJSON` / `loadParquet` accept an optional third `LoaderContext` argument. When supplied, the loader uses the provided `AsyncDuckDB` / `AsyncDuckDBConnection` instead of the module-level singletons in `src/worker/duckdb.ts`. Production callers (`worker.ts` → `dispatcher.ts`) omit it and behavior is unchanged. Internal seam — loaders are not exported from `src/index.ts` or `src/advanced.ts`.

**End-to-end loader integration tests against real fixtures**

- New `tests/helpers/duckdbNode.ts` builds a real `AsyncDuckDB` against `@duckdb/duckdb-wasm/dist/duckdb-node.cjs` using `worker_threads.Worker` plus a tiny bootstrap script (`tests/helpers/duckdbNodeWorkerBoot.cjs`) that installs the DOM-Worker shape on `global` so duckdb-wasm's worker module can run inside Node. Tests pass `{ db, conn }` directly into the loaders.
- New `tests/helpers/fixtures.ts`, `tests/helpers/mockWorker.ts` round out the test infra. `mockWorker` consolidates the inline mock-worker patterns previously duplicated in `tests/data/WorkerBridge.workerFactory.test.ts:18-24` and `tests/security/workerBridgeProtocol.test.ts`.
- New tests:
  - `tests/worker/loaders/csv.integration.test.ts` (13) — titanic, nyc_taxi (100k), vins_de_france, us_customer_orders, plus reserved-column / delimiter / timezone / string-vs-buffer paths.
  - `tests/worker/loaders/json.integration.test.ts` (12) — titanic, nyc_taxi, vins_de_france, test_patterns, plus NDJSON auto-detection and option validation.
  - `tests/worker/loaders/parquet.integration.test.ts` (8) — titanic, nyc_taxi, numeric-stress, datetime-stress, plus selective `columns` and reserved-name rejection.
  - `tests/worker/loaders/numericStress.test.ts` (14) — locks per-format type inference for mixed-type, all-NULL, single-value, scientific notation, extreme magnitudes.
  - `tests/worker/loaders/datetimeStress.test.ts` (19) — locks per-format DATE / TIME / TIMESTAMP / TIMESTAMPTZ behavior, epoch / Y2K / leap-year boundaries, ambiguous date strings staying VARCHAR, and one documented quirk: `str_date_compact` (8-digit numerics) is sniffed as integer by DuckDB CSV.
  - `tests/worker/cancel.test.ts` (8) — dispatcher cancel paths, in-flight tracking, INTERRUPT-message rewrap to `QUERY_CANCELLED`.

**Type inference + pattern detection behavior locked**

- `tests/data/TypeInference.behavior.test.ts` (18) — drives `inferStringColumnType` against a real DuckDB connection. Locks: all-NULL → string with confidence 0, mixed-type → string, scientific notation → float, leading zeros, boolean variants (`true`/`false`/`yes`/`no`/`Y`/`N`/`1`/`0`), ISO date/timestamp/time, US (MM > 12 → `month >12` resolution wait, day > 12) and EU disambiguators, ambiguous-slash dates → string, high-cardinality strings, and the `minConfidence` demotion gate.
- `tests/data/PatternDetector.behavior.test.ts` (13) — UUID / email / URL / IPv4 / phone / identifier acceptance plus tie-breaking precedence and a deferred-feature lock asserting currency / percentage / unit strings currently return `pattern: null` (so adding those detectors later becomes a deliberate, observable change).
- `tests/data/QueryCache.invalidation.test.ts` (6) — default `maxEntries=100` LRU eviction, 200-distinct-set stress, every `state.*` signal triggers `bridge.clearQueryCache`, unsub stops triggers, TTL=0 immediate-expiry semantics, and TTL boundary hit/miss.

**WorkerBridge race / lifecycle / error round-trip**

- `tests/data/WorkerBridge.cancel.test.ts` (6) — early `AbortSignal.aborted` → `QUERY_ABORTED`, mid-flight abort dispatches a `cancel` `WorkerMessage` with the matching `targetId`, worker `QUERY_CANCELLED` reply reconstructs as `QueryError({ code: 'QUERY_CANCELLED' })`, cancel-after-completion is a no-op, abort-listener cleanup, cache not poisoned by aborted SELECT.
- `tests/data/WorkerBridge.parallel.test.ts` (4) — 100 concurrent queries replied in reverse / random order all resolve to the matching caller; one failing query among 99 successes only rejects that promise; identical SELECTs hit the cache and don't re-dispatch.
- `tests/data/WorkerBridge.lifecycle.test.ts` (6) — `initializeTimeoutMs` honored on inert workers, `terminate()` rejects every pending request with `WorkerTerminatedError`, terminate→re-`initialize()` flow, two-bridge isolation, `isInitialized()` flips, no-op on uninitialized bridge.
- `tests/data/WorkerBridge.errorRoundTrip.test.ts` (20) — every error subclass (`WorkerInitError`, `WorkerTerminatedError`, `QueryError` × 3 codes, `LoadError` × 2, `SQLValidationError`, `DerivedColumnError` × 2, `PersistenceError` × 2, `AnnotationError`, `ExportError`, `ConfigurationError` × 2, `DestroyedError`) round-trips with `code` / `details` / `message` preserved. BigInt in `details` survives structured-clone. No-code error defaults to `QueryError(QUERY_RUNTIME)`.
- `tests/data/WorkerBridge.bundles.test.ts` (5) — `duckdbBundles` forwarding into the `init` payload (omitted, present), `workerFactory` failure paths surface `WorkerInitError({ code: 'WORKER_CRASHED', details.source })`, `workerUrl` constructor failure path.

**Performance baseline (opt-in)**

- `tests/performance/benchmarks.duckdb.test.ts` (4) — gated by `RUN_DUCKDB_PERF=1`. Budgets keyed off local M1 medians × 4-5 for CI variance: nyc_taxi.parquet load < 8000ms; nyc_taxi.csv load < 15000ms; 100 cached SELECTs < 150ms; 100 uncached random-WHERE COUNT(\*)s < 3000ms. Default `npm test` skips the file.

**Strict-TS rollout for the data + worker slice**

- `noPropertyAccessFromIndexSignature: true` was temporarily enabled and the data + worker slice cleaned: 11 sites in `src/worker/duckdb.ts` (interval-shape reads) and `src/worker/loaders/common.ts` (DESCRIBE row reads) flipped to bracket access. Flag is OFF globally — `~83` sites in other slices (`src/annotations/`, `src/filters/FilterPresets.ts`, `src/persistence/SessionStore.ts`, `src/table/`, `src/visualizations/histogram/IntervalHistogramData.ts`) remain to be cleaned by their respective phases per the Phase 0 §11 routing (Phase 5 / 6 / 7 / 8). Phase 9 flips the flag globally.
- `noUncheckedIndexedAccess: true` was temporarily enabled and the data + worker slice cleaned: 17 sites in `src/data/TypeInference.ts` (regex `match[i]` reads + `daysInMonth[month-1]` access) and `src/worker/loaders/{common.ts, json.ts}` flipped to non-null-assertion-after-bounds-check. Flag is OFF globally; subsystem phases continue cleaning per Phase 0 §11.

**Worker dispatcher extracted for testability**

- `src/worker/worker.ts` is now a thin entry point that wires `self.onmessage` → `handleMessage` from the new `src/worker/dispatcher.ts`. The split lets tests drive `handleMessage` directly via vi.mock against `./duckdb` and `./loaders/*`. Two `@internal` test-only exports (`__resetInFlightForTests`, `__getInFlightForTests`) are stripped from `dist/.d.ts` by `stripInternal: true` (Phase 2). No public-API change.

**Tests:** 3007 → 3163 (+156 added; 4 opt-in-skipped → 152 active in default run). **Coverage:** every metric ticked up — statements 73.17% → 74.66%, branches 60.15% → 61.57%, functions 78.28% → 80.47%, lines 75.01% → 76.46%. Worker loaders move from near-zero to 89-93% per file. **No public-API runtime surface change** — every api-surface gate (`exports`, `snapshot`, `jsdoc`, `error-codes`, `private-paths`, `cjs-routing`) stays green untouched. **No new dependencies** added — `@duckdb/duckdb-wasm` was already a peer dep.
