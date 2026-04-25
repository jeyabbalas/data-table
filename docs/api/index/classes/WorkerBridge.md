[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridge

# Class: WorkerBridge

Defined in: [data/WorkerBridge.ts:107](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L107)

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

Defined in: [data/WorkerBridge.ts:118](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L118)

#### Parameters

##### options?

[`WorkerBridgeOptions`](../interfaces/WorkerBridgeOptions.md)

#### Returns

`WorkerBridge`

## Methods

### clearQueryCache()

> **clearQueryCache**(): `void`

Defined in: [data/WorkerBridge.ts:355](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L355)

Clear all cached query results

#### Returns

`void`

***

### exportToBuffer()

> **exportToBuffer**(`sql`, `format`, `signal?`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [data/WorkerBridge.ts:318](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L318)

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

Defined in: [data/WorkerBridge.ts:176](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L176)

Create the worker and wait for it to be ready.

Rejects with a descriptive error if the worker fails to signal ready
or DuckDB fails to initialize within `initializeTimeoutMs` (default 30s).

#### Returns

`Promise`\<`void`\>

***

### isInitialized()

> **isInitialized**(): `boolean`

Defined in: [data/WorkerBridge.ts:362](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L362)

Check if the bridge is initialized

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `options`, `onProgress?`, `signal?`): `Promise`\<`LoadDataResult`\>

Defined in: [data/WorkerBridge.ts:284](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L284)

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

`Promise`\<`LoadDataResult`\>

***

### query()

> **query**\<`T`\>(`sql`, `signal?`): `Promise`\<`T`[]\>

Defined in: [data/WorkerBridge.ts:252](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L252)

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

Defined in: [data/WorkerBridge.ts:333](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/WorkerBridge.ts#L333)

Terminate the worker

#### Returns

`void`
