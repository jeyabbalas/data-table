[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridgeOptions

# Interface: WorkerBridgeOptions

Defined in: [data/WorkerBridge.ts:84](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L84)

Construction options for [WorkerBridge](../classes/WorkerBridge.md).

## Properties

### cache?

> `optional` **cache?**: `Partial`\<[`QueryCacheOptions`](QueryCacheOptions.md)\>

Defined in: [data/WorkerBridge.ts:86](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L86)

Query cache configuration (LRU size, TTL).

***

### duckdbBundles?

> `optional` **duckdbBundles?**: `object`

Defined in: [data/WorkerBridge.ts:145](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L145)

DuckDB-WASM bundles to load instead of jsDelivr's, for a self-hosted,
offline or strict-CSP deployment: `@duckdb/duckdb-wasm`'s
`DuckDBBundles`, whose URLs may also be `URL` objects. When omitted,
the worker loads `getJsDelivrBundles()`.

DuckDB's own worker fetches these files, not the library's: it starts
from a `blob:` URL, runs `importScripts(mainWorker)`, then fetches
`mainModule`, and the `coi` bundle starts its threads from
`pthreadWorker`. A `blob:` URL is no base for a relative URL, so
`initialize()` resolves each `mainModule`, `mainWorker` and
`pthreadWorker` against the page, `document.baseURI` (a `<base href>`
when it has one), before any worker exists, and posts the absolute
URLs. One that cannot be resolved, or that is not a string or a `URL`,
rejects `initialize()` with a `ConfigurationError` whose code is
`OPTIONS_INVALID` and whose `details.option` names it, such as
`'duckdbBundles.eh.mainWorker'`. Your object is not changed.

Copy every file from one `@duckdb/duckdb-wasm` version, pinned exactly
to `1.33.1-dev57.0`: the library's worker has DuckDB-WASM's JavaScript
built in (`1.33.1-dev57.0`), and the library is tested with it. A worker
script only runs with the `.wasm` files of its own version. See
`docs/guides/csp-and-offline.md` for the files, the Content Security
Policy and DuckDB's extensions.

**Trust boundary.** DuckDB runs these scripts and modules in your
origin. Treat the URLs as developer-controlled, never derived from
end-user input.

***

### initializeTimeoutMs?

> `optional` **initializeTimeoutMs?**: `number`

Defined in: [data/WorkerBridge.ts:92](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L92)

Maximum time (ms) to wait for the worker to signal ready and for
DuckDB to initialize. Rejects `initialize()` with a descriptive
error if exceeded. Default: 30000.

***

### workerFactory?

> `optional` **workerFactory?**: () => `Worker`

Defined in: [data/WorkerBridge.ts:104](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L104)

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

Defined in: [data/WorkerBridge.ts:115](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/data/WorkerBridge.ts#L115)

Custom URL/path for the worker script. Instantiated via
`new Worker(workerUrl, { type: 'module' })`. Ignored if
[workerFactory](#workerfactory) is set.

**Trust boundary.** The library does NOT validate the scheme, origin,
or content-type of `workerUrl`. Passing user-derived input here lets
an attacker run arbitrary JavaScript in your origin. Pin to a static
same-origin URL (or one served with appropriate CORS headers).
