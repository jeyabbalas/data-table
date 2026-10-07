[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanel

# Class: FilterPanel

Defined in: [filters/FilterPanel.ts:81](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L81)

Floating panel that hosts the type-aware filter editor for a single
column. Composed by the facade lazily (one instance per
[TableContainer](TableContainer.md)); reach for it directly only when assembling a
bespoke container shell that reuses the built-in filter UX.

## Constructors

### Constructor

> **new FilterPanel**(`state`, `actions`, `options?`): `FilterPanel`

Defined in: [filters/FilterPanel.ts:103](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L103)

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

Defined in: [filters/FilterPanel.ts:304](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L304)

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

Defined in: [filters/FilterPanel.ts:358](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L358)

Destroy and clean up

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [filters/FilterPanel.ts:351](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L351)

Get the currently focused column (if panel is open)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanel.ts:337](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L337)

Get the panel's DOM element

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPanel.ts:344](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L344)

Check if the panel is currently open

#### Returns

`boolean`

***

### open()

> **open**(`column`, `anchorElement`): `void`

Defined in: [filters/FilterPanel.ts:239](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L239)

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

Defined in: [filters/FilterPanel.ts:228](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanel.ts#L228)

Toggle the panel open/closed for the given column

#### Parameters

##### column

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
