[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadDataOptions

# Interface: LoadDataOptions

Defined in: [core/Actions.ts:70](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L70)

Options for loading data

## Extends

- `DataLoaderOptions`

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [core/Actions.ts:76](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L76)

If provided, restores saved annotations after loading

***

### format?

> `optional` **format?**: [`DataFormat`](../../index/type-aliases/DataFormat.md)

Defined in: [data/DataLoader.ts:20](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/DataLoader.ts#L20)

#### Inherited from

`DataLoaderOptions.format`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [core/Actions.ts:74](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L74)

If provided, restores saved filter presets after loading

***

### sessionStore?

> `optional` **sessionStore?**: [`SessionStore`](../../index/classes/SessionStore.md)

Defined in: [core/Actions.ts:72](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L72)

If provided, restores saved session state after loading

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/DataLoader.ts:19](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/data/DataLoader.ts#L19)

#### Inherited from

`DataLoaderOptions.tableName`
