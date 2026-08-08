[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / NewAnnotation

# Type Alias: NewAnnotation

> **NewAnnotation** = `Omit`\<[`RowAnnotation`](../interfaces/RowAnnotation.md), `"id"`\> & `object` \| `Omit`\<[`ColumnAnnotation`](../interfaces/ColumnAnnotation.md), `"id"`\> & `object` \| `Omit`\<[`CellAnnotation`](../interfaces/CellAnnotation.md), `"id"`\> & `object`

Defined in: [annotations/types.ts:97](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/annotations/types.ts#L97)

Input shape accepted by `AnnotationStore.add` / `addMany`: any of the three
concrete variants with `id` optional (the store generates one when absent).
