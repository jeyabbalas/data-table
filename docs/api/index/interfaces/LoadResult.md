[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadResult

# Interface: LoadResult

Defined in: [data/DataLoader.ts:19](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/data/DataLoader.ts#L19)

Outcome of a successful `DataLoader.load`: the DuckDB table name the
data landed in, the row count, the column-name list, and the resolved
schema. Surfaced on the `loadComplete` event payload.

## Properties

### columns

> **columns**: `string`[]

Defined in: [data/DataLoader.ts:22](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/data/DataLoader.ts#L22)

***

### rowCount

> **rowCount**: `number`

Defined in: [data/DataLoader.ts:21](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/data/DataLoader.ts#L21)

***

### schema

> **schema**: [`ColumnSchema`](ColumnSchema.md)[]

Defined in: [data/DataLoader.ts:23](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/data/DataLoader.ts#L23)

***

### tableName

> **tableName**: `string`

Defined in: [data/DataLoader.ts:20](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/data/DataLoader.ts#L20)
