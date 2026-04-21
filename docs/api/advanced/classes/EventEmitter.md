[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / EventEmitter

# Class: EventEmitter\<Events\>

Defined in: [core/EventEmitter.ts:25](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L25)

Advanced entry point — `@jeyabbalas/data-table/advanced`

Lower-level building blocks for consumers composing custom UIs on top
of the library: the state store, table/filter/derived-column components,
export helpers, persistence snapshot serializers, `AutoSave`, statistics
internals, and visualization primitives.

Most consumers should use the root entry (`createDataTable()`) instead;
reach for this module only when the façade does not expose what you need.

## Type Parameters

### Events

`Events` *extends* `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new EventEmitter**\<`Events`\>(`onListenerError?`): `EventEmitter`\<`Events`\>

Defined in: [core/EventEmitter.ts:29](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L29)

#### Parameters

##### onListenerError?

`ListenerErrorHandler`\<`Events`\>

#### Returns

`EventEmitter`\<`Events`\>

## Methods

### emit()

> **emit**\<`K`\>(`event`, `data`): `void`

Defined in: [core/EventEmitter.ts:64](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L64)

Emit an event with data. Each listener is invoked inside a try/catch so
a throwing listener cannot break subsequent listeners. Errors are routed
to `onListenerError` if supplied; otherwise logged and re-thrown in a
microtask so global error handlers (window.onerror, Sentry) can capture
them without aborting `emit`.

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### data

`Events`\[`K`\]

#### Returns

`void`

***

### listenerCount()

> **listenerCount**\<`K`\>(`event`): `number`

Defined in: [core/EventEmitter.ts:119](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L119)

Get the number of listeners for an event

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

#### Returns

`number`

***

### off()

> **off**\<`K`\>(`event`, `callback`): `void`

Defined in: [core/EventEmitter.ts:50](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L50)

Unsubscribe from an event

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### callback

`EventCallback`\<`Events`\[`K`\]\>

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`event`, `callback`): () => `void`

Defined in: [core/EventEmitter.ts:37](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L37)

Subscribe to an event

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### callback

`EventCallback`\<`Events`\[`K`\]\>

#### Returns

Unsubscribe function

() => `void`

***

### once()

> **once**\<`K`\>(`event`, `callback`): () => `void`

Defined in: [core/EventEmitter.ts:97](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L97)

Subscribe to an event for a single occurrence

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event

`K`

##### callback

`EventCallback`\<`Events`\[`K`\]\>

#### Returns

Unsubscribe function

() => `void`

***

### removeAllListeners()

> **removeAllListeners**\<`K`\>(`event?`): `void`

Defined in: [core/EventEmitter.ts:108](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/EventEmitter.ts#L108)

Remove all listeners for an event, or all listeners if no event specified

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event?

`K`

#### Returns

`void`
