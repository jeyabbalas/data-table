[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadResult

# Interface: LoadResult

Defined in: [data/DataLoader.ts:18](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L18)

Outcome of a successful `DataLoader.load`: the DuckDB table name the
data landed in, the row count, the column-name list, and the resolved
schema. Surfaced on the `loadComplete` event payload.

## Properties

### columns

> **columns**: `string`[]

Defined in: [data/DataLoader.ts:21](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L21)

***

### rowCount

> **rowCount**: `number`

Defined in: [data/DataLoader.ts:20](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L20)

***

### schema

> **schema**: [`ColumnSchema`](ColumnSchema.md)[]

Defined in: [data/DataLoader.ts:22](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L22)

***

### tableName

> **tableName**: `string`

Defined in: [data/DataLoader.ts:19](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L19)
