[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanel

# Class: FilterPanel

Defined in: [filters/FilterPanel.ts:56](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L56)

## Constructors

### Constructor

> **new FilterPanel**(`state`, `actions`, `options?`): `FilterPanel`

Defined in: [filters/FilterPanel.ts:76](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L76)

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

Defined in: [filters/FilterPanel.ts:263](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L263)

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

Defined in: [filters/FilterPanel.ts:313](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L313)

Destroy and clean up

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [filters/FilterPanel.ts:306](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L306)

Get the currently focused column (if panel is open)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanel.ts:292](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L292)

Get the panel's DOM element

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPanel.ts:299](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L299)

Check if the panel is currently open

#### Returns

`boolean`

***

### open()

> **open**(`column`, `anchorElement`): `void`

Defined in: [filters/FilterPanel.ts:208](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L208)

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

Defined in: [filters/FilterPanel.ts:197](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L197)

Toggle the panel open/closed for the given column

#### Parameters

##### column

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
