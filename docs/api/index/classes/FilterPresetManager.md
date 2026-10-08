[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / FilterPresetManager

# Class: FilterPresetManager

Defined in: [filters/FilterPresets.ts:74](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L74)

In-memory store for named filter presets with JSON import / export. Pass
one to [createDataTable](../functions/createDataTable.md) via `presets: { manager }` to share preset
state across multiple tables on a page.

## Constructors

### Constructor

> **new FilterPresetManager**(): `FilterPresetManager`

Defined in: [filters/FilterPresets.ts:77](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L77)

#### Returns

`FilterPresetManager`

## Properties

### presets

> `readonly` **presets**: `Signal`\<[`FilterPreset`](../interfaces/FilterPreset.md)[]\>

Defined in: [filters/FilterPresets.ts:75](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L75)

## Methods

### delete()

> **delete**(`id`): `void`

Defined in: [filters/FilterPresets.ts:139](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L139)

Delete a preset by id.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### exportToJSON()

> **exportToJSON**(): `string`

Defined in: [filters/FilterPresets.ts:187](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L187)

Export all presets as a JSON string.

#### Returns

`string`

***

### getPresets()

> **getPresets**(): [`FilterPreset`](../interfaces/FilterPreset.md)[]

Defined in: [filters/FilterPresets.ts:349](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L349)

Get all presets (convenience for non-reactive access).

#### Returns

[`FilterPreset`](../interfaces/FilterPreset.md)[]

***

### importFromJSON()

> **importFromJSON**(`json`): `object`

Defined in: [filters/FilterPresets.ts:199](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L199)

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

Defined in: [filters/FilterPresets.ts:128](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L128)

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

Defined in: [filters/FilterPresets.ts:342](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L342)

Replace all presets (used for session restore).

#### Parameters

##### presets

[`FilterPreset`](../interfaces/FilterPreset.md)[]

#### Returns

`void`

***

### rename()

> **rename**(`id`, `newName`): `void`

Defined in: [filters/FilterPresets.ts:151](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L151)

Rename a preset.

Throws `ConfigurationError({ code: 'PRESET_DUPLICATE_NAME' })` when
`newName` collides with another preset's name. Renaming a preset to its
own current name is a no-op. Empty / whitespace-only `newName` is also a
no-op.

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

Defined in: [filters/FilterPresets.ts:89](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L89)

Save current filters as a named preset.

Names are unique within a manager. Calling `save` with a name that
already exists throws `ConfigurationError({ code: 'PRESET_DUPLICATE_NAME' })`
— call `update(id, …)` to overwrite an existing preset, or pick a
different name.

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

Defined in: [filters/FilterPresets.ts:174](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPresets.ts#L174)

Update a preset's filters with the current set.

#### Parameters

##### id

`string`

##### filters

[`Filter`](../type-aliases/Filter.md)[]

#### Returns

`void`
