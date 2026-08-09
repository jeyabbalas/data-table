[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadDataResult

# Interface: LoadDataResult

Defined in: [data/WorkerBridge.ts:41](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/data/WorkerBridge.ts#L41)

Outcome of a successful [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata): the DuckDB table
name, the row count, the column-name list, and the resolved schema.
Internally maps to the public `loadComplete` event payload.

## Properties

### columns

> **columns**: `string`[]

Defined in: [data/WorkerBridge.ts:44](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/data/WorkerBridge.ts#L44)

***

### rowCount

> **rowCount**: `number`

Defined in: [data/WorkerBridge.ts:43](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/data/WorkerBridge.ts#L43)

***

### schema

> **schema**: [`ColumnSchema`](ColumnSchema.md)[]

Defined in: [data/WorkerBridge.ts:45](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/data/WorkerBridge.ts#L45)

***

### tableName

> **tableName**: `string`

Defined in: [data/WorkerBridge.ts:42](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/data/WorkerBridge.ts#L42)
