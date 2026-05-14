[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:25](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L25)

Construction options for [KeyboardNavigator](../classes/KeyboardNavigator.md).

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:33](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L33)

State mutation surface.

***

### bodyScroll

> **bodyScroll**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:29](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L29)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:37](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L37)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:35](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L35)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:27](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L27)

Grid root element that owns focus and receives keydown events.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:31](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/KeyboardNavigator.ts#L31)

Reactive state for the grid.
