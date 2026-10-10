[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / HiddenColumnsGutter

# Class: HiddenColumnsGutter

Defined in: [table/HiddenColumnsGutter.ts:40](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/HiddenColumnsGutter.ts#L40)

HiddenColumnsGutter renders a horizontal bar of chips for hidden columns.
It auto-shows when columns are hidden and collapses when all are visible.

The chips sit in one row, in the table's column order, which scrolls
sideways once it is wider than the table, with "Show all" pinned at its end.
A chip that hiding a column adds is scrolled into view, smoothly; hiding
several at once scrolls to the right-most of them.

The gutter is a `role="toolbar"` with the APG roving-tabindex treatment, so
it is a single tab stop no matter how many columns are hidden — hiding 250
of a 266-column table used to put 251 tab stops in front of the rest of the
page. `←` / `→` move the stop, `Home` / `End` jump to the ends, and the
movement wraps. Restoring a column with its chip's own button leaves the
stop, and focus, on the chip next to it.

## Constructors

### Constructor

> **new HiddenColumnsGutter**(`state`, `actions`, `options?`): `HiddenColumnsGutter`

Defined in: [table/HiddenColumnsGutter.ts:54](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/HiddenColumnsGutter.ts#L54)

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

Defined in: [table/HiddenColumnsGutter.ts:258](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/HiddenColumnsGutter.ts#L258)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/HiddenColumnsGutter.ts:251](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/HiddenColumnsGutter.ts#L251)

Get the gutter's DOM element

#### Returns

`HTMLElement`
