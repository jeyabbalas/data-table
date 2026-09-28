---
'@jeyabbalas/data-table': patch
---

### Fixed

- Loading a Parquet `File`, `Blob` or URL no longer fails once DuckDB's memory has grown past 2 GiB, which a few large loads in one page reach. Such a load failed with "too small to be a Parquet file" or "Prefetch registered for bytes outside file … file size: 0", and so did every load after it: duckdb-wasm's runtime lost the size of any file it opened at a memory address above 2 GiB. The library now corrects this in DuckDB's worker.
