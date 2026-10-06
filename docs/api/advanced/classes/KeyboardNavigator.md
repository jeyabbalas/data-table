[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigator

# Class: KeyboardNavigator

Defined in: [table/KeyboardNavigator.ts:148](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/KeyboardNavigator.ts#L148)

WCAG-oriented keyboard navigation controller for the table grid: arrow
keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
(header) or select (body), F2 to reach the per-column buttons (header) or
open the value inspector (a nested or JSON body cell), Shift+F2 to resize
and reorder the column, and Ctrl/Cmd+C to copy the selection.
Composed by [TableContainer](TableContainer.md); reach for it directly only when
assembling a custom container shell.

## Constructors

### Constructor

> **new KeyboardNavigator**(`opts`): `KeyboardNavigator`

Defined in: [table/KeyboardNavigator.ts:181](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/KeyboardNavigator.ts#L181)

#### Parameters

##### opts

[`KeyboardNavigatorOptions`](../interfaces/KeyboardNavigatorOptions.md)

#### Returns

`KeyboardNavigator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/KeyboardNavigator.ts:218](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/KeyboardNavigator.ts#L218)

#### Returns

`void`
