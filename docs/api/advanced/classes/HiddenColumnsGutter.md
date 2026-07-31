[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HiddenColumnsGutter

# Class: HiddenColumnsGutter

Defined in: [table/HiddenColumnsGutter.ts:26](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/HiddenColumnsGutter.ts#L26)

HiddenColumnsGutter renders a horizontal bar of chips for hidden columns.
It auto-shows when columns are hidden and collapses when all are visible.

## Constructors

### Constructor

> **new HiddenColumnsGutter**(`state`, `actions`, `options?`): `HiddenColumnsGutter`

Defined in: [table/HiddenColumnsGutter.ts:35](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/HiddenColumnsGutter.ts#L35)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`HiddenColumnsGutterOptions`](../interfaces/HiddenColumnsGutterOptions.md) = `{}`

#### Returns

`HiddenColumnsGutter`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/HiddenColumnsGutter.ts:157](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/HiddenColumnsGutter.ts#L157)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/HiddenColumnsGutter.ts:150](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/HiddenColumnsGutter.ts#L150)

Get the gutter's DOM element

#### Returns

`HTMLElement`
