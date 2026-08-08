---
'@jeyabbalas/data-table': patch
---

Loading is roughly twice as fast and a fraction of the memory, `loadProgress` is emitted for the first time, and source buffers are transferred to the worker instead of copied.

Measured on the same machine, visualizations off, before → after:

| Tier                            | Load time         | Peak heap          |
| ------------------------------- | ----------------- | ------------------ |
| 1,000 columns × 60,000 rows     | 8.34 s → 4.07 s   | 228 MB → 32 MB     |
| 20 columns × 5,000,000 rows     | 11.19 s → 4.24 s  | 347 MB → 16 MB     |

**Fixed**

- `loadProgress` is now emitted. The event has been declared, typed, documented, and bound to a progress bar by one of the shipped examples for several releases, while nothing in the library ever fired it — `table.on('loadProgress', …)` was silent. It now reports through the whole load: `reading` from the main thread with real byte counts, then `parsing`, `analyzing`, and `indexing` from the worker. `percent` is `0`–`100`, never decreases, and the load ends with exactly one report at `100`.
- Progress stages describe what is happening rather than fixed guesses. The old sequence posted 0 %, 25 %, and 90 % around one opaque `await`, so the bar jumped to a quarter and sat there for the entire load. `analyzing` — a stage the types and the loading guide both promised and no code path emitted — is now real, and advances per type-detection batch.
- Only `reading` reports `cancelable: true`. `parsing` previously claimed to be cancelable; no running DuckDB statement can be interrupted, so that was never true.
- The API reference listed `loadProgress` stages as `download` / `decode` / `register` / `ingest` / `finalize`. None of those exist. The catalog and the loading guide now match what is emitted.

**Changed**

- **An `ArrayBuffer` passed to `loadData()` is now detached.** It is transferred to the worker rather than structured-cloned, which is most of the memory improvement above — a large source no longer exists twice at once. Its `byteLength` becomes `0` on the calling side and it cannot be read again. If you reuse the buffer after loading, pass `buffer.slice(0)` instead.
- Text type detection reads the source's first 4,096 rows instead of scanning every row, three times, once per column. Detection now costs the same on five million rows as on five thousand. The trade-off is explicit: a column whose values only start looking like timestamps *after* row 4,096 stays text, and so does one whose leading rows are unrepresentative — a low-cardinality column whose distribution changes later in the file is the case to watch. Conversion still uses `TRY_CAST`, so unparseable values become `NULL` rather than failing the load. Load Parquet if you need the types to come from the data rather than a sample.
- Detected type conversions are applied while the table is first materialized rather than by copying the whole table again afterwards — up to three extra full-table rewrites are gone, which is what the heap numbers above reflect.
- Invalid UTF-8 in a text source now fails the load with a DuckDB error instead of being silently replaced with `U+FFFD` and loaded as mojibake. A file whose real encoding is not UTF-8 needs converting before it is loaded.
- NDJSON detection reads a bounded 1 MiB prefix rather than decoding and splitting the whole document to look at line one. A JSON source whose first record is larger than 1 MiB is now detected as a JSON array; pass `sourceFormat` and the `format` load option if that applies to you.
- DuckDB is given a 2.5 GB memory limit at startup. Without one it inherits the WASM heap ceiling, where the first allocation it cannot satisfy aborts the worker outright with nothing to catch; the limit turns that into an ordinary out-of-memory rejection on `loadError`, with the previously loaded table still queryable.
