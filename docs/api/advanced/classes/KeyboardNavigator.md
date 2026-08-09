[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / KeyboardNavigator

# Class: KeyboardNavigator

Defined in: [table/KeyboardNavigator.ts:128](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/KeyboardNavigator.ts#L128)

WCAG-oriented keyboard navigation controller for the table grid: arrow
keys, Home / End, Ctrl+Home / End, PageUp / PageDown, Enter to sort
(header) or select (body), F2 to reach the per-column buttons, Shift+F2 to
resize and reorder the column, and Ctrl/Cmd+C to copy the selection.
Composed by [TableContainer](TableContainer.md); reach for it directly only when
assembling a custom container shell.

## Constructors

### Constructor

> **new KeyboardNavigator**(`opts`): `KeyboardNavigator`

Defined in: [table/KeyboardNavigator.ts:158](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/KeyboardNavigator.ts#L158)

#### Parameters

##### opts

[`KeyboardNavigatorOptions`](../interfaces/KeyboardNavigatorOptions.md)

#### Returns

`KeyboardNavigator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/KeyboardNavigator.ts:192](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/KeyboardNavigator.ts#L192)

#### Returns

`void`

***

### getLayoutColumn()

> **getLayoutColumn**(): `string` \| `null`

Defined in: [table/KeyboardNavigator.ts:851](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/KeyboardNavigator.ts#L851)

The column an open Shift+F2 layout gesture is operating on, or `null`.

Read by `TableContainer` to anchor that column in the header window: the
gesture is a state machine here rather than DOM focus, so nothing else
would stop a scroll from unmounting the very header the arrow keys are
resizing — and `syncLayoutAffordance` would then paint the outline on
nothing.

#### Returns

`string` \| `null`

#### Example

```typescript
const anchored = navigator.getLayoutColumn(); // 'price' while Shift+F2 is open
```
