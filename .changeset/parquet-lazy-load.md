---
'@jeyabbalas/data-table': minor
---

### Added

- `LoadError` code `LOAD_MEMORY_EXCEEDED`. A Parquet load that will not fit in browser memory now rejects before anything is loaded. The message names the check that failed — the table's share of DuckDB's free memory, or the load's peak against the 4 GiB WebAssembly limit — with its numbers, which `error.details` also carries (`check`, `neededBytes`, `availableBytes`, plus the estimated size, the memory limit, and the memory other tables already hold). If DuckDB still runs out partway through, the load rejects with the same code, `details.stage: 'load'`, and DuckDB's own message in `error.details.duckdbMessage` and at the end of `error.message`, and the partly built table is dropped. Such loads used to fail late with a raw DuckDB "Out of Memory" message under `LOAD_PARSE_FAILED`.

### Changed

- A Parquet `File`, `Blob`, or URL is no longer read into memory before loading. DuckDB reads the file from disk as it builds the table, so the file no longer has to fit in memory alongside it. A 1.5 GB file of 200,000 rows × 1,000 columns now loads in about 35 seconds in Chrome; it used to run out of memory. Typical files load about as fast as before. A Parquet `ArrayBuffer` is still copied into memory whole, so pass a `File` or `Blob` for large files.
- `table.loadData`, `actions.loadData`, and `WorkerBridge.loadData` accept a `Blob` directly. The facade used to convert a `Blob` to an `ArrayBuffer` first.
- If you self-host the worker script (`bridgeOptions.workerUrl` or `workerFactory`), copy the new worker file when you upgrade. The main thread now posts a Parquet `File` or `Blob` to the worker as is, and an older worker file cannot read it, so every Parquet load from a `File`, `Blob`, or URL fails.

### Fixed

- A load that fails no longer leaves the previous table in DuckDB for good. The next successful load, or `destroy()` over a shared `WorkerBridge`, drops it.
