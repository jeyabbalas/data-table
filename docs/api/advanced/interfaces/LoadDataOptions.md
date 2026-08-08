[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadDataOptions

# Interface: LoadDataOptions

Defined in: [core/Actions.ts:69](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/core/Actions.ts#L69)

Options for loading data

## Extends

- `DataLoaderOptions`

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [core/Actions.ts:75](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/core/Actions.ts#L75)

If provided, restores saved annotations after loading

***

### format?

> `optional` **format?**: [`DataFormat`](../../index/type-aliases/DataFormat.md)

Defined in: [data/DataLoader.ts:27](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L27)

#### Inherited from

`DataLoaderOptions.format`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [core/Actions.ts:73](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/core/Actions.ts#L73)

If provided, restores saved filter presets after loading

***

### sessionStore?

> `optional` **sessionStore?**: [`SessionStore`](../../index/classes/SessionStore.md)

Defined in: [core/Actions.ts:71](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/core/Actions.ts#L71)

If provided, restores saved session state after loading

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/DataLoader.ts:26](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/data/DataLoader.ts#L26)

#### Inherited from

`DataLoaderOptions.tableName`
