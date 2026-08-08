[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / QueryOptions

# Interface: QueryOptions

Defined in: [data/WorkerBridge.ts:51](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L51)

Options for [WorkerBridge.query](../classes/WorkerBridge.md#query).

## Properties

### cache?

> `optional` **cache?**: `boolean`

Defined in: [data/WorkerBridge.ts:57](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L57)

Set `false` to bypass the SQL result cache — both the read (a cached
result is ignored) and the write (the fresh result is not stored).
Default: SELECT queries are cached.

***

### priority?

> `optional` **priority?**: `"high"` \| `"normal"` \| `"low"`

Defined in: [data/WorkerBridge.ts:77](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/data/WorkerBridge.ts#L77)

Worker queue priority. The worker's serial dispatch queue drains
strictly `'high'` → `'normal'` → `'low'`. Default `'normal'`.

- `'high'` — viewport row fetches. Jumps every queued `'normal'` and
  `'low'` task so scrolling never waits on background work.
- `'normal'` — everything interactive-but-not-scroll: filter counts,
  exports, loads, ad-hoc queries.
- `'low'` — background or decorative work that must never delay a
  viewport row: header histograms / value-counts, column-stats
  scans, and any host-app query whose result the user is not
  currently waiting on. Pick this whenever the query is a full-table
  scan issued on the host app's own initiative rather than in direct
  response to a user action.

Starvation of `'low'` is by design and safe only because low-tier
work is bounded — issue it for what is on screen, not for the whole
table.
