[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSave

# Class: AutoSave

Defined in: [persistence/AutoSave.ts:58](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L58)

Listens to `TableState` mutations and writes a snapshot to the
[SessionStore](../../index/classes/SessionStore.md) on a debounced cadence so the table re-mounts in the
same state after a reload. Composed by the facade when `persistence: true`;
power users orchestrating their own state-store flow can construct one
directly.

## Constructors

### Constructor

> **new AutoSave**(`state`, `store`, `options?`): `AutoSave`

Defined in: [persistence/AutoSave.ts:76](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L76)

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

Defined in: [persistence/AutoSave.ts:209](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L209)

Permanently disable auto-save and clean up.

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [persistence/AutoSave.ts:165](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L165)

Unsubscribe from all signals and flush any pending save.

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [persistence/AutoSave.ts:89](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L89)

Subscribe to all persistent state signals and begin auto-saving.

#### Returns

`void`

***

### flushPendingSave()

> **flushPendingSave**(): `void`

Defined in: [persistence/AutoSave.ts:201](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/persistence/AutoSave.ts#L201)

If a debounced save is pending, execute it immediately and synchronously.
Uses SessionStore.saveSync() to enqueue the IDB write without yielding
to the microtask queue — critical during beforeunload/visibilitychange
where an async await may be skipped by the browser during page teardown.

#### Returns

`void`
