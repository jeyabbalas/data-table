[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:44](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L44)

Construction options for [KeyboardNavigator](../classes/KeyboardNavigator.md).

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:60](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L60)

State mutation surface.

***

### bodyScroll

> **bodyScroll**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:56](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L56)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:70](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L70)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getColumnHeaders?

> `optional` **getColumnHeaders?**: () => [`ColumnHeader`](../classes/ColumnHeader.md)[]

Defined in: [table/KeyboardNavigator.ts:68](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L68)

Late-bound accessor for the live ColumnHeader instances — `render()`
destroys and rebuilds them, so they cannot be captured at construction.
Without it, header-row navigation and F2 controls mode are inert.

#### Returns

[`ColumnHeader`](../classes/ColumnHeader.md)[]

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:62](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L62)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### gridElement?

> `optional` **gridElement?**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:54](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L54)

The `role="grid"` element that owns focus. Escape from controls mode
returns focus here. Defaults to `rootElement` when omitted.

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:49](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L49)

Element the keydown listener is attached to. Bubble-phase, so it sees
keystrokes from every descendant of the table root.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:58](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/KeyboardNavigator.ts#L58)

Reactive state for the grid.
