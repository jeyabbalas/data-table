[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridge

# Class: WorkerBridge

Defined in: [data/WorkerBridge.ts:133](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L133)

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

Defined in: [data/WorkerBridge.ts:144](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L144)

#### Parameters

##### options?

[`WorkerBridgeOptions`](../interfaces/WorkerBridgeOptions.md)

#### Returns

`WorkerBridge`

## Methods

### clearQueryCache()

> **clearQueryCache**(): `void`

Defined in: [data/WorkerBridge.ts:374](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L374)

Clear all cached query results

#### Returns

`void`

***

### dropTable()

> **dropTable**(`tableName`): `Promise`\<`void`\>

Defined in: [data/WorkerBridge.ts:389](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L389)

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

Defined in: [data/WorkerBridge.ts:341](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L341)

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

Defined in: [data/WorkerBridge.ts:202](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L202)

Create the worker and wait for it to be ready.

Rejects with a descriptive error if the worker fails to signal ready
or DuckDB fails to initialize within `initializeTimeoutMs` (default 30s).

#### Returns

`Promise`\<`void`\>

***

### isInitialized()

> **isInitialized**(): `boolean`

Defined in: [data/WorkerBridge.ts:398](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L398)

Check if the bridge is initialized

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `options`, `onProgress?`, `signal?`): `Promise`\<[`LoadDataResult`](../interfaces/LoadDataResult.md)\>

Defined in: [data/WorkerBridge.ts:307](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L307)

Load data into DuckDB

Returns table name, row count, columns, and full schema info.
All metadata queries happen in the worker to avoid blocking the main thread.

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

> **query**\<`T`\>(`sql`, `signal?`): `Promise`\<`T`[]\>

Defined in: [data/WorkerBridge.ts:278](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L278)

Execute a SQL query

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### sql

`string`

##### signal?

`AbortSignal`

#### Returns

`Promise`\<`T`[]\>

***

### terminate()

> **terminate**(): `void`

Defined in: [data/WorkerBridge.ts:352](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/data/WorkerBridge.ts#L352)

Terminate the worker

#### Returns

`void`
