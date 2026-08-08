[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigator

# Class: KeyboardNavigator

Defined in: [table/KeyboardNavigator.ts:116](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/KeyboardNavigator.ts#L116)

WCAG-oriented keyboard navigation controller for the table grid: arrow
keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
(header) or select (body), F2 to reach the per-column buttons, Shift+F2 to
resize and reorder the column, and Ctrl/Cmd+C to copy the selection.
Composed by [TableContainer](TableContainer.md); reach for it directly only when
assembling a custom container shell.

## Constructors

### Constructor

> **new KeyboardNavigator**(`opts`): `KeyboardNavigator`

Defined in: [table/KeyboardNavigator.ts:145](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/KeyboardNavigator.ts#L145)

#### Parameters

##### opts

[`KeyboardNavigatorOptions`](../interfaces/KeyboardNavigatorOptions.md)

#### Returns

`KeyboardNavigator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/KeyboardNavigator.ts:178](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/KeyboardNavigator.ts#L178)

#### Returns

`void`
