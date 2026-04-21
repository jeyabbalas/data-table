[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HiddenColumnsGutter

# Class: HiddenColumnsGutter

Defined in: [table/HiddenColumnsGutter.ts:26](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/HiddenColumnsGutter.ts#L26)

HiddenColumnsGutter renders a horizontal bar of chips for hidden columns.
It auto-shows when columns are hidden and collapses when all are visible.

## Constructors

### Constructor

> **new HiddenColumnsGutter**(`state`, `actions`, `options?`): `HiddenColumnsGutter`

Defined in: [table/HiddenColumnsGutter.ts:35](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/HiddenColumnsGutter.ts#L35)

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

Defined in: [table/HiddenColumnsGutter.ts:161](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/HiddenColumnsGutter.ts#L161)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/HiddenColumnsGutter.ts:154](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/HiddenColumnsGutter.ts#L154)

Get the gutter's DOM element

#### Returns

`HTMLElement`
