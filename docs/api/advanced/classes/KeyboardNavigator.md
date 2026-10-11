[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigator

# Class: KeyboardNavigator

Defined in: [table/KeyboardNavigator.ts:174](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/KeyboardNavigator.ts#L174)

WCAG-oriented keyboard navigation controller for the table grid: arrow
keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
(header) or select (body), F2 to reach the per-column buttons (header) or
open the value inspector (a nested or JSON body cell), Shift+F2 to resize
and reorder the column, F8 / Shift+F8 (or Alt+↓ / Alt+↑) to go to the next
or previous annotation, and Ctrl/Cmd+C to copy the selection.
Composed by [TableContainer](TableContainer.md); reach for it directly only when
assembling a custom container shell.

## Constructors

### Constructor

> **new KeyboardNavigator**(`opts`): `KeyboardNavigator`

Defined in: [table/KeyboardNavigator.ts:208](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/KeyboardNavigator.ts#L208)

#### Parameters

##### opts

[`KeyboardNavigatorOptions`](../interfaces/KeyboardNavigatorOptions.md)

#### Returns

`KeyboardNavigator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/KeyboardNavigator.ts:246](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/KeyboardNavigator.ts#L246)

#### Returns

`void`
