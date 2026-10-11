[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SessionStore

# Class: SessionStore

Defined in: [persistence/SessionStore.ts:981](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L981)

IndexedDB-backed persistence store for `SessionSnapshot` records, keyed by
`tableName` — the loader-assigned DuckDB table name unless a `tableName` was
passed to `loadData()`. Not the table's `instanceId`, which is a DOM-id
qualifier and carries a fresh random suffix on every construction. A
snapshot's annotations are kept apart, in the `dt-annotations` database
under the same table name, in chunks, and written only when they change,
so that saving a sort or a column width does not copy a million
annotations again; they are written before the session record that names
them, so that a reload restores the last annotations that landed, whatever
point a write was cut off at (see [SessionStore.save](#save)).

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
import { SessionStore, createDataTable } from '@jeyabbalas/data-table';

// Share one store across many tables, each under a table name of its own:
const store = new SessionStore();
await store.open();

const t1 = await createDataTable({
  container: document.getElementById('one')!,
  source: '/a.csv',
  tableName: 'set_a',
  persistence: { sessionStore: store },
});
const t2 = await createDataTable({
  container: document.getElementById('two')!,
  source: '/b.csv',
  tableName: 'set_b',
  persistence: { sessionStore: store },
});

// Inspect persisted sessions:
const snapshot = await store.load('set_a');
```

## See

 - SessionSnapshot
 - AutoSave
 - ../../docs/guides/session-persistence.md

## Constructors

### Constructor

> **new SessionStore**(`options?`): `SessionStore`

Defined in: [persistence/SessionStore.ts:1004](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1004)

#### Parameters

##### options?

[`SessionStoreOptions`](../interfaces/SessionStoreOptions.md)

#### Returns

`SessionStore`

## Methods

### close()

> **close**(): `void`

Defined in: [persistence/SessionStore.ts:1712](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1712)

Close both database connections and reset state, once the operations
asked for before have ended, those asked for in the same task included:
a save under way, or waiting its turn, still lands, as
`DataTable.destroy()` needs of the saves it leaves, and a delete still
deletes. An operation asked for after opens the databases again, and
starts once those have ended; one asked for before the databases were
open, and still waiting for them, does nothing.

#### Returns

`void`

***

### delete()

> **delete**(`tableName`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:1649](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1649)

Delete a snapshot by table name, and its annotations record, head and
chunks, once the table's operations asked for before have ended; a save
among them that has not written its annotations yet writes nothing
more. No-op if db unavailable.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(): `Promise`\<`string`[]\>

Defined in: [persistence/SessionStore.ts:1687](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1687)

List all stored table names. Returns [] if db unavailable.

#### Returns

`Promise`\<`string`[]\>

***

### load()

> **load**(`tableName`): `Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

Defined in: [persistence/SessionStore.ts:1548](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1548)

Load a snapshot by table name. Returns `null` if not found, if IDB is
unavailable, or if the stored value fails a structural shape check (a
partially-tampered blob from a same-origin attacker, or a snapshot from
a future schema version we can't recognise).

Annotations saved in a record of their own come back in the snapshot's
`annotations`: the record the session record names, or, when that one
is not whole, the one it names as its fallback. When neither is, the
session comes back without them, and `onLoadIssue` is told
(`PERSISTENCE_ANNOTATIONS_DROPPED`), as is a `DataTable` that restores
the snapshot, which warns. Annotations saved in the session record
itself — by versions before the record, or by a custom store — win over
any record. A record a session saved without annotations stopped naming
is deleted, if it is still stored. A load waits for the table's
operations asked for before it, of this store or another: a save that a
closed store lets end lands first.

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md) \| `null`\>

***

### open()

> **open**(): `Promise`\<`boolean`\>

Defined in: [persistence/SessionStore.ts:1015](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1015)

Open the IndexedDB databases: `dt-sessions`, and `dt-annotations` for the
tables' annotations, in parallel. Returns true on success, false if
unavailable. When only `dt-annotations` cannot be opened, or lacks the
stores this version writes, sessions save their annotations in the
session record.

#### Returns

`Promise`\<`boolean`\>

***

### save()

> **save**(`snapshot`): `Promise`\<`void`\>

Defined in: [persistence/SessionStore.ts:1202](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1202)

Store a snapshot. No-op if `tableName` is null or IDB is unavailable
(private browsing, opt-out, no-IDB environment).

The snapshot's `annotations` go in a record of their own, in chunks,
written only when they are not the annotations this store last wrote or
read for the table, or when another tab has written the table's since;
the session record names that record. They go first, and the session
record only once they have landed, naming the record it named before as
a fallback, which their write keeps until it has: a reload at any
point, or a write that fails, restores the last annotations that
landed. A snapshot from `snapshotFromState` says whether its annotations
changed without their file being taken. Any other file is compared by
identity: by its `annotations` array and that array's length, so an
edit made in place, to a file this store wrote or loaded, is not seen
(an annotation pushed onto the array is). Operations on one table run
one at a time, in call order, whichever store asks for them, and a
[close](#close) lets those asked for before it end. When `dt-annotations`
could not be opened, the annotations stay in the session record.

Rejects with the underlying `DOMException` (typically
`QuotaExceededError`) when IDB IS available but the session record's
transaction fails — see `AutoSave` for the consumer-side mapping to a
typed `PersistenceError`. When only the annotations record fails, the
session record is saved with the annotations it held before, and the
save rejects with a `PersistenceError` whose `details.record` is
`'annotations'`. The "never throws" contract applies only to the no-IDB
fallback; quota and abort errors must reach the consumer.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`Promise`\<`void`\>

***

### saveSync()

> **saveSync**(`snapshot`): `void`

Defined in: [persistence/SessionStore.ts:1409](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L1409)

Synchronous save — enqueues the IDB puts (the session record's, and the
annotations record's chunks and head when they changed) without yielding
to the microtask queue. Use this in page lifecycle handlers
(beforeunload, visibilitychange) where an async await could be skipped
by the browser during page teardown.

Both go at once: the session record names the new annotations with the
record it named before as their fallback, and their write keeps every
record the head describes, so a page that goes before they land
restores that one. When another tab has written the table's annotations
since, the session record, which reads the stored one first, takes that
tab's record as the fallback instead. When the asynchronous write of the
same annotations is under way, the session record names it instead of
writing them again; an asynchronous save this overtakes writes nothing
more. When the stored session record names annotations this store does
not know of, the annotations go in the session record itself.

No-op if the database hasn't been opened yet or `tableName` is null.
Re-throws synchronously if `transaction()` / `put()` throws — typically
`QuotaExceededError`. `AutoSave.flushPendingSave` catches and
routes through `reportError`. When only the annotations record's put
throws, the session record is still enqueued, with the annotations it
held before, and a `PersistenceError` whose `details.record` is
`'annotations'` is thrown.

#### Parameters

##### snapshot

[`SessionSnapshot`](../../advanced/interfaces/SessionSnapshot.md)

#### Returns

`void`
