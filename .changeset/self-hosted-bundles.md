---
'@jeyabbalas/data-table': patch
---

Self-hosted DuckDB-WASM bundles now load from URLs relative to the page or from `URL` objects, and DuckDB failing to start rejects at once with a typed `WorkerInitError` instead of a 30 s timeout or a `QueryError`.

**Fixed**

- `bridgeOptions.duckdbBundles` URLs resolve against the page, its `document.baseURI` (a `<base href>` when it has one), when `WorkerBridge.initialize()` starts, before any worker exists. DuckDB's own worker fetches these files, from a `blob:` URL that is no base for a relative URL, so a root-relative path such as `/duckdb/duckdb-browser-eh.worker.js`, which every self-hosting recipe in the docs used, failed at `importScripts`.
- `URL` objects are accepted as bundle URLs. One used to throw a `DataCloneError` from `postMessage`, which was not a `DataTableError`.
- A bundle URL that is not a URL string or a `URL`, or that does not resolve, rejects `initialize()` with a `ConfigurationError` whose code is `OPTIONS_INVALID` and whose `details.option` names it, such as `'duckdbBundles.eh.mainWorker'`. The object you pass is not changed.
- DuckDB's worker failing to start rejects `initialize()` at once with a `WorkerInitError` whose code is `WORKER_CRASHED` and whose message says what to check: its `mainWorker` not loading (a 404, or a URL the Content Security Policy blocks), named in the message, or a `worker-src` without `blob:`, which used to wait for the 30 s timeout. Any failure of DuckDB's init in the worker is now a `WorkerInitError`, not a `QueryError` coded `QUERY_RUNTIME`, and calling `initialize()` again starts a new worker. A `.wasm` file that does not load or compile still ends in `WORKER_INIT_TIMEOUT`, whose message now names the usual causes: duckdb-wasm leaves that error unhandled.
- A request sent while `initialize()` runs rejects with the init's error when DuckDB fails to start or times out, instead of waiting for good.
- A worker that could not be constructed, from a `workerFactory` that throws or the default worker on another origin, no longer leaves `initialize()` returning the same rejection: calling it again constructs the worker again.
- The library's default worker fails with a `WorkerInitError` (`WORKER_CRASHED`) whose message names `bridgeOptions.workerFactory` and the Content Security Policy. A library served from another origin than the page threw the browser's `SecurityError` instead (now with `details.source: 'default'`), and a worker script the page's policy blocks said only "The worker script failed to load".

**Changed**

- `WorkerBridgeOptions.duckdbBundles` takes `URL` objects as well as strings, so its type is no longer duckdb-wasm's `DuckDBBundles`: code that reads `WorkerBridgeOptions['duckdbBundles']` as a `DuckDBBundles`, or passes it on to duckdb-wasm, no longer compiles. Passing a `DuckDBBundles` to the option still does.
- The self-hosting docs now describe a setup the library's browser test runs: DuckDB-WASM's files copied from `@duckdb/duckdb-wasm` pinned to exactly `1.33.1-dev57.0`; DuckDB's `icu` extension, which every load needs, mirrored with `parquet` and `json`, through an absolute `custom_extension_repository`; and one Content Security Policy sent with every response, with `'wasm-unsafe-eval'` and `worker-src 'self' blob:` and no `'unsafe-eval'`, in Chromium. See `docs/guides/csp-and-offline.md`.
