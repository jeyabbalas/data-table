[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SessionStoreOptions

# Interface: SessionStoreOptions

Defined in: [persistence/SessionStore.ts:884](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L884)

Optional per-instance configuration for [SessionStore](../classes/SessionStore.md). When omitted,
`SessionStore` is a pure read/write wrapper around IndexedDB; supplying
`onLoadIssue` enables structured surfacing of load-time problems that
don't merit a thrown error: a future-version snapshot rejected
(`code: 'PERSISTENCE_VERSION_REJECTED'`), and annotations a session was
saved with that could not be attached to it
(`code: 'PERSISTENCE_ANNOTATIONS_DROPPED'`).

The facade wires this automatically when constructing an internal
`SessionStore`; consumers passing their own store can wire it themselves
to route the warning through the same path.

## Methods

### onLoadIssue()?

> `optional` **onLoadIssue**(`issue`): `void`

Defined in: [persistence/SessionStore.ts:911](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/SessionStore.ts#L911)

Called when `load()` drops all or part of a stored session for a reason
the consumer may want to surface as a warning. Switch on `issue.code`;
`tableName` echoes the requested key.

- `'PERSISTENCE_VERSION_REJECTED'`: the snapshot's `version` is outside
  `[1, SNAPSHOT_VERSION]`, and `load` returns `null`. `details.version`
  is the rejected version number; `details.expectedMax` is
  `SNAPSHOT_VERSION`.
- `'PERSISTENCE_ANNOTATIONS_DROPPED'`: the session was saved with
  annotations that cannot be attached to it, and `load` returns it
  without them. `details.reason` is `'missing'` (no annotations record),
  `'mismatch'` (the table's record is another save's, which replaced
  both the one the session was saved with and its fallback: another
  tab's, written at the same moment), `'invalid'` (a malformed record or
  marker, or one of a format this version does not read) or
  `'unavailable'` (the annotations database could not be read).
  `details.count`, when known, is how many annotations the session was
  saved with. A record this version could not read stays, and the
  session goes on naming it, until the table has annotations to write.
  A `DataTable` that restores the snapshot warns of it too (a `warning`
  event), whoever owns the store.

Other rejections — generic shape mismatch, IDB read failure, missing
snapshot — silently return `null` from `load` and do NOT call this.

#### Parameters

##### issue

\{ `code`: `"PERSISTENCE_VERSION_REJECTED"`; `details`: \{ `expectedMax`: `number`; `version`: `number`; \}; `tableName`: `string`; \} \| \{ `code`: `"PERSISTENCE_ANNOTATIONS_DROPPED"`; `details`: \{ `count?`: `number`; `reason`: `"missing"` \| `"mismatch"` \| `"invalid"` \| `"unavailable"`; \}; `tableName`: `string`; \}

#### Returns

`void`
