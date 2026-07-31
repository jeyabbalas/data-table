[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:31](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/data/WorkerBridge.ts#L31)

Low-level options accepted by [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata). Most consumers
use the higher-level `table.loadData(source, opts?)` facade instead, which
builds these from a `File` / URL / Blob input.

## Properties

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:32](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/data/WorkerBridge.ts#L32)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:33](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/data/WorkerBridge.ts#L33)
