[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AutoSave

# Class: AutoSave

Defined in: [persistence/AutoSave.ts:47](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L47)

## Constructors

### Constructor

> **new AutoSave**(`state`, `store`, `options?`): `AutoSave`

Defined in: [persistence/AutoSave.ts:59](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L59)

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

Defined in: [persistence/AutoSave.ts:197](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L197)

Permanently disable auto-save and clean up.

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [persistence/AutoSave.ts:153](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L153)

Unsubscribe from all signals and flush any pending save.

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [persistence/AutoSave.ts:72](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L72)

Subscribe to all persistent state signals and begin auto-saving.

#### Returns

`void`

***

### flushPendingSave()

> **flushPendingSave**(): `void`

Defined in: [persistence/AutoSave.ts:189](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/AutoSave.ts#L189)

If a debounced save is pending, execute it immediately and synchronously.
Uses SessionStore.saveSync() to enqueue the IDB write without yielding
to the microtask queue — critical during beforeunload/visibilitychange
where an async await may be skipped by the browser during page teardown.

#### Returns

`void`
