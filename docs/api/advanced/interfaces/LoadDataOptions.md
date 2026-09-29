[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadDataOptions

# Interface: LoadDataOptions

Defined in: [core/Actions.ts:68](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/core/Actions.ts#L68)

Options for loading data

## Extends

- `DataLoaderOptions`

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [core/Actions.ts:74](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/core/Actions.ts#L74)

If provided, restores saved annotations after loading

***

### format?

> `optional` **format?**: [`DataFormat`](../../index/type-aliases/DataFormat.md)

Defined in: [data/DataLoader.ts:26](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/DataLoader.ts#L26)

#### Inherited from

`DataLoaderOptions.format`

***

### onProgress?

> `optional` **onProgress?**: [`ProgressCallback`](../../index/type-aliases/ProgressCallback.md)

Defined in: [data/DataLoader.ts:35](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/DataLoader.ts#L35)

Called with each progress message the worker sends as the load runs.
The table emits them as `loadProgress`.

#### Inherited from

`DataLoaderOptions.onProgress`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [core/Actions.ts:72](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/core/Actions.ts#L72)

If provided, restores saved filter presets after loading

***

### sessionStore?

> `optional` **sessionStore?**: [`SessionStore`](../../index/classes/SessionStore.md)

Defined in: [core/Actions.ts:70](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/core/Actions.ts#L70)

If provided, restores saved session state after loading

***

### sourceOptions?

> `optional` **sourceOptions?**: [`SourceOptions`](../../index/interfaces/SourceOptions.md)

Defined in: [data/DataLoader.ts:30](https://github.com/jeyabbalas/data-table/blob/84bc22716ae6fbd54ed52c48655671e063bd7ac4/src/data/DataLoader.ts#L30)

How the source is read, per format; see [SourceOptions](../../index/interfaces/SourceOptions.md).

#### Inherited from

`DataLoaderOptions.sourceOptions`

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/DataLoader.ts:25](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/data/DataLoader.ts#L25)

#### Inherited from

`DataLoaderOptions.tableName`
