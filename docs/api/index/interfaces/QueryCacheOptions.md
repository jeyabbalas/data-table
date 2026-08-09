[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryCacheOptions

# Interface: QueryCacheOptions

Defined in: [data/QueryCache.ts:17](https://github.com/jeyabbalas/data-table/blob/22d54ac8218eb0fa7175bf162920780da4351b59/src/data/QueryCache.ts#L17)

Tuning knobs for the per-bridge query result cache. Pass via
[WorkerBridgeOptions.cache](WorkerBridgeOptions.md#cache) (a `Partial<QueryCacheOptions>`) to
override any of them while keeping the others at their defaults.
Set `maxEntries: 0` to disable caching entirely.

## Properties

### maxBytes

> **maxBytes**: `number`

Defined in: [data/QueryCache.ts:38](https://github.com/jeyabbalas/data-table/blob/22d54ac8218eb0fa7175bf162920780da4351b59/src/data/QueryCache.ts#L38)

Approximate upper bound on the total size of cached results, in bytes.
Default: 33554432 (32 MiB).

A companion to [QueryCacheOptions.maxEntries](#maxentries), not a replacement:
100 entries means very different things for a 20-column table and a
1,000-column one, and the count alone cannot tell them apart. Over
budget, entries are evicted least-recently-used first until the total
fits; a single result whose own estimate exceeds the budget is not stored
at all rather than emptying the cache for it.

The estimate is deliberately cheap and deliberately approximate — a JSON
sample of the first rows scaled to the whole result, plus per-row object
overhead — because an exact figure would cost more than the cache saves.
Treat it as an order of magnitude, not an allocator.

***

### maxEntries

> **maxEntries**: `number`

Defined in: [data/QueryCache.ts:19](https://github.com/jeyabbalas/data-table/blob/22d54ac8218eb0fa7175bf162920780da4351b59/src/data/QueryCache.ts#L19)

Maximum number of cached query results. Set to 0 to disable caching. Default: 100

***

### ttlMs

> **ttlMs**: `number`

Defined in: [data/QueryCache.ts:21](https://github.com/jeyabbalas/data-table/blob/22d54ac8218eb0fa7175bf162920780da4351b59/src/data/QueryCache.ts#L21)

Time-to-live in milliseconds for each cached entry. Default: 30000 (30s)
