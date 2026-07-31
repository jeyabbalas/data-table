[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / EventEmitter

# Class: EventEmitter\<Events\>

Defined in: [core/EventEmitter.ts:45](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L45)

Type-safe pub/sub emitter parameterised by an event-shape map. Listeners
are isolated via try/catch so one throwing subscriber does not break later
listeners; errors route to an optional [ListenerErrorHandler](../type-aliases/ListenerErrorHandler.md) or fall
back to `console.error` + microtask rethrow. Used internally by
`createDataTable()` to expose `table.on/off`; reusable standalone for
custom UIs composed on `/advanced`.

## Type Parameters

### Events

`Events` *extends* `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new EventEmitter**\<`Events`\>(`onListenerError?`): `EventEmitter`\<`Events`\>

Defined in: [core/EventEmitter.ts:49](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L49)

#### Parameters

##### onListenerError?

[`ListenerErrorHandler`](../type-aliases/ListenerErrorHandler.md)\<`Events`\>

#### Returns

`EventEmitter`\<`Events`\>

## Methods

### emit()

> **emit**\<`K`\>(`event`, `data`): `void`

Defined in: [core/EventEmitter.ts:84](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L84)

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

Defined in: [core/EventEmitter.ts:138](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L138)

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

Defined in: [core/EventEmitter.ts:70](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L70)

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

Defined in: [core/EventEmitter.ts:57](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L57)

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

Defined in: [core/EventEmitter.ts:116](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L116)

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

Defined in: [core/EventEmitter.ts:127](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/core/EventEmitter.ts#L127)

Remove all listeners for an event, or all listeners if no event specified

#### Type Parameters

##### K

`K` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### event?

`K`

#### Returns

`void`
