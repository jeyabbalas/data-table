[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / LoadOptions

# Interface: LoadOptions

Defined in: [data/WorkerBridge.ts:31](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/data/WorkerBridge.ts#L31)

Low-level options accepted by [WorkerBridge.loadData](../classes/WorkerBridge.md#loaddata). Most consumers
use the higher-level `table.loadData(source, opts?)` facade instead, which
builds these from a `File` / URL / Blob input.

## Properties

### format

> **format**: `"csv"` \| `"json"` \| `"parquet"`

Defined in: [data/WorkerBridge.ts:32](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/data/WorkerBridge.ts#L32)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/WorkerBridge.ts:33](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/data/WorkerBridge.ts#L33)
