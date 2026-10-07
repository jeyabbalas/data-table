[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadDataResult

# Interface: LoadDataResult

Defined in: [data/WorkerBridge.ts:44](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/data/WorkerBridge.ts#L44)

Outcome of a successful [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata): the DuckDB table
name, the row count, the column-name list, and the resolved schema.
Internally maps to the public `loadComplete` event payload.

## Properties

### columns

> **columns**: `string`[]

Defined in: [data/WorkerBridge.ts:47](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/data/WorkerBridge.ts#L47)

***

### rowCount

> **rowCount**: `number`

Defined in: [data/WorkerBridge.ts:46](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/data/WorkerBridge.ts#L46)

***

### schema

> **schema**: [`ColumnSchema`](ColumnSchema.md)[]

Defined in: [data/WorkerBridge.ts:48](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/data/WorkerBridge.ts#L48)

***

### tableName

> **tableName**: `string`

Defined in: [data/WorkerBridge.ts:45](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/data/WorkerBridge.ts#L45)
