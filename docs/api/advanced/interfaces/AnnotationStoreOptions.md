[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStoreOptions

# Interface: AnnotationStoreOptions

Defined in: [annotations/AnnotationStore.ts:48](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L48)

Options for constructing an [AnnotationStore](../classes/AnnotationStore.md).

## Properties

### idGenerator?

> `optional` **idGenerator?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:58](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L58)

Injected id generator (for deterministic tests).

#### Returns

`string`

***

### now?

> `optional` **now?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:60](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L60)

Injected ISO timestamp factory (for deterministic tests).

#### Returns

`string`

***

### tableName?

> `optional` **tableName?**: `string` \| `Signal`\<`string` \| `null`\> \| `null`

Defined in: [annotations/AnnotationStore.ts:56](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/annotations/AnnotationStore.ts#L56)

Table name the store's `toJSON()` output tags with. When a Signal is
passed (the facade passes `state.baseTableName`), the value is read at
`toJSON` time so it tracks loader-assigned names. A plain string or
`null` is captured once at construction. Omitted → `toJSON` omits the
field.
