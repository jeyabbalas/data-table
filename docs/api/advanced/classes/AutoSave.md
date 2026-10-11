[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSave

# Class: AutoSave

Defined in: [persistence/AutoSave.ts:67](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L67)

Listens to `TableState` mutations and writes a snapshot to the
[SessionStore](../../index/classes/SessionStore.md) on a debounced cadence so the table re-mounts in the
same state after a reload. Composed by the facade when `persistence: true`;
power users orchestrating their own state-store flow can construct one
directly.

## Constructors

### Constructor

> **new AutoSave**(`state`, `store`, `options?`): `AutoSave`

Defined in: [persistence/AutoSave.ts:108](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L108)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### store

[`SessionStore`](../../index/classes/SessionStore.md)

##### options?

[`AutoSaveOptions`](../interfaces/AutoSaveOptions.md) = `{}`

#### Returns

`AutoSave`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [persistence/AutoSave.ts:282](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L282)

Permanently disable auto-save and clean up.

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [persistence/AutoSave.ts:205](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L205)

Unsubscribe from all signals and flush any pending save.

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [persistence/AutoSave.ts:121](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L121)

Subscribe to all persistent state signals and begin auto-saving.

#### Returns

`void`

***

### flushPendingSave()

> **flushPendingSave**(): `void`

Defined in: [persistence/AutoSave.ts:263](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/AutoSave.ts#L263)

If a debounced save is pending, or an asynchronous one is under way,
save now, synchronously: the state they would write, and newer. Uses
SessionStore.saveSync() to enqueue the IDB write without yielding to the
microtask queue — critical during beforeunload/visibilitychange where an
async await may be skipped by the browser during page teardown, and a
save under way may not get to write its session record.

#### Returns

`void`
