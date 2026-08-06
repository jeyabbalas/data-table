[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / LoadJSONOptions

# Interface: LoadJSONOptions

Defined in: [annotations/AnnotationStore.ts:127](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L127)

Options bag for [AnnotationStore.loadJSON](../classes/AnnotationStore.md#loadjson).

## Properties

### mode?

> `optional` **mode?**: `"replace"` \| `"merge"`

Defined in: [annotations/AnnotationStore.ts:128](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L128)

***

### validateTableName?

> `optional` **validateTableName?**: `boolean`

Defined in: [annotations/AnnotationStore.ts:134](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/annotations/AnnotationStore.ts#L134)

When `true`, reject the load if `file.tableName` and the store's resolved
table name are both non-null and unequal. Throws
`ANNOTATION_TABLENAME_MISMATCH`. A warning is logged regardless.
