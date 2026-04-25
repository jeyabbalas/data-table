[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationChangePayload

# Interface: AnnotationChangePayload

Defined in: [annotations/types.ts:117](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L117)

Event payload emitted by `AnnotationStore.on('change', …)`.

## Properties

### ids

> **ids**: `string`[]

Defined in: [annotations/types.ts:125](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L125)

***

### kind

> **kind**: `"added"` \| `"removed"` \| `"updated"` \| `"cleared"` \| `"filterChanged"`

Defined in: [annotations/types.ts:124](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L124)

`'filterChanged'` is a visual-only signal — it fires when
`setSeverityFilter` actually toggled at least one flag. The store's
contents are unchanged and `ids` is empty. Persistence layers should
skip this kind; renderers should reapply.
