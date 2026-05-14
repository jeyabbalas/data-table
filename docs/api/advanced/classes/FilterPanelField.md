[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelField

# Class: FilterPanelField

Defined in: [filters/FilterPanelField.ts:30](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L30)

FilterPanelField renders filter controls for a single column.

## Constructors

### Constructor

> **new FilterPanelField**(`column`, `state`, `actions`, `options?`): `FilterPanelField`

Defined in: [filters/FilterPanelField.ts:45](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L45)

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

Defined in: [filters/FilterPanelField.ts:43](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L43)

## Methods

### applyFilter()

> **applyFilter**(): `void`

Defined in: [filters/FilterPanelField.ts:415](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L415)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [filters/FilterPanelField.ts:1021](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L1021)

Clear the filter: reset controls and remove from state.

#### Returns

`void`

***

### clearControls()

> **clearControls**(): `void`

Defined in: [filters/FilterPanelField.ts:968](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L968)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPanelField.ts:1053](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L1053)

Destroy and clean up

#### Returns

`void`

***

### getColumnName()

> **getColumnName**(): `string`

Defined in: [filters/FilterPanelField.ts:1039](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L1039)

Get the column name

#### Returns

`string`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanelField.ts:1046](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L1046)

Get the DOM element

#### Returns

`HTMLElement`

***

### highlight()

> **highlight**(): `void`

Defined in: [filters/FilterPanelField.ts:1029](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L1029)

Highlight this field (scroll into view + flash)

#### Returns

`void`

***

### syncFromState()

> **syncFromState**(): `void`

Defined in: [filters/FilterPanelField.ts:721](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/filters/FilterPanelField.ts#L721)

Sync control values from current filter state.
Called on construction and when filters change externally.

#### Returns

`void`
