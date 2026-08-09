[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NewAnnotation

# Type Alias: NewAnnotation

> **NewAnnotation** = `Omit`\<[`RowAnnotation`](../interfaces/RowAnnotation.md), `"id"`\> & `object` \| `Omit`\<[`ColumnAnnotation`](../interfaces/ColumnAnnotation.md), `"id"`\> & `object` \| `Omit`\<[`CellAnnotation`](../interfaces/CellAnnotation.md), `"id"`\> & `object`

Defined in: [annotations/types.ts:97](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/annotations/types.ts#L97)

Input shape accepted by `AnnotationStore.add` / `addMany`: any of the three
concrete variants with `id` optional (the store generates one when absent).
