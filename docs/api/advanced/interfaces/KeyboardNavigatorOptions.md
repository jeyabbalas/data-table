[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:73](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L73)

Construction options for [KeyboardNavigator](../classes/KeyboardNavigator.md).

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:89](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L89)

State mutation surface.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/KeyboardNavigator.ts:135](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L135)

Write a transient message to a polite live region. Column layout mode is
invisible without it — a width or a new position is not something the
cursor announces on its own. `TableContainer.announce` is the wiring.

#### Parameters

##### message

`string`

#### Returns

`void`

***

### bodyScroll

> **bodyScroll**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:85](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L85)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:129](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L129)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getColumnHeaders?

> `optional` **getColumnHeaders?**: () => [`ColumnHeader`](../classes/ColumnHeader.md)[]

Defined in: [table/KeyboardNavigator.ts:98](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L98)

Late-bound accessor for the live ColumnHeader instances — `render()`
adds, removes and rebuilds them, so they cannot be captured at
construction. Without it, header-row navigation and F2 controls mode are
inert.

#### Returns

[`ColumnHeader`](../classes/ColumnHeader.md)[]

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:91](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L91)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### gridElement?

> `optional` **gridElement?**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:83](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L83)

The `role="grid"` element that owns focus. Escape from controls mode
returns focus here. Defaults to `rootElement` when omitted.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/KeyboardNavigator.ts:137](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L137)

Resolved i18n strings for the live-region announcements. Defaults to English.

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:78](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L78)

Element the keydown listener is attached to. Bubble-phase, so it sees
keystrokes from every descendant of the table root.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:87](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/KeyboardNavigator.ts#L87)

Reactive state for the grid.
