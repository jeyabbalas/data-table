[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:24](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L24)

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:32](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L32)

State mutation surface.

***

### bodyScroll

> **bodyScroll**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:28](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L28)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:36](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L36)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:34](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L34)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:26](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L26)

Grid root element that owns focus and receives keydown events.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:30](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/KeyboardNavigator.ts#L30)

Reactive state for the grid.
