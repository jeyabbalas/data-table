[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / FilterPresetManager

# Class: FilterPresetManager

Defined in: [filters/FilterPresets.ts:76](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L76)

In-memory store for named filter presets with JSON import / export. Pass
one to [createDataTable](../functions/createDataTable.md) via `presets: { manager }` to share preset
state across multiple tables on a page.

## Constructors

### Constructor

> **new FilterPresetManager**(): `FilterPresetManager`

Defined in: [filters/FilterPresets.ts:79](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L79)

#### Returns

`FilterPresetManager`

## Properties

### presets

> `readonly` **presets**: `Signal`\<[`FilterPreset`](../interfaces/FilterPreset.md)[]\>

Defined in: [filters/FilterPresets.ts:77](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L77)

## Methods

### delete()

> **delete**(`id`): `void`

Defined in: [filters/FilterPresets.ts:141](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L141)

Delete a preset by id.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### exportToJSON()

> **exportToJSON**(): `string`

Defined in: [filters/FilterPresets.ts:189](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L189)

Export all presets as a JSON string.

#### Returns

`string`

***

### getPresets()

> **getPresets**(): [`FilterPreset`](../interfaces/FilterPreset.md)[]

Defined in: [filters/FilterPresets.ts:365](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L365)

Get all presets (convenience for non-reactive access).

#### Returns

[`FilterPreset`](../interfaces/FilterPreset.md)[]

***

### importFromJSON()

> **importFromJSON**(`json`): `object`

Defined in: [filters/FilterPresets.ts:201](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L201)

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

Defined in: [filters/FilterPresets.ts:130](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L130)

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

Defined in: [filters/FilterPresets.ts:358](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L358)

Replace all presets (used for session restore).

#### Parameters

##### presets

[`FilterPreset`](../interfaces/FilterPreset.md)[]

#### Returns

`void`

***

### rename()

> **rename**(`id`, `newName`): `void`

Defined in: [filters/FilterPresets.ts:153](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L153)

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

Defined in: [filters/FilterPresets.ts:91](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L91)

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

Defined in: [filters/FilterPresets.ts:176](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterPresets.ts#L176)

Update a preset's filters with the current set.

#### Parameters

##### id

`string`

##### filters

[`Filter`](../type-aliases/Filter.md)[]

#### Returns

`void`
