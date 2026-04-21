[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridgeOptions

# Interface: WorkerBridgeOptions

Defined in: [data/WorkerBridge.ts:41](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L41)

Construction options for [WorkerBridge](../classes/WorkerBridge.md).

## Properties

### cache?

> `optional` **cache?**: `Partial`\<`QueryCacheOptions`\>

Defined in: [data/WorkerBridge.ts:43](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L43)

Query cache configuration (LRU size, TTL).

***

### duckdbBundles?

> `optional` **duckdbBundles?**: `DuckDBBundles`

Defined in: [data/WorkerBridge.ts:68](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L68)

DuckDB WASM bundles override for offline / self-hosted deployments.
Forwarded to the worker on init; when omitted the worker falls back
to `getJsDelivrBundles()`.

***

### initializeTimeoutMs?

> `optional` **initializeTimeoutMs?**: `number`

Defined in: [data/WorkerBridge.ts:49](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L49)

Maximum time (ms) to wait for the worker to signal ready and for
DuckDB to initialize. Rejects `initialize()` with a descriptive
error if exceeded. Default: 30000.

***

### workerFactory?

> `optional` **workerFactory?**: () => `Worker`

Defined in: [data/WorkerBridge.ts:56](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L56)

Custom worker factory. Takes precedence over [workerUrl](#workerurl) and the
built-in default. Useful for strict-CSP / bundler-specific deployments
where the default `new Worker(new URL(...), { type: 'module' })` cannot
be used. The caller is responsible for passing `{ type: 'module' }`.

#### Returns

`Worker`

***

### workerUrl?

> `optional` **workerUrl?**: `string` \| `URL`

Defined in: [data/WorkerBridge.ts:62](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/data/WorkerBridge.ts#L62)

Custom URL/path for the worker script. Instantiated via
`new Worker(workerUrl, { type: 'module' })`. Ignored if
[workerFactory](#workerfactory) is set.
