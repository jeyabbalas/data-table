---
'@jeyabbalas/data-table': minor
---

A Parquet `File`, `Blob` or URL is read from disk as the table is built, not copied into memory first, and a load that will not fit rejects before it starts, with `LOAD_MEMORY_EXCEEDED`.

**Added**

- `LoadError` code `LOAD_MEMORY_EXCEEDED`. A Parquet load that will not fit in browser memory now rejects before anything is loaded. The message names the check that failed — the table's share of DuckDB's free memory, or the load's peak against the 4 GiB WebAssembly limit — with its numbers, which `error.details` also carries (`check`, `neededBytes`, `availableBytes`, plus the estimated size, the memory limit, and the memory other tables already hold). If DuckDB still runs out partway through, the load rejects with the same code, `details.stage: 'load'`, and DuckDB's own message in `error.details.duckdbMessage` and at the end of `error.message`, and the partly built table is dropped. Such loads used to fail late with a raw DuckDB "Out of Memory" message under `LOAD_PARSE_FAILED`.

**Changed**

- A Parquet `File`, `Blob`, or URL is no longer read into memory before loading. DuckDB reads the file from disk as it builds the table, so the file no longer has to fit in memory alongside it. A 1.1 GB file of 200,000 rows × 1,000 columns now loads in about 11 seconds in Chrome. Copying the file into memory first, as before, ran out of memory at 1,000 columns somewhere between 150,000 and 200,000 rows. Typical files load about as fast as before; near the memory limit, or with very large row groups, a file is read a column chunk at a time, two to four times slower. A Parquet `ArrayBuffer` is still copied into memory whole, so pass a `File` or `Blob` for large files.
- `table.loadData`, `actions.loadData`, and `WorkerBridge.loadData` accept a `Blob` directly. The facade used to convert a `Blob` to an `ArrayBuffer` first.

**Fixed**

- A load that fails no longer leaves the previous table in DuckDB for good. The next successful load, or `destroy()` over a shared `WorkerBridge`, drops it.

**Changed (breaking)**

- If you self-host the worker script (`bridgeOptions.workerUrl` or `workerFactory`), copy the new worker file when you upgrade. The main thread now posts a Parquet `File` or `Blob` to the worker as is, and an older worker file cannot read it, so every Parquet load from a `File`, `Blob`, or URL fails.

**Migration**

- A self-hosted worker file: copy the new one; see [Self-hosted workers and offline deployments](./docs/migration-guides/from-0.8-to-0.9.md#3-self-hosted-workers-and-offline-deployments).
