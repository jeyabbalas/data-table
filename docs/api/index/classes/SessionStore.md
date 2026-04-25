[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SessionStore

# Class: SessionStore

Defined in: [persistence/SessionStore.ts:169](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L169)

IndexedDB-backed persistence store for `SessionSnapshot` records, keyed by
`tableName` (which defaults to the table's `instanceId`).

`createDataTable()` constructs and manages one internally when
`persistence: true` (default). Construct your own to share one store
across multiple `DataTable` instances on a page, inject a differently-keyed
store, or swap the default for an app-specific backend (localStorage,
remote sync, in-memory mock). Every method degrades gracefully — returns
`null` / `[]` on failure and never throws — so private-browsing and
no-IndexedDB environments fall back to a non-persistent session.

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

> **new SessionStore**(): `SessionStore`

#### Returns

`SessionStore`

## Methods

### close()

> **close**(): `void`

Defined in: [persistence/SessionStore.ts:308](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L308)

Close the database connection and reset state.

#### Returns

`void`

***

### delete()

> **delete**(`tableName`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:274](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L274)

Delete a snapshot by table name. No-op if db unavailable.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(): `Promise`\<`string`[]\>

Defined in: [persistence/SessionStore.ts:291](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L291)

List all stored table names. Returns [] if db unavailable.

#### Returns

`Promise`\<`string`[]\>

***

### load()

> **load**(`tableName`): `Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

Defined in: [persistence/SessionStore.ts:257](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L257)

Load a snapshot by table name. Returns null if not found or db unavailable.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

***

### open()

> **open**(): `Promise`\<`boolean`\>

Defined in: [persistence/SessionStore.ts:174](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L174)

Open the IndexedDB database. Returns true on success, false if unavailable.

#### Returns

`Promise`\<`boolean`\>

***

### save()

> **save**(`snapshot`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:220](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L220)

Store a snapshot. No-op if tableName is null or db unavailable.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`Promise`\<`void`\>

***

### saveSync()

> **saveSync**(`snapshot`): `void`

Defined in: [persistence/SessionStore.ts:244](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/SessionStore.ts#L244)

Synchronous save — enqueues an IDB put without yielding to the microtask
queue. Use this in page lifecycle handlers (beforeunload, visibilitychange)
where an async await could be skipped by the browser during page teardown.

No-op if the database hasn't been opened yet or tableName is null.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`void`
