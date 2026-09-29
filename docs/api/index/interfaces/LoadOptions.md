[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:31](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L31)

Low-level options accepted by [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata): the format,
the table name, and how the source is read, per format (the fields of
[SourceOptions](SourceOptions.md)). Most consumers use the higher-level
`table.loadData(source, opts?)` facade instead, which builds these from a
`File` / URL / Blob input and its `sourceOptions`.

## Extends

- [`SourceOptions`](SourceOptions.md)

## Properties

### csv?

> `optional` **csv?**: [`CSVSourceOptions`](CSVSourceOptions.md)

Defined in: [data/sourceOptions.ts:84](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L84)

Read by a CSV load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`csv`](SourceOptions.md#csv)

***

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:32](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L32)

***

### json?

> `optional` **json?**: [`JSONSourceOptions`](JSONSourceOptions.md)

Defined in: [data/sourceOptions.ts:86](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L86)

Read by a JSON load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`json`](SourceOptions.md#json)

***

### parquet?

> `optional` **parquet?**: [`ParquetSourceOptions`](ParquetSourceOptions.md)

Defined in: [data/sourceOptions.ts:88](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L88)

Read by a Parquet load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`parquet`](SourceOptions.md#parquet)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:33](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L33)

***

### timezone?

> `optional` **timezone?**: `string`

Defined in: [data/sourceOptions.ts:82](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L82)

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
the load with `LOAD_INVALID_TIMEZONE`.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`timezone`](SourceOptions.md#timezone)
