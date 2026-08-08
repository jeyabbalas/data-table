[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanel

# Class: FilterPanel

Defined in: [filters/FilterPanel.ts:63](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L63)

Floating panel that hosts the type-aware filter editor for a single
column. Composed by the facade lazily (one instance per
[TableContainer](TableContainer.md)); reach for it directly only when assembling a
bespoke container shell that reuses the built-in filter UX.

## Constructors

### Constructor

> **new FilterPanel**(`state`, `actions`, `options?`): `FilterPanel`

Defined in: [filters/FilterPanel.ts:83](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L83)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`FilterPanelOptions`](../interfaces/FilterPanelOptions.md) = `{}`

#### Returns

`FilterPanel`

## Methods

### close()

> **close**(): `void`

Defined in: [filters/FilterPanel.ts:270](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L270)

Close the panel

Note: close() does NOT destroy currentField. This is intentional:
it preserves user input so re-opening the same column shows previous values.
The field is destroyed when switching columns (open with different column)
or when the panel itself is destroyed.

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPanel.ts:317](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L317)

Destroy and clean up

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [filters/FilterPanel.ts:310](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L310)

Get the currently focused column (if panel is open)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanel.ts:296](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L296)

Get the panel's DOM element

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPanel.ts:303](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L303)

Check if the panel is currently open

#### Returns

`boolean`

***

### open()

> **open**(`column`, `anchorElement`): `void`

Defined in: [filters/FilterPanel.ts:215](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L215)

Open the panel for the given column

#### Parameters

##### column

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`

***

### toggle()

> **toggle**(`column`, `anchorElement`): `void`

Defined in: [filters/FilterPanel.ts:204](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/filters/FilterPanel.ts#L204)

Toggle the panel open/closed for the given column

#### Parameters

##### column

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
