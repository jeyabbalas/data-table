[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:31](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/data/WorkerBridge.ts#L31)

Low-level options accepted by [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata). Most consumers
use the higher-level `table.loadData(source, opts?)` facade instead, which
builds these from a `File` / URL / Blob input.

## Properties

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:32](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/data/WorkerBridge.ts#L32)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:33](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/data/WorkerBridge.ts#L33)
