[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelField

# Class: FilterPanelField

Defined in: [filters/FilterPanelField.ts:30](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L30)

FilterPanelField renders filter controls for a single column.

## Constructors

### Constructor

> **new FilterPanelField**(`column`, `state`, `actions`, `options?`): `FilterPanelField`

Defined in: [filters/FilterPanelField.ts:45](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L45)

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

Defined in: [filters/FilterPanelField.ts:43](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L43)

## Methods

### applyFilter()

> **applyFilter**(): `void`

Defined in: [filters/FilterPanelField.ts:413](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L413)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [filters/FilterPanelField.ts:987](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L987)

Clear the filter: reset controls and remove from state.

#### Returns

`void`

***

### clearControls()

> **clearControls**(): `void`

Defined in: [filters/FilterPanelField.ts:942](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L942)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPanelField.ts:1019](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L1019)

Destroy and clean up

#### Returns

`void`

***

### getColumnName()

> **getColumnName**(): `string`

Defined in: [filters/FilterPanelField.ts:1005](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L1005)

Get the column name

#### Returns

`string`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanelField.ts:1012](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L1012)

Get the DOM element

#### Returns

`HTMLElement`

***

### highlight()

> **highlight**(): `void`

Defined in: [filters/FilterPanelField.ts:995](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L995)

Highlight this field (scroll into view + flash)

#### Returns

`void`

***

### syncFromState()

> **syncFromState**(): `void`

Defined in: [filters/FilterPanelField.ts:702](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanelField.ts#L702)

Sync control values from current filter state.
Called on construction and when filters change externally.

#### Returns

`void`
