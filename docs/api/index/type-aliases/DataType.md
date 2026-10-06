[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataType

# Type Alias: DataType

> **DataType** = `"integer"` \| `"float"` \| `"decimal"` \| `"string"` \| `"boolean"` \| `"uuid"` \| `"date"` \| `"timestamp"` \| `"time"` \| `"interval"` \| `"nested"`

Defined in: [core/types.ts:14](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L14)

Column data types supported by the library.

`'nested'` covers DuckDB's container types: LIST (`INTEGER[]`), fixed-size
ARRAY (`FLOAT[768]`), STRUCT, MAP, UNION and VARIANT. Their values are not
scalars; the grid shows DuckDB's text for them, and
`ColumnSchema.originalType` says which container a column is. A `JSON`
column is `'string'`.
