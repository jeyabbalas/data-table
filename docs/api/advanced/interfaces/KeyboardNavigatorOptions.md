[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:53](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L53)

Construction options for [KeyboardNavigator](../classes/KeyboardNavigator.md).

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:69](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L69)

State mutation surface.

***

### bodyScroll

> **bodyScroll**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:65](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L65)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:79](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L79)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getColumnHeaders?

> `optional` **getColumnHeaders?**: () => [`ColumnHeader`](../classes/ColumnHeader.md)[]

Defined in: [table/KeyboardNavigator.ts:77](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L77)

Late-bound accessor for the live ColumnHeader instances — `render()`
destroys and rebuilds them, so they cannot be captured at construction.
Without it, header-row navigation and F2 controls mode are inert.

#### Returns

[`ColumnHeader`](../classes/ColumnHeader.md)[]

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:71](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L71)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### gridElement?

> `optional` **gridElement?**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:63](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L63)

The `role="grid"` element that owns focus. Escape from controls mode
returns focus here. Defaults to `rootElement` when omitted.

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:58](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L58)

Element the keydown listener is attached to. Bubble-phase, so it sees
keystrokes from every descendant of the table root.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:67](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/KeyboardNavigator.ts#L67)

Reactive state for the grid.
