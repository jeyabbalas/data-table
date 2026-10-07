[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / WorkerBridge

# Class: WorkerBridge

Defined in: [data/WorkerBridge.ts:166](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L166)

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

Defined in: [data/WorkerBridge.ts:183](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L183)

#### Parameters

##### options?

[`WorkerBridgeOptions`](../interfaces/WorkerBridgeOptions.md)

#### Returns

`WorkerBridge`

## Methods

### clearQueryCache()

> **clearQueryCache**(): `void`

Defined in: [data/WorkerBridge.ts:541](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L541)

Clear all cached query results

#### Returns

`void`

***

### dropTable()

> **dropTable**(`tableName`): `Promise`\<`void`\>

Defined in: [data/WorkerBridge.ts:556](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L556)

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

Defined in: [data/WorkerBridge.ts:500](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L500)

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

Defined in: [data/WorkerBridge.ts:246](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L246)

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

Defined in: [data/WorkerBridge.ts:565](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L565)

Check if the bridge is initialized

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `options`, `onProgress?`, `signal?`): `Promise`\<[`LoadDataResult`](../interfaces/LoadDataResult.md)\>

Defined in: [data/WorkerBridge.ts:466](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L466)

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

Defined in: [data/WorkerBridge.ts:416](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L416)

Execute a SQL query.

SELECT results are served from and stored into the bridge's LRU+TTL
cache unless `options.cache === false`. `options.priority: 'high'`
makes the worker run this query ahead of queued normal-priority work
(viewport row fetches use this so they are not stuck behind
stats/histogram fan-outs).

Each row is a plain object whose own properties are its columns,
`__proto__` included. Integers arrive as numbers, the nearest one past
±2^53, except a HUGEINT or UHUGEINT at its ends, which arrives with the
wrong sign: the HUGEINT minimum positive, a UHUGEINT past 2^127
negative (the maximum as `-1`). A LIST or ARRAY value arrives as an
array, a STRUCT or MAP value as an object (a MAP's keys as strings; an
unnamed STRUCT, as `row(1, 'a')` builds, as an array), a UNION value as
its member's, and a BLOB as a `Uint8Array`. A DATE or TIMESTAMP, of any
precision and with or without a zone, arrives as epoch milliseconds, a
timestamp's digits past the millisecond as a fraction; DuckDB's
`infinity` and `-infinity` as `Infinity` and `-Infinity`; one past
±2^53 ms (after year 287396 or before 283458 BC) as the nearest number.

DECIMAL, HUGEINT and UHUGEINT values inside a nested value do not
arrive intact. In a LIST, ARRAY or STRUCT each reads as a meaningless
number (`[1.25, 2.50, 3.75]` as `[6.2e-322, 0, 1.235e-321]`,
`[-12::HUGEINT]` as `[NaN]`). Anywhere under a MAP or a UNION it reads
as a `Uint32Array` of the 32-bit words of its unscaled integer, low
first (`MAP {'a': 1.25}` as `{ a: Uint32Array [125, 0, 0, 0] }`), and a
MAP key as that integer's digits (`MAP {1.25: 'a'}` as
`{ '125': 'a' }`). An INTERVAL, nested or a column's own value, reads
as an `Int32Array` that does not hold it, and a MAP key as that array's
text (`'0,0'`). Inside a STRUCT, MAP or UNION, Arrow reads a date or
timestamp itself and gets DuckDB's `infinity` wrong: a TIMESTAMP's
fails the read (`9223372036854775 is not safe to convert to a
number`), as does a TIMESTAMP past ±2^53 ms, and a DATE's reads as
185542587100800000. Select an INTERVAL column as
`CAST(c AS VARCHAR)`, and a nested value as JSON text, which is exact:
`CAST(to_json(c) AS VARCHAR)` keeps every digit, a MAP's DECIMAL keys
included, and writes an INTERVAL as DuckDB does
(`"1 year 2 months 3 days"`) and `infinity` as `"infinity"`. `JSON.parse`
rounds integers past 2^53 and rejects the bare `NaN` and `Infinity`
DuckDB writes for non-finite DOUBLEs.

A VARIANT value cannot cross Arrow at all (`Unsupported Arrow type
VARIANT`), nor a value that holds one, and `to_json` gets those wrong
(`to_json(42::VARIANT)` is the string `"42"`). Select a VARIANT column
as `CAST(c AS JSON)`, or read any of these with `actions.getCellValue`
or `actions.getColumnValues`, which pick the SQL for each type.

The worker runs queries on a path that can be cancelled but receives
no ENUM dictionaries. So a result holding an ENUM, at any depth, is
computed a second time, on a path that has them, when the SQL is a
single query (a `SELECT`, `WITH`, `FROM` or `VALUES` query) that does
not name `nextval`. That second read cannot be cancelled: an abort
still rejects at once, but the worker finishes the read before its
next query. Anything else runs once, and its ENUM values arrive as
`null`: an `INSERT`, `UPDATE` or `DELETE … RETURNING`, several
statements in one text, and a query that calls `nextval`, whose
sequence a second run would advance again. A `nextval` called through
a view or a macro is not seen, and advances its sequence twice.
`CAST(e AS VARCHAR)` reads an ENUM's text in one run, in any
statement.

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

Defined in: [data/WorkerBridge.ts:511](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/data/WorkerBridge.ts#L511)

Terminate the worker

#### Returns

`void`
