[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridge

# Class: WorkerBridge

Defined in: [data/WorkerBridge.ts:199](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L199)

Promise-based RPC layer between the main thread and the DuckDB Web Worker.

`createDataTable()` constructs one internally. Construct your own and pass
it via `createDataTable({ bridge })` to share a single worker (and therefore
a single DuckDB context) across multiple tables on a page, or to override
`workerFactory` / `workerUrl` / `duckdbBundles` for strict-CSP and
air-gapped deployments.

## Example

```ts
import { WorkerBridge, createDataTable } from '@jeyabbalas/data-table';

const bridge = new WorkerBridge();
await bridge.initialize();

const t1 = await createDataTable({ container: '#one', data: csv1, bridge });
const t2 = await createDataTable({ container: '#two', data: csv2, bridge });

// Later, on full-page teardown:
await t1.destroy();
await t2.destroy();
bridge.terminate();
```

## See

 - WorkerBridgeOptions
 - createDataTable

## Constructors

### Constructor

> **new WorkerBridge**(`options?`): `WorkerBridge`

Defined in: [data/WorkerBridge.ts:211](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L211)

#### Parameters

##### options?

[`WorkerBridgeOptions`](../interfaces/WorkerBridgeOptions.md)

#### Returns

`WorkerBridge`

## Methods

### clearQueryCache()

> **clearQueryCache**(): `void`

Defined in: [data/WorkerBridge.ts:484](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L484)

Clear all cached query results

#### Returns

`void`

***

### dropTable()

> **dropTable**(`tableName`): `Promise`\<`void`\>

Defined in: [data/WorkerBridge.ts:499](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L499)

Drop a table from DuckDB if it exists. The identifier is double-quoted
(matching the worker-side loaders), so any tableName the bridge issued
to a `loadData` call is safe to pass back here.

Idempotent — a missing table is not an error. Used by `DataTable` to
reclaim the previous base table on reload and on `destroy()` over a
shared bridge. Exposed publicly so consumers managing ad-hoc tables
via `bridge.query('CREATE TABLE …')` have a symmetric drop helper
without re-implementing identifier quoting.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<`void`\>

***

### exportToBuffer()

> **exportToBuffer**(`sql`, `format`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [data/WorkerBridge.ts:451](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L451)

Export data to a binary file format via DuckDB COPY TO.

The SQL query is wrapped in COPY (...) TO on the worker side.
Returns the file contents as a Uint8Array.

#### Parameters

##### sql

`string`

##### format

`"parquet"`

##### signal?

`AbortSignal`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [data/WorkerBridge.ts:269](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L269)

Create the worker and wait for it to be ready.

Rejects with a descriptive error if the worker fails to signal ready
or DuckDB fails to initialize within `initializeTimeoutMs` (default 30s).

#### Returns

`Promise`\<`void`\>

***

### isInitialized()

> **isInitialized**(): `boolean`

Defined in: [data/WorkerBridge.ts:508](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L508)

Check if the bridge is initialized

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `options`, `onProgress?`, `signal?`): `Promise`\<[`LoadDataResult`](../interfaces/LoadDataResult.md)\>

Defined in: [data/WorkerBridge.ts:411](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L411)

Load data into DuckDB

Returns table name, row count, columns, and full schema info.
All metadata queries happen in the worker to avoid blocking the main thread.

An `ArrayBuffer` source is **transferred**, not copied: it is detached on
return and the caller must not read it again.

#### Parameters

##### source

`string` \| `ArrayBuffer`

##### options

[`LoadOptions`](../interfaces/LoadOptions.md)

##### onProgress?

[`ProgressCallback`](../type-aliases/ProgressCallback.md)

##### signal?

`AbortSignal`

#### Returns

`Promise`\<[`LoadDataResult`](../interfaces/LoadDataResult.md)\>

***

### query()

> **query**\<`T`\>(`sql`, `signal?`, `options?`): `Promise`\<`T`[]\>

Defined in: [data/WorkerBridge.ts:368](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L368)

Execute a SQL query.

SELECT results are served from and stored into the bridge's LRU+TTL
cache unless `options.cache === false`. `options.priority` picks a
tier in the worker's serial queue, which drains `'high'` →
`'normal'` → `'low'`: viewport row fetches use `'high'` so they are
never stuck behind a stats/histogram fan-out, and those fan-outs use
`'low'` so they yield to anything interactive.

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### sql

`string`

SQL text to execute.

##### signal?

`AbortSignal`

Optional abort signal; aborting rejects with
  `QUERY_ABORTED` and posts a targeted cancel to the worker.

##### options?

[`QueryOptions`](../interfaces/QueryOptions.md)

Cache and priority behavior — see [QueryOptions](../interfaces/QueryOptions.md).

#### Returns

`Promise`\<`T`[]\>

#### Examples

```ts
// Viewport row fetch: skip the cache, jump the queue, abortable.
const rows = await bridge.query(sql, controller.signal, {
  cache: false,
  priority: 'high',
});
```

```ts
// Background column-summary scan: yields to rows and to filters.
const summary = await bridge.query(sql, undefined, { priority: 'low' });
```

***

### terminate()

> **terminate**(): `void`

Defined in: [data/WorkerBridge.ts:462](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/data/WorkerBridge.ts#L462)

Terminate the worker

#### Returns

`void`
