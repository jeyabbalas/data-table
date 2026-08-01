[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SessionStoreOptions

# Interface: SessionStoreOptions

Defined in: [persistence/SessionStore.ts:211](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/SessionStore.ts#L211)

Optional per-instance configuration for [SessionStore](../classes/SessionStore.md). When omitted,
`SessionStore` is a pure read/write wrapper around IndexedDB; supplying
`onLoadIssue` enables structured surfacing of load-time problems that
don't merit a thrown error (today: future-version snapshot rejection,
surfaced as `code: 'PERSISTENCE_VERSION_REJECTED'`).

The facade wires this automatically when constructing an internal
`SessionStore`; consumers passing their own store can wire it themselves
to route the warning through the same path.

## Properties

### onLoadIssue?

> `optional` **onLoadIssue?**: (`issue`) => `void`

Defined in: [persistence/SessionStore.ts:222](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/SessionStore.ts#L222)

Called when `load()` rejects a stored snapshot for a reason the
consumer may want to surface as a warning (currently: a snapshot
whose `version` is outside `[1, SNAPSHOT_VERSION]`). Other
rejections — generic shape mismatch, IDB read failure, missing
snapshot — silently return `null` from `load` and do NOT call this.

`tableName` echoes the requested key. `details.version` is the
rejected version number; `details.expectedMax` is `SNAPSHOT_VERSION`.

#### Parameters

##### issue

###### code

`"PERSISTENCE_VERSION_REJECTED"`

###### details

\{ `expectedMax`: `number`; `version`: `number`; \}

###### details.expectedMax

`number`

###### details.version

`number`

###### tableName

`string`

#### Returns

`void`
