[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / isAnnotationIdShape

# Function: isAnnotationIdShape()

> **isAnnotationIdShape**(`s`): `s is string`

Defined in: [annotations/AnnotationId.ts:100](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/annotations/AnnotationId.ts#L100)

Cheap shape check — matches the `ann_` prefix + 26 Crockford chars output
of [generateAnnotationId](generateAnnotationId.md). Used for diagnostics; the store accepts
any non-empty string as an externally-supplied id.

## Parameters

### s

`unknown`

## Returns

`s is string`
