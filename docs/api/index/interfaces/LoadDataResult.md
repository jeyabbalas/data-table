[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadDataResult

# Interface: LoadDataResult

Defined in: [data/WorkerBridge.ts:41](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L41)

Outcome of a successful [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata): the DuckDB table
name, the row count, the column-name list, and the resolved schema.
Internally maps to the public `loadComplete` event payload.

## Properties

### columns

> **columns**: `string`[]

Defined in: [data/WorkerBridge.ts:44](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L44)

***

### rowCount

> **rowCount**: `number`

Defined in: [data/WorkerBridge.ts:43](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L43)

***

### schema

> **schema**: [`ColumnSchema`](ColumnSchema.md)[]

Defined in: [data/WorkerBridge.ts:45](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L45)

***

### tableName

> **tableName**: `string`

Defined in: [data/WorkerBridge.ts:42](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L42)
