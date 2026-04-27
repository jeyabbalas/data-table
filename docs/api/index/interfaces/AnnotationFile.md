[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationFile

# Interface: AnnotationFile

Defined in: [annotations/types.ts:110](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L110)

JSON file shape emitted by `AnnotationStore.toJSON` and consumed by
`loadJSON`. Unknown top-level keys survive round-trip (the index signature
captures them at the type level; the store preserves them at runtime).

## Indexable

> \[`unknown`: `string`\]: `unknown`

Unknown top-level fields are preserved verbatim across round-trips.

## Properties

### annotations

> **annotations**: [`Annotation`](../type-aliases/Annotation.md)[]

Defined in: [annotations/types.ts:115](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L115)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [annotations/types.ts:113](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L113)

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [annotations/types.ts:112](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L112)

***

### updatedAt?

> `optional` **updatedAt?**: `string`

Defined in: [annotations/types.ts:114](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L114)

***

### version

> **version**: `number`

Defined in: [annotations/types.ts:111](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/types.ts#L111)
