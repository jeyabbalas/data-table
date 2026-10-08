[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryOptions

# Interface: QueryOptions

Defined in: [data/WorkerBridge.ts:54](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/WorkerBridge.ts#L54)

Options for [WorkerBridge.query](../classes/WorkerBridge.md#query).

## Properties

### cache?

> `optional` **cache?**: `boolean`

Defined in: [data/WorkerBridge.ts:60](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/WorkerBridge.ts#L60)

Set `false` to bypass the SQL result cache — both the read (a cached
result is ignored) and the write (the fresh result is not stored).
Default: SELECT queries are cached.

***

### priority?

> `optional` **priority?**: `"high"` \| `"elevated"` \| `"normal"`

Defined in: [data/WorkerBridge.ts:78](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/data/WorkerBridge.ts#L78)

Where the query goes in the worker's serial dispatch queue, which runs
one query at a time, the queued `'high'` ones first, then the
`'elevated'` ones, then the `'normal'` ones, each in the order posted:

- `'high'`: viewport row fetches, the rows the grid is waiting to show.
- `'elevated'`: an interactive read of a few values that someone is
  waiting on, such as `actions.getCellValue`, the value inspector's
  read of one cell, or the row count of a filter change. It runs ahead
  of queued chart and stats queries, and behind the viewport's row
  fetches.
- `'normal'` (the default): background work, such as column charts,
  stats, prefetches and exports.

A query that is already running is never interrupted by one of higher
priority.
