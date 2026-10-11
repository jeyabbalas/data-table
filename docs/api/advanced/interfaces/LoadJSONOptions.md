[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadJSONOptions

# Interface: LoadJSONOptions

Defined in: [annotations/AnnotationStore.ts:123](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L123)

Options bag for [AnnotationStore.loadJSON](../classes/AnnotationStore.md#loadjson).

## Properties

### mode?

> `optional` **mode?**: `"replace"` \| `"merge"`

Defined in: [annotations/AnnotationStore.ts:124](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L124)

***

### validateTableName?

> `optional` **validateTableName?**: `boolean`

Defined in: [annotations/AnnotationStore.ts:130](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/annotations/AnnotationStore.ts#L130)

When `true`, reject the load if `file.tableName` and the store's resolved
table name are both non-null and unequal. Throws
`ANNOTATION_TABLENAME_MISMATCH`. A warning is logged regardless.
