[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelField

# Class: FilterPanelField

Defined in: [filters/FilterPanelField.ts:31](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L31)

FilterPanelField renders filter controls for a single column.

## Constructors

### Constructor

> **new FilterPanelField**(`column`, `state`, `actions`, `options?`): `FilterPanelField`

Defined in: [filters/FilterPanelField.ts:46](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L46)

#### Parameters

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`FilterPanelFieldOptions`](../interfaces/FilterPanelFieldOptions.md) = `{}`

#### Returns

`FilterPanelField`

## Properties

### isSelfUpdate

> **isSelfUpdate**: `boolean` = `false`

Defined in: [filters/FilterPanelField.ts:44](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L44)

## Methods

### applyFilter()

> **applyFilter**(): `void`

Defined in: [filters/FilterPanelField.ts:417](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L417)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [filters/FilterPanelField.ts:1034](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L1034)

Clear the filter: reset controls and remove from state.

#### Returns

`void`

***

### clearControls()

> **clearControls**(): `void`

Defined in: [filters/FilterPanelField.ts:981](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L981)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPanelField.ts:1066](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L1066)

Destroy and clean up

#### Returns

`void`

***

### getColumnName()

> **getColumnName**(): `string`

Defined in: [filters/FilterPanelField.ts:1052](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L1052)

Get the column name

#### Returns

`string`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanelField.ts:1059](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L1059)

Get the DOM element

#### Returns

`HTMLElement`

***

### highlight()

> **highlight**(): `void`

Defined in: [filters/FilterPanelField.ts:1042](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L1042)

Highlight this field (scroll into view + flash)

#### Returns

`void`

***

### syncFromState()

> **syncFromState**(): `void`

Defined in: [filters/FilterPanelField.ts:734](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/filters/FilterPanelField.ts#L734)

Sync control values from current filter state.
Called on construction and when filters change externally.

#### Returns

`void`
