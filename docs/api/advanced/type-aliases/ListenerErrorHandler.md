[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ListenerErrorHandler

# Type Alias: ListenerErrorHandler\<Events\>

> **ListenerErrorHandler**\<`Events`\> = (`error`, `event`) => `void`

Defined in: [core/EventEmitter.ts:32](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/core/EventEmitter.ts#L32)

Optional listener-error handler hook for [EventEmitter](../classes/EventEmitter.md). Receives the
thrown value and the event key whose listener threw. The default behaviour
(when not provided) logs the error and rethrows it inside a microtask so
`window.onerror` / Sentry can capture it without aborting the emit loop.

## Type Parameters

### Events

`Events` *extends* `Record`\<`string`, `unknown`\>

## Parameters

### error

`unknown`

### event

keyof `Events`

## Returns

`void`
