[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadDataOptions

# Interface: LoadDataOptions

Defined in: [core/Actions.ts:68](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/Actions.ts#L68)

Options for loading data

## Extends

- `DataLoaderOptions`

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [core/Actions.ts:74](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/Actions.ts#L74)

If provided, restores saved annotations after loading

***

### format?

> `optional` **format?**: [`DataFormat`](../../index/type-aliases/DataFormat.md)

Defined in: [data/DataLoader.ts:26](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/data/DataLoader.ts#L26)

#### Inherited from

`DataLoaderOptions.format`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [core/Actions.ts:72](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/Actions.ts#L72)

If provided, restores saved filter presets after loading

***

### sessionStore?

> `optional` **sessionStore?**: [`SessionStore`](../../index/classes/SessionStore.md)

Defined in: [core/Actions.ts:70](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/Actions.ts#L70)

If provided, restores saved session state after loading

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/DataLoader.ts:25](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/data/DataLoader.ts#L25)

#### Inherited from

`DataLoaderOptions.tableName`
