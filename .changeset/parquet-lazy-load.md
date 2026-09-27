---
'@jeyabbalas/data-table': minor
---

### Added

- `LoadError` code `LOAD_MEMORY_EXCEEDED`. A Parquet load that will not fit in browser memory now rejects before anything is loaded, with the estimated size, the memory limit, and the memory other tables already hold in `error.details`. If DuckDB still runs out partway through, the load rejects with the same code and DuckDB's error as `cause`. Such loads used to fail late with a raw DuckDB "Out of Memory" message under `LOAD_PARSE_FAILED`.

### Changed

- A Parquet `File`, `Blob`, or URL is no longer read into memory before loading. DuckDB reads the file from disk as it builds the table, so the file no longer has to fit in memory alongside it. A 1.5 GB file of 200,000 rows × 1,000 columns now loads in about 35 seconds in Chrome; it used to run out of memory. Typical files load about as fast as before. A Parquet `ArrayBuffer` is still copied into memory whole, so pass a `File` or `Blob` for large files.
- `table.loadData`, `actions.loadData`, and `WorkerBridge.loadData` accept a `Blob` directly. The facade used to convert a `Blob` to an `ArrayBuffer` first.
