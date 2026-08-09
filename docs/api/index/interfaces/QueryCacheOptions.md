[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryCacheOptions

# Interface: QueryCacheOptions

Defined in: [data/QueryCache.ts:17](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/data/QueryCache.ts#L17)

Tuning knobs for the per-bridge query result cache. Pass via
[WorkerBridgeOptions.cache](WorkerBridgeOptions.md#cache) (a `Partial<QueryCacheOptions>`) to
override either the LRU size or the TTL while keeping the other default.
Set `maxEntries: 0` to disable caching entirely.

## Properties

### maxEntries

> **maxEntries**: `number`

Defined in: [data/QueryCache.ts:19](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/data/QueryCache.ts#L19)

Maximum number of cached query results. Set to 0 to disable caching. Default: 100

***

### ttlMs

> **ttlMs**: `number`

Defined in: [data/QueryCache.ts:21](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/data/QueryCache.ts#L21)

Time-to-live in milliseconds for each cached entry. Default: 30000 (30s)
