[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / FilterPresetManager

# Class: FilterPresetManager

Defined in: [filters/FilterPresets.ts:49](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L49)

## Constructors

### Constructor

> **new FilterPresetManager**(): `FilterPresetManager`

Defined in: [filters/FilterPresets.ts:52](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L52)

#### Returns

`FilterPresetManager`

## Properties

### presets

> `readonly` **presets**: `Signal`\<[`FilterPreset`](../interfaces/FilterPreset.md)[]\>

Defined in: [filters/FilterPresets.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L50)

## Methods

### delete()

> **delete**(`id`): `void`

Defined in: [filters/FilterPresets.ts:102](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L102)

Delete a preset by id.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### exportToJSON()

> **exportToJSON**(): `string`

Defined in: [filters/FilterPresets.ts:136](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L136)

Export all presets as a JSON string.

#### Returns

`string`

***

### getPresets()

> **getPresets**(): [`FilterPreset`](../interfaces/FilterPreset.md)[]

Defined in: [filters/FilterPresets.ts:263](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L263)

Get all presets (convenience for non-reactive access).

#### Returns

[`FilterPreset`](../interfaces/FilterPreset.md)[]

***

### importFromJSON()

> **importFromJSON**(`json`): `object`

Defined in: [filters/FilterPresets.ts:148](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L148)

Import presets from a JSON string. Assigns new IDs to avoid collisions.
Returns the count of successfully imported presets and any validation errors.

#### Parameters

##### json

`string`

#### Returns

`object`

##### errors

> **errors**: `string`[]

##### imported

> **imported**: `number`

***

### load()

> **load**(`id`, `actions`): `void`

Defined in: [filters/FilterPresets.ts:91](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L91)

Load a preset by id: clears existing filters and applies the preset's
filters (and optionally sort state) in a single undo step.

#### Parameters

##### id

`string`

##### actions

[`StateActions`](../../advanced/classes/StateActions.md)

#### Returns

`void`

***

### loadPresets()

> **loadPresets**(`presets`): `void`

Defined in: [filters/FilterPresets.ts:256](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L256)

Replace all presets (used for session restore).

#### Parameters

##### presets

[`FilterPreset`](../interfaces/FilterPreset.md)[]

#### Returns

`void`

***

### rename()

> **rename**(`id`, `newName`): `void`

Defined in: [filters/FilterPresets.ts:109](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L109)

Rename a preset.

#### Parameters

##### id

`string`

##### newName

`string`

#### Returns

`void`

***

### save()

> **save**(`name`, `filters`, `sortColumns?`, `description?`): [`FilterPreset`](../interfaces/FilterPreset.md)

Defined in: [filters/FilterPresets.ts:59](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L59)

Save current filters as a named preset.

#### Parameters

##### name

`string`

##### filters

[`Filter`](../type-aliases/Filter.md)[]

##### sortColumns?

[`SortColumn`](../interfaces/SortColumn.md)[]

##### description?

`string`

#### Returns

[`FilterPreset`](../interfaces/FilterPreset.md)

***

### update()

> **update**(`id`, `filters`): `void`

Defined in: [filters/FilterPresets.ts:123](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterPresets.ts#L123)

Update a preset's filters with the current set.

#### Parameters

##### id

`string`

##### filters

[`Filter`](../type-aliases/Filter.md)[]

#### Returns

`void`
