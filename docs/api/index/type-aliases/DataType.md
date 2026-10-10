[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataType

# Type Alias: DataType

> **DataType** = `"integer"` \| `"float"` \| `"decimal"` \| `"string"` \| `"boolean"` \| `"uuid"` \| `"date"` \| `"timestamp"` \| `"time"` \| `"interval"` \| `"nested"`

Defined in: [core/types.ts:19](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L19)

Column data types supported by the library.

`'nested'` covers DuckDB's container types: LIST (`INTEGER[]`), fixed-size
ARRAY (`FLOAT[768]`), STRUCT, MAP, UNION and VARIANT. Their values are not
scalars; the grid shows DuckDB's text for them, and
`ColumnSchema.originalType` says which container a column is. A `JSON`
column is `'string'`.

## Example

```ts
// The columns whose values are lists, structs, maps and the like
const nested = table.state.schema.get().filter((column) => column.type === 'nested');
nested.map((column) => column.originalType); // ['VARCHAR[]', 'STRUCT(x DOUBLE, y DOUBLE)']
```
