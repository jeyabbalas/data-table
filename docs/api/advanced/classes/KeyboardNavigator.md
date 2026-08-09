[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigator

# Class: KeyboardNavigator

Defined in: [table/KeyboardNavigator.ts:116](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/KeyboardNavigator.ts#L116)

WCAG-oriented keyboard navigation controller for the table grid: arrow
keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
(header) or select (body), F2 to reach the per-column buttons, Shift+F2 to
resize and reorder the column, and Ctrl/Cmd+C to copy the selection.
Composed by [TableContainer](TableContainer.md); reach for it directly only when
assembling a custom container shell.

## Constructors

### Constructor

> **new KeyboardNavigator**(`opts`): `KeyboardNavigator`

Defined in: [table/KeyboardNavigator.ts:145](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/KeyboardNavigator.ts#L145)

#### Parameters

##### opts

[`KeyboardNavigatorOptions`](../interfaces/KeyboardNavigatorOptions.md)

#### Returns

`KeyboardNavigator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/KeyboardNavigator.ts:178](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/KeyboardNavigator.ts#L178)

#### Returns

`void`
