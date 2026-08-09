[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HiddenColumnsGutter

# Class: HiddenColumnsGutter

Defined in: [table/HiddenColumnsGutter.ts:34](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/HiddenColumnsGutter.ts#L34)

HiddenColumnsGutter renders a horizontal bar of chips for hidden columns.
It auto-shows when columns are hidden and collapses when all are visible.

The gutter is a `role="toolbar"` with the APG roving-tabindex treatment, so
it is a single tab stop no matter how many columns are hidden — hiding 250
of a 266-column table used to put 251 tab stops in front of the rest of the
page, most of them clipped out of sight by the gutter's `max-height`. All
four arrow keys move the stop (the chips wrap onto several rows), `Home` /
`End` jump to the ends, and the movement wraps.

## Constructors

### Constructor

> **new HiddenColumnsGutter**(`state`, `actions`, `options?`): `HiddenColumnsGutter`

Defined in: [table/HiddenColumnsGutter.ts:44](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/HiddenColumnsGutter.ts#L44)

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

Defined in: [table/HiddenColumnsGutter.ts:187](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/HiddenColumnsGutter.ts#L187)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/HiddenColumnsGutter.ts:180](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/HiddenColumnsGutter.ts#L180)

Get the gutter's DOM element

#### Returns

`HTMLElement`
