[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / isAnnotationIdShape

# Function: isAnnotationIdShape()

> **isAnnotationIdShape**(`s`): `s is string`

Defined in: [annotations/AnnotationId.ts:100](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/annotations/AnnotationId.ts#L100)

Cheap shape check — matches the `ann_` prefix + 26 Crockford chars output
of [generateAnnotationId](generateAnnotationId.md). Used for diagnostics; the store accepts
any non-empty string as an externally-supplied id.

## Parameters

### s

`unknown`

## Returns

`s is string`
