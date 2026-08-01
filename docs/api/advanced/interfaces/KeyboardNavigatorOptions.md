[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigatorOptions

# Interface: KeyboardNavigatorOptions

Defined in: [table/KeyboardNavigator.ts:71](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L71)

Construction options for [KeyboardNavigator](../classes/KeyboardNavigator.md).

## Properties

### actions

> **actions**: [`StateActions`](../classes/StateActions.md)

Defined in: [table/KeyboardNavigator.ts:87](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L87)

State mutation surface.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/KeyboardNavigator.ts:103](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L103)

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

Defined in: [table/KeyboardNavigator.ts:83](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L83)

Body horizontal-scroll container (for horizontal cell scroll).

***

### getBridge?

> `optional` **getBridge?**: () => [`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

Defined in: [table/KeyboardNavigator.ts:97](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L97)

Optional bridge for clipboard copy; when absent, Ctrl+C is a no-op.

#### Returns

[`WorkerBridge`](../../index/classes/WorkerBridge.md) \| `undefined`

***

### getColumnHeaders?

> `optional` **getColumnHeaders?**: () => [`ColumnHeader`](../classes/ColumnHeader.md)[]

Defined in: [table/KeyboardNavigator.ts:95](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L95)

Late-bound accessor for the live ColumnHeader instances — `render()`
destroys and rebuilds them, so they cannot be captured at construction.
Without it, header-row navigation and F2 controls mode are inert.

#### Returns

[`ColumnHeader`](../classes/ColumnHeader.md)[]

***

### getTableBody

> **getTableBody**: () => [`TableBody`](../classes/TableBody.md) \| `null`

Defined in: [table/KeyboardNavigator.ts:89](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L89)

Late-bound accessor for the TableBody (may be recreated on data loads).

#### Returns

[`TableBody`](../classes/TableBody.md) \| `null`

***

### gridElement?

> `optional` **gridElement?**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:81](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L81)

The `role="grid"` element that owns focus. Escape from controls mode
returns focus here. Defaults to `rootElement` when omitted.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/KeyboardNavigator.ts:105](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L105)

Resolved i18n strings for the live-region announcements. Defaults to English.

***

### rootElement

> **rootElement**: `HTMLElement`

Defined in: [table/KeyboardNavigator.ts:76](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L76)

Element the keydown listener is attached to. Bubble-phase, so it sees
keystrokes from every descendant of the table root.

***

### state

> **state**: [`TableState`](TableState.md)

Defined in: [table/KeyboardNavigator.ts:85](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/KeyboardNavigator.ts#L85)

Reactive state for the grid.
