[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridge

# Class: WorkerBridge

Defined in: [data/WorkerBridge.ts:154](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L154)

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

Defined in: [data/WorkerBridge.ts:171](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L171)

#### Parameters

##### options?

[`WorkerBridgeOptions`](../interfaces/WorkerBridgeOptions.md)

#### Returns

`WorkerBridge`

## Methods

### clearQueryCache()

> **clearQueryCache**(): `void`

Defined in: [data/WorkerBridge.ts:498](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L498)

Clear all cached query results

#### Returns

`void`

***

### dropTable()

> **dropTable**(`tableName`): `Promise`\<`void`\>

Defined in: [data/WorkerBridge.ts:513](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L513)

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

Defined in: [data/WorkerBridge.ts:457](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L457)

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

Defined in: [data/WorkerBridge.ts:234](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L234)

Create the worker and wait for it to be ready.

Rejects with a descriptive error if the worker fails to signal ready
or DuckDB fails to initialize within `initializeTimeoutMs` (default 30s).

If the worker fails later, with an error it does not catch, every
pending request rejects with a `WorkerInitError` whose code is
`WORKER_CRASHED`, and so does every later call, until `initialize()` is
called again: it starts a new worker, with an empty database.

#### Returns

`Promise`\<`void`\>

***

### isInitialized()

> **isInitialized**(): `boolean`

Defined in: [data/WorkerBridge.ts:522](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L522)

Check if the bridge is initialized

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `options`, `onProgress?`, `signal?`): `Promise`\<[`LoadDataResult`](../interfaces/LoadDataResult.md)\>

Defined in: [data/WorkerBridge.ts:423](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L423)

Load data into DuckDB

Returns table name, row count, columns, and full schema info.
All metadata queries happen in the worker to avoid blocking the main thread.

Pass a Parquet source as a `Blob` or `File` where you can: DuckDB then
reads it from disk as it loads, instead of holding the whole file in
memory next to the table. A load that would not fit in memory rejects
with a `LoadError` whose code is `LOAD_MEMORY_EXCEEDED`.

How the source is read (`timezone`, `csv`, `json`, `parquet`) is checked
before anything is sent: a bad value rejects with a `LoadError` whose
code is `LOAD_INVALID_OPTIONS` or `LOAD_INVALID_TIMEZONE`. Each format's
options go in its own entry, `{ format: 'csv', csv: { delimiter: ';' } }`:
any other key here, such as a `delimiter` next to `format`, is ignored.

#### Parameters

##### source

`string` \| `Blob` \| `ArrayBuffer`

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

Defined in: [data/WorkerBridge.ts:373](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L373)

Execute a SQL query.

SELECT results are served from and stored into the bridge's LRU+TTL
cache unless `options.cache === false`. `options.priority: 'high'`
makes the worker run this query ahead of queued normal-priority work
(viewport row fetches use this so they are not stuck behind
stats/histogram fan-outs).

Each row is a plain object keyed by column name. Integers arrive as
numbers (the nearest one, past ±2^53), a LIST or ARRAY value as an
array, a STRUCT or MAP value as an object (a MAP's keys as strings; an
unnamed STRUCT, as `row(1, 'a')` builds, as an array), and a BLOB as a
`Uint8Array`.

DECIMAL, HUGEINT and INTERVAL values inside a LIST, ARRAY, STRUCT or MAP
do not arrive intact: a nested DECIMAL or HUGEINT reads as a meaningless
number (`[1.25, 2.50, 3.75]` as `[6.2e-322, 0, 1.235e-321]`), and an
INTERVAL, nested or a column's own value, as an `Int32Array` that does
not hold it. Select an INTERVAL column as `CAST(c AS VARCHAR)`, and a
nested value as JSON text, which is exact: `CAST(to_json(c) AS VARCHAR)`
keeps every digit and writes an INTERVAL as DuckDB does
(`"1 year 2 months 3 days"`). `JSON.parse` rounds integers past 2^53
and rejects the bare `NaN` and `Infinity` DuckDB writes for non-finite
DOUBLEs.

A VARIANT value cannot cross Arrow at all (`Unsupported Arrow type
VARIANT`), nor a value that holds one, and `to_json` gets those wrong
(`to_json(42::VARIANT)` is the string `"42"`). Select a VARIANT column
as `CAST(c AS JSON)`, or read any of these with `actions.getCellValue`
or `actions.getColumnValues`, which pick the SQL for each type.

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

#### Example

```ts
// Viewport row fetch: skip the cache, jump the queue, abortable.
const rows = await bridge.query(sql, controller.signal, {
  cache: false,
  priority: 'high',
});
```

***

### terminate()

> **terminate**(): `void`

Defined in: [data/WorkerBridge.ts:468](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/WorkerBridge.ts#L468)

Terminate the worker

#### Returns

`void`
