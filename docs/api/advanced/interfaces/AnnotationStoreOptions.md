[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationStoreOptions

# Interface: AnnotationStoreOptions

Defined in: [annotations/AnnotationStore.ts:58](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L58)

Construction options for [AnnotationStore](../classes/AnnotationStore.md). All fields are optional;
the facade passes `tableName` as a reactive `Signal` so the store's
`toJSON` output tracks loader-assigned table renames.

## Properties

### idGenerator?

> `optional` **idGenerator?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:68](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L68)

Injected id generator (for deterministic tests).

#### Returns

`string`

***

### now?

> `optional` **now?**: () => `string`

Defined in: [annotations/AnnotationStore.ts:70](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L70)

Injected ISO timestamp factory (for deterministic tests).

#### Returns

`string`

***

### tableName?

> `optional` **tableName?**: `string` \| `Signal`\<`string` \| `null`\> \| `null`

Defined in: [annotations/AnnotationStore.ts:66](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L66)

Table name the store's `toJSON()` output tags with. When a Signal is
passed (the facade passes `state.baseTableName`), the value is read at
`toJSON` time so it tracks loader-assigned names. A plain string or
`null` is captured once at construction. Omitted → `toJSON` omits the
field.
