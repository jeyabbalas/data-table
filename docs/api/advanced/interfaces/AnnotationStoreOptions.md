[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStoreOptions

# Interface: AnnotationStoreOptions

Defined in: [annotations/AnnotationStore.ts:52](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/annotations/AnnotationStore.ts#L52)

Construction options for [AnnotationStore](../classes/AnnotationStore.md). All fields are optional;
the facade passes `tableName` as a reactive `Signal` so the store's
`toJSON` output tracks loader-assigned table renames.

## Properties

### idGenerator?

> `optional` **idGenerator?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:62](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/annotations/AnnotationStore.ts#L62)

Injected id generator (for deterministic tests).

#### Returns

`string`

***

### now?

> `optional` **now?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:64](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/annotations/AnnotationStore.ts#L64)

Injected ISO timestamp factory (for deterministic tests).

#### Returns

`string`

***

### tableName?

> `optional` **tableName?**: `string` \| `Signal`\<`string` \| `null`\> \| `null`

Defined in: [annotations/AnnotationStore.ts:60](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/annotations/AnnotationStore.ts#L60)

Table name the store's `toJSON()` output tags with. When a Signal is
passed (the facade passes `state.baseTableName`), the value is read at
`toJSON` time so it tracks loader-assigned names. A plain string or
`null` is captured once at construction. Omitted → `toJSON` omits the
field.
