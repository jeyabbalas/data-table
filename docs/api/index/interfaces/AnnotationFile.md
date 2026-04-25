[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationFile

# Interface: AnnotationFile

Defined in: [annotations/types.ts:106](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L106)

JSON file shape emitted by `AnnotationStore.toJSON` and consumed by
`loadJSON`. Unknown top-level keys survive round-trip (the index signature
captures them at the type level; the store preserves them at runtime).

## Indexable

> \[`unknown`: `string`\]: `unknown`

Unknown top-level fields are preserved verbatim across round-trips.

## Properties

### annotations

> **annotations**: [`Annotation`](../type-aliases/Annotation.md)[]

Defined in: [annotations/types.ts:111](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L111)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [annotations/types.ts:109](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L109)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [annotations/types.ts:108](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L108)

***

### updatedAt?

> `optional` **updatedAt?**: `string`

Defined in: [annotations/types.ts:110](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L110)

***

### version

> **version**: `number`

Defined in: [annotations/types.ts:107](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/types.ts#L107)
