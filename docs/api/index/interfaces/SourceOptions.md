[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SourceOptions

# Interface: SourceOptions

Defined in: [data/sourceOptions.ts:78](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/sourceOptions.ts#L78)

How a source is read: passed as `sourceOptions` to `createDataTable()`,
`table.loadData()` and `actions.loadData()`, and spread into
`WorkerBridge.loadData()`'s options. A load reads the entry for its
source's format and ignores the others, so one object can go with sources
of any format. Every entry is checked before the load starts: a value of
the wrong type or out of range, or an unknown key, rejects the load with a
`LoadError` whose code is `LOAD_INVALID_OPTIONS` (or
`LOAD_INVALID_TIMEZONE`), and `details.option` names it. The table keeps
the data it had, as it does when DuckDB does not know the time zone or
the Parquet file lacks one of the `columns`.

## Extended by

- [`LoadOptions`](LoadOptions.md)

## Properties

### csv?

> `optional` **csv?**: [`CSVSourceOptions`](CSVSourceOptions.md)

Defined in: [data/sourceOptions.ts:95](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/sourceOptions.ts#L95)

Read by a CSV load.

***

### json?

> `optional` **json?**: [`JSONSourceOptions`](JSONSourceOptions.md)

Defined in: [data/sourceOptions.ts:97](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/sourceOptions.ts#L97)

Read by a JSON load.

***

### parquet?

> `optional` **parquet?**: [`ParquetSourceOptions`](ParquetSourceOptions.md)

Defined in: [data/sourceOptions.ts:99](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/sourceOptions.ts#L99)

Read by a Parquet load.

***

### timezone?

> `optional` **timezone?**: `string`

Defined in: [data/sourceOptions.ts:93](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/sourceOptions.ts#L93)

The time zone DuckDB works in, as an IANA name such as
`'America/New_York'`. SQL on TIMESTAMPTZ values uses it: date parts,
truncation, and casts to DATE or text, as in derived columns, SQL
filters and the bins of a date histogram. And in the text columns the
loader converts to dates and times, timestamps that carry this zone's
own offset load as TIMESTAMP, the local time as written, where other
offsets make the column TIMESTAMPTZ. Cells show TIMESTAMPTZ values in
UTC either way. It is a setting of the worker's DuckDB connection, so it
holds for every table on one `WorkerBridge`, and every load sets it: to
UTC unless given. Default: `'UTC'`. A name DuckDB does not know rejects
the load with `LOAD_INVALID_TIMEZONE`, and the table keeps the data it
had.
