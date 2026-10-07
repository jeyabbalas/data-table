[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelField

# Class: FilterPanelField

Defined in: [filters/FilterPanelField.ts:32](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L32)

FilterPanelField renders filter controls for a single column.

## Constructors

### Constructor

> **new FilterPanelField**(`column`, `state`, `actions`, `options?`): `FilterPanelField`

Defined in: [filters/FilterPanelField.ts:47](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L47)

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

Defined in: [filters/FilterPanelField.ts:45](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L45)

## Methods

### applyFilter()

> **applyFilter**(): `void`

Defined in: [filters/FilterPanelField.ts:418](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L418)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [filters/FilterPanelField.ts:1048](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L1048)

Clear the filter: reset controls and remove from state.

#### Returns

`void`

***

### clearControls()

> **clearControls**(): `void`

Defined in: [filters/FilterPanelField.ts:995](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L995)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPanelField.ts:1080](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L1080)

Destroy and clean up

#### Returns

`void`

***

### getColumnName()

> **getColumnName**(): `string`

Defined in: [filters/FilterPanelField.ts:1066](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L1066)

Get the column name

#### Returns

`string`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPanelField.ts:1073](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L1073)

Get the DOM element

#### Returns

`HTMLElement`

***

### highlight()

> **highlight**(): `void`

Defined in: [filters/FilterPanelField.ts:1056](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L1056)

Highlight this field (scroll into view + flash)

#### Returns

`void`

***

### syncFromState()

> **syncFromState**(): `void`

Defined in: [filters/FilterPanelField.ts:748](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPanelField.ts#L748)

Sync control values from current filter state.
Called on construction and when filters change externally.

#### Returns

`void`
