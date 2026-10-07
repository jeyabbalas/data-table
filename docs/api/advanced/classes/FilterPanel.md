[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanel

# Class: FilterPanel

Defined in: [filters/FilterPanel.ts:73](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L73)

Floating panel that hosts the type-aware filter editor for a single
column. Composed by the facade lazily (one instance per
[TableContainer](TableContainer.md)); reach for it directly only when assembling a
bespoke container shell that reuses the built-in filter UX.

## Constructors

### Constructor

> **new FilterPanel**(`state`, `actions`, `options?`): `FilterPanel`

Defined in: [filters/FilterPanel.ts:94](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L94)

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

Defined in: [filters/FilterPanel.ts:291](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L291)

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

Defined in: [filters/FilterPanel.ts:345](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L345)

Destroy and clean up

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [filters/FilterPanel.ts:338](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L338)

Get the currently focused column (if panel is open)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanel.ts:324](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L324)

Get the panel's DOM element

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPanel.ts:331](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L331)

Check if the panel is currently open

#### Returns

`boolean`

***

### open()

> **open**(`column`, `anchorElement`): `void`

Defined in: [filters/FilterPanel.ts:227](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L227)

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

Defined in: [filters/FilterPanel.ts:216](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/filters/FilterPanel.ts#L216)

Toggle the panel open/closed for the given column

#### Parameters

##### column

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
