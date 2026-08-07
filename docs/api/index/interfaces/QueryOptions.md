[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryOptions

# Interface: QueryOptions

Defined in: [data/WorkerBridge.ts:51](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L51)

Options for [WorkerBridge.query](../classes/WorkerBridge.md#query).

## Properties

### cache?

> `optional` **cache?**: `boolean`

Defined in: [data/WorkerBridge.ts:57](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L57)

Set `false` to bypass the SQL result cache — both the read (a cached
result is ignored) and the write (the fresh result is not stored).
Default: SELECT queries are cached.

***

### priority?

> `optional` **priority?**: `"high"` \| `"normal"`

Defined in: [data/WorkerBridge.ts:63](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/WorkerBridge.ts#L63)

Worker queue priority. `'high'` jumps queued `'normal'` work (e.g.
stats/histogram queries) in the worker's serial dispatch queue —
intended for viewport row fetches. Default `'normal'`.
