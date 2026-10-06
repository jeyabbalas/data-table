[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryOptions

# Interface: QueryOptions

Defined in: [data/WorkerBridge.ts:54](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L54)

Options for [WorkerBridge.query](../classes/WorkerBridge.md#query).

## Properties

### cache?

> `optional` **cache?**: `boolean`

Defined in: [data/WorkerBridge.ts:60](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L60)

Set `false` to bypass the SQL result cache — both the read (a cached
result is ignored) and the write (the fresh result is not stored).
Default: SELECT queries are cached.

***

### priority?

> `optional` **priority?**: `"high"` \| `"normal"`

Defined in: [data/WorkerBridge.ts:66](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L66)

Worker queue priority. `'high'` jumps queued `'normal'` work (e.g.
stats/histogram queries) in the worker's serial dispatch queue —
intended for viewport row fetches. Default `'normal'`.
