[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SessionStore

# Class: SessionStore

Defined in: [persistence/SessionStore.ts:268](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L268)

IndexedDB-backed persistence store for `SessionSnapshot` records, keyed by
`tableName` — the loader-assigned DuckDB table name unless a `tableName` was
passed to `loadData()`. Not the table's `instanceId`, which is a DOM-id
qualifier and carries a fresh random suffix on every construction.

`createDataTable()` constructs and manages one internally when
`persistence: true` (default). Construct your own to share one store
across multiple `DataTable` instances on a page, inject a differently-keyed
store, or swap the default for an app-specific backend (localStorage,
remote sync, in-memory mock). Open / read / list methods degrade
gracefully — they return `null` / `[]` when IndexedDB is unavailable
(private browsing, opt-out, no-IDB environment) and never throw — so
those environments fall back to a non-persistent session. Write methods
(`save`, `saveSync`, `delete`) reject / throw with the underlying
`DOMException` when IDB IS available but a transaction fails (typically
`QuotaExceededError`); see `AutoSave` for the consumer-side
mapping to a typed `PersistenceError`.

## Example

```ts
import {
  SessionStore,
  createDataTable,
} from '@jeyabbalas/data-table';

// Share one store across many tables:
const store = new SessionStore();
await store.open();

const t1 = await createDataTable({ container: '#one', data: csvA, sessionStore: store });
const t2 = await createDataTable({ container: '#two', data: csvB, sessionStore: store });

// Inspect persisted sessions:
const snapshot = await store.load('my-table');
```

## See

 - SessionSnapshot
 - AutoSave
 - ../../docs/guides/session-persistence.md

## Constructors

### Constructor

> **new SessionStore**(`options?`): `SessionStore`

Defined in: [persistence/SessionStore.ts:273](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L273)

#### Parameters

##### options?

[`SessionStoreOptions`](../interfaces/SessionStoreOptions.md)

#### Returns

`SessionStore`

## Methods

### close()

> **close**(): `void`

Defined in: [persistence/SessionStore.ts:436](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L436)

Close the database connection and reset state.

#### Returns

`void`

***

### delete()

> **delete**(`tableName`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:402](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L402)

Delete a snapshot by table name. No-op if db unavailable.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(): `Promise`\<`string`[]\>

Defined in: [persistence/SessionStore.ts:419](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L419)

List all stored table names. Returns [] if db unavailable.

#### Returns

`Promise`\<`string`[]\>

***

### load()

> **load**(`tableName`): `Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

Defined in: [persistence/SessionStore.ts:375](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L375)

Load a snapshot by table name. Returns `null` if not found, if IDB is
unavailable, or if the stored value fails a structural shape check (a
partially-tampered blob from a same-origin attacker, or a snapshot from
a future schema version we can't recognise).

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

***

### open()

> **open**(): `Promise`\<`boolean`\>

Defined in: [persistence/SessionStore.ts:278](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L278)

Open the IndexedDB database. Returns true on success, false if unavailable.

#### Returns

`Promise`\<`boolean`\>

***

### save()

> **save**(`snapshot`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:333](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L333)

Store a snapshot. No-op if `tableName` is null or IDB is unavailable
(private browsing, opt-out, no-IDB environment).

Rejects with the underlying `DOMException` (typically
`QuotaExceededError`) when IDB IS available but the transaction fails
— see `AutoSave` for the consumer-side mapping to a typed
`PersistenceError`. The "never throws" contract applies only to the
no-IDB fallback; quota and abort errors must reach the consumer.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`Promise`\<`void`\>

***

### saveSync()

> **saveSync**(`snapshot`): `void`

Defined in: [persistence/SessionStore.ts:361](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/SessionStore.ts#L361)

Synchronous save — enqueues an IDB put without yielding to the microtask
queue. Use this in page lifecycle handlers (beforeunload, visibilitychange)
where an async await could be skipped by the browser during page teardown.

No-op if the database hasn't been opened yet or `tableName` is null.
Re-throws synchronously if `transaction()` / `put()` throws — typically
`QuotaExceededError`. `AutoSave.flushPendingSave` catches and
routes through `reportError`.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`void`
