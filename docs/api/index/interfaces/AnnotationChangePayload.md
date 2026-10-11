[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationChangePayload

# Interface: AnnotationChangePayload

Defined in: [annotations/types.ts:128](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L128)

Event payload emitted by `AnnotationStore.on('change', …)`.

Events fire synchronously, after the store has changed: a handler that
reads the store sees the new contents. `loadJSON(file, 'replace')` fires
two: `cleared` for what the store held (when it held anything), then
`added` for what the file holds (when it holds anything).

## Properties

### annotations?

> `optional` **annotations?**: [`Annotation`](../type-aliases/Annotation.md)[]

Defined in: [annotations/types.ts:143](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L143)

The affected annotations, parallel to `ids`: for `added` and
`updated` as they are now, for `removed` and `cleared` as they were.
Absent for `filterChanged`.

***

### ids

> **ids**: `string`[]

Defined in: [annotations/types.ts:137](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L137)

Ids of the affected annotations, in the order of `annotations`.

***

### kind

> **kind**: `"added"` \| `"removed"` \| `"updated"` \| `"cleared"` \| `"filterChanged"`

Defined in: [annotations/types.ts:135](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L135)

`'filterChanged'` is a visual-only signal — it fires when
`setSeverityFilter` actually toggled at least one flag. The store's
contents are unchanged and `ids` is empty. Persistence layers should
skip this kind; renderers should reapply.

***

### previous?

> `optional` **previous?**: [`Annotation`](../type-aliases/Annotation.md)[]

Defined in: [annotations/types.ts:148](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/types.ts#L148)

For `updated` only: each annotation as it was before the update,
parallel to `annotations`.
