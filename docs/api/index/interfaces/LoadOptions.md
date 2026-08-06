[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:31](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/data/WorkerBridge.ts#L31)

Low-level options accepted by [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata). Most consumers
use the higher-level `table.loadData(source, opts?)` facade instead, which
builds these from a `File` / URL / Blob input.

## Properties

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:32](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/data/WorkerBridge.ts#L32)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:33](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/data/WorkerBridge.ts#L33)
