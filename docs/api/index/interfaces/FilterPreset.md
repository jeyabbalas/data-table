[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / FilterPreset

# Interface: FilterPreset

Defined in: [filters/FilterPresetTypes.ts:18](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L18)

One named filter preset — a saved snapshot of `state.filters` plus optional
`state.sortColumns`. Stored by [FilterPresetManager](../classes/FilterPresetManager.md); round-trips
through `exportToJSON` / `importFromJSON` for handoff to downstream apps
(data-quality rule editors, dashboards).

## Properties

### createdAt

> **createdAt**: `number`

Defined in: [filters/FilterPresetTypes.ts:24](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L24)

***

### description?

> `optional` **description?**: `string`

Defined in: [filters/FilterPresetTypes.ts:21](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L21)

***

### filters

> **filters**: [`SerializedFilter`](../type-aliases/SerializedFilter.md)[]

Defined in: [filters/FilterPresetTypes.ts:22](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L22)

***

### id

> **id**: `string`

Defined in: [filters/FilterPresetTypes.ts:19](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L19)

***

### name

> **name**: `string`

Defined in: [filters/FilterPresetTypes.ts:20](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L20)

***

### sortColumns?

> `optional` **sortColumns?**: [`SortColumn`](SortColumn.md)[]

Defined in: [filters/FilterPresetTypes.ts:23](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L23)

***

### updatedAt

> **updatedAt**: `number`

Defined in: [filters/FilterPresetTypes.ts:25](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/filters/FilterPresetTypes.ts#L25)
