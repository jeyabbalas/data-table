[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ParquetSourceOptions

# Interface: ParquetSourceOptions

Defined in: [data/sourceOptions.ts:49](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L49)

How a Parquet source is read.

## Properties

### columns?

> `optional` **columns?**: readonly `string`[]

Defined in: [data/sourceOptions.ts:55](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/sourceOptions.ts#L55)

The columns to load, by their names in the file (case-sensitive), in
this order. Default: every column. The others are never read, and the
memory check before the load counts only these.
