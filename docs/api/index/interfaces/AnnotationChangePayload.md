[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationChangePayload

# Interface: AnnotationChangePayload

Defined in: [annotations/types.ts:121](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/annotations/types.ts#L121)

Event payload emitted by `AnnotationStore.on('change', …)`.

## Properties

### ids

> **ids**: `string`[]

Defined in: [annotations/types.ts:129](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/annotations/types.ts#L129)

***

### kind

> **kind**: `"added"` \| `"removed"` \| `"updated"` \| `"cleared"` \| `"filterChanged"`

Defined in: [annotations/types.ts:128](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/annotations/types.ts#L128)

`'filterChanged'` is a visual-only signal — it fires when
`setSeverityFilter` actually toggled at least one flag. The store's
contents are unchanged and `ids` is empty. Persistence layers should
skip this kind; renderers should reapply.
