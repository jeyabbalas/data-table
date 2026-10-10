[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:34](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L34)

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

Defined in: [data/sourceOptions.ts:95](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L95)

Read by a CSV load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`csv`](SourceOptions.md#csv)

***

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:35](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L35)

***

### json?

> `optional` **json?**: [`JSONSourceOptions`](JSONSourceOptions.md)

Defined in: [data/sourceOptions.ts:97](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L97)

Read by a JSON load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`json`](SourceOptions.md#json)

***

### parquet?

> `optional` **parquet?**: [`ParquetSourceOptions`](ParquetSourceOptions.md)

Defined in: [data/sourceOptions.ts:99](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L99)

Read by a Parquet load.

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`parquet`](SourceOptions.md#parquet)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:36](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L36)

***

### timezone?

> `optional` **timezone?**: `string`

Defined in: [data/sourceOptions.ts:93](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L93)

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

#### Inherited from

[`SourceOptions`](SourceOptions.md).[`timezone`](SourceOptions.md#timezone)
