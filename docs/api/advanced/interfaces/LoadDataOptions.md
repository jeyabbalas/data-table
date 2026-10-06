[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadDataOptions

# Interface: LoadDataOptions

Defined in: [core/Actions.ts:187](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L187)

Options for loading data

## Extends

- `DataLoaderOptions`

## Properties

### annotationStore?

> `optional` **annotationStore?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [core/Actions.ts:193](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L193)

If provided, restores saved annotations after loading

***

### format?

> `optional` **format?**: [`DataFormat`](../../index/type-aliases/DataFormat.md)

Defined in: [data/DataLoader.ts:28](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/DataLoader.ts#L28)

#### Inherited from

`DataLoaderOptions.format`

***

### onProgress?

> `optional` **onProgress?**: [`ProgressCallback`](../../index/type-aliases/ProgressCallback.md)

Defined in: [data/DataLoader.ts:35](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/DataLoader.ts#L35)

Called with each progress message the worker sends as the load runs.
The table emits them as `loadProgress`.

#### Inherited from

`DataLoaderOptions.onProgress`

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [core/Actions.ts:191](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L191)

If provided, restores saved filter presets after loading

***

### sessionStore?

> `optional` **sessionStore?**: [`SessionStore`](../../index/classes/SessionStore.md)

Defined in: [core/Actions.ts:189](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L189)

If provided, restores saved session state after loading

***

### sourceOptions?

> `optional` **sourceOptions?**: [`SourceOptions`](../../index/interfaces/SourceOptions.md)

Defined in: [data/DataLoader.ts:30](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/DataLoader.ts#L30)

How the source is read, per format; see [SourceOptions](../../index/interfaces/SourceOptions.md).

#### Inherited from

`DataLoaderOptions.sourceOptions`

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [data/DataLoader.ts:27](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/data/DataLoader.ts#L27)

#### Inherited from

`DataLoaderOptions.tableName`
