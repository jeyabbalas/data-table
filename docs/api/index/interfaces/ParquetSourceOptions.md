[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ParquetSourceOptions

# Interface: ParquetSourceOptions

Defined in: [data/sourceOptions.ts:54](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L54)

How a Parquet source is read.

## Properties

### columns?

> `optional` **columns?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:63](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/sourceOptions.ts#L63)

The columns to load, by their names in the file (case-sensitive), in
this order. Default: every column. The others are never read, and the
memory check before the load counts only these. Leave out
`__rowid__`: the table adds that column itself. A name the file lacks
rejects the load with `LOAD_INVALID_OPTIONS`, listing the names in
`details.missing`, and the table keeps the data it had.
