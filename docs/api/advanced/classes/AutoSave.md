[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSave

# Class: AutoSave

Defined in: [persistence/AutoSave.ts:45](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L45)

## Constructors

### Constructor

> **new AutoSave**(`state`, `store`, `options?`): `AutoSave`

Defined in: [persistence/AutoSave.ts:56](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L56)

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

Defined in: [persistence/AutoSave.ts:167](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L167)

Permanently disable auto-save and clean up.

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [persistence/AutoSave.ts:136](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L136)

Unsubscribe from all signals and cancel any pending save.

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [persistence/AutoSave.ts:68](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L68)

Subscribe to all persistent state signals and begin auto-saving.

#### Returns

`void`

***

### flushPendingSave()

> **flushPendingSave**(): `void`

Defined in: [persistence/AutoSave.ts:159](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/AutoSave.ts#L159)

If a debounced save is pending, execute it immediately and synchronously.
Uses SessionStore.saveSync() to enqueue the IDB write without yielding
to the microtask queue — critical during beforeunload/visibilitychange
where an async await may be skipped by the browser during page teardown.

#### Returns

`void`
