[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridgeOptions

# Interface: WorkerBridgeOptions

Defined in: [data/WorkerBridge.ts:51](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L51)

Construction options for [WorkerBridge](../classes/WorkerBridge.md).

## Properties

### cache?

> `optional` **cache?**: `Partial`\<[`QueryCacheOptions`](QueryCacheOptions.md)\>

Defined in: [data/WorkerBridge.ts:53](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L53)

Query cache configuration (LRU size, TTL).

***

### duckdbBundles?

> `optional` **duckdbBundles?**: `DuckDBBundles`

Defined in: [data/WorkerBridge.ts:94](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L94)

DuckDB WASM bundles override for offline / self-hosted deployments.
Forwarded to the worker on init; when omitted the worker falls back
to `getJsDelivrBundles()`.

**Trust boundary.** The bundle URLs are passed verbatim to
`@duckdb/duckdb-wasm`'s `selectBundle`, which `fetch`-es them and
instantiates WASM. Treat as developer-controlled — never derived from
end-user input. See `docs/integrations/csp-and-offline.md` for the
recommended self-hosting pattern.

***

### initializeTimeoutMs?

> `optional` **initializeTimeoutMs?**: `number`

Defined in: [data/WorkerBridge.ts:59](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L59)

Maximum time (ms) to wait for the worker to signal ready and for
DuckDB to initialize. Rejects `initialize()` with a descriptive
error if exceeded. Default: 30000.

***

### workerFactory?

> `optional` **workerFactory?**: () => `Worker`

Defined in: [data/WorkerBridge.ts:71](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L71)

Custom worker factory. Takes precedence over [workerUrl](#workerurl) and the
built-in default. Useful for strict-CSP / bundler-specific deployments
where the default `new Worker(new URL(...), { type: 'module' })` cannot
be used. The caller is responsible for passing `{ type: 'module' }`.

**Trust boundary.** The returned `Worker` runs JavaScript with full
access to the calling page's origin. Treat this option as
developer-controlled — never invoke the factory with values derived
from end-user input.

#### Returns

`Worker`

***

### workerUrl?

> `optional` **workerUrl?**: `string` \| `URL`

Defined in: [data/WorkerBridge.ts:82](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/data/WorkerBridge.ts#L82)

Custom URL/path for the worker script. Instantiated via
`new Worker(workerUrl, { type: 'module' })`. Ignored if
[workerFactory](#workerfactory) is set.

**Trust boundary.** The library does NOT validate the scheme, origin,
or content-type of `workerUrl`. Passing user-derived input here lets
an attacker run arbitrary JavaScript in your origin. Pin to a static
same-origin URL (or one served with appropriate CORS headers).
