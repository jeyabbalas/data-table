---
'@jeyabbalas/data-table': minor
---

### Added

- `sourceOptions` on `createDataTable()` and `table.loadData()` says how a source is read, per format: a CSV's `delimiter`, `header`, `skip`, `nullValues` and `sampleSize`; a JSON source's `format`, `sampleSize` and `maxDepth`; the Parquet `columns` to load; and the `timezone` DuckDB works in. `WorkerBridge.loadData()` takes the same fields next to `format`. The loaders had most of these options, but no public path reached them. New types: `SourceOptions`, `CSVSourceOptions`, `JSONSourceOptions` and `ParquetSourceOptions`.
- A `sampleSize` of `-1` has DuckDB type CSV or JSON columns from every row, for a file whose odd values come after the rows it samples by default.
- A load of some Parquet columns counts only those in the memory check before the load: the scan and prefetch estimates leave out the columns DuckDB does not read.

### Fixed

- `LOAD_INVALID_OPTIONS` and `LOAD_INVALID_TIMEZONE`, documented but unreachable, now reject a bad `sourceOptions` value before the source is read, with `details.option` naming it. A time zone DuckDB does not know rejects as `LOAD_INVALID_TIMEZONE`, listing the zones it suggests, and Parquet `columns` the file lacks as `LOAD_INVALID_OPTIONS`, naming them.
- `loadProgress` never fired: nothing passed the worker's progress messages on. The table now emits one per message, between `loadStart` and `loadComplete` or `loadError`, for the initial `source` load and for `table.loadData()`. An `onProgress` passed to `table.loadData()` or `actions.loadData()` is called with them too.
