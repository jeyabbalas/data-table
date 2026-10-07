[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ListenerErrorHandler

# Type Alias: ListenerErrorHandler\<Events\>

> **ListenerErrorHandler**\<`Events`\> = (`error`, `event`) => `void`

Defined in: [core/EventEmitter.ts:32](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/EventEmitter.ts#L32)

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
