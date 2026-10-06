[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ParquetSourceOptions

# Interface: ParquetSourceOptions

Defined in: [data/sourceOptions.ts:54](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/data/sourceOptions.ts#L54)

How a Parquet source is read.

## Properties

### columns?

> `optional` **columns?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:61](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/data/sourceOptions.ts#L61)

The columns to load, by their names in the file (case-sensitive), in
this order. Default: every column. The others are never read, and the
memory check before the load counts only these. Leave out
`__rowid__`: the table adds that column itself.
