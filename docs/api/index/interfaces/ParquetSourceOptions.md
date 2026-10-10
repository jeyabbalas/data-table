[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ParquetSourceOptions

# Interface: ParquetSourceOptions

Defined in: [data/sourceOptions.ts:54](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L54)

How a Parquet source is read.

## Properties

### columns?

> `optional` **columns?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:63](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/sourceOptions.ts#L63)

The columns to load, by their names in the file (case-sensitive), in
this order. Default: every column. The others are never read, and the
memory check before the load counts only these. Leave out
`__rowid__`: the table adds that column itself. A name the file lacks
rejects the load with `LOAD_INVALID_OPTIONS`, listing the names in
`details.missing`, and the table keeps the data it had.
