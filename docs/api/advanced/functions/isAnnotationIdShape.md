[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / isAnnotationIdShape

# Function: isAnnotationIdShape()

> **isAnnotationIdShape**(`s`): `s is string`

Defined in: [annotations/AnnotationId.ts:100](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/annotations/AnnotationId.ts#L100)

Cheap shape check — matches the `ann_` prefix + 26 Crockford chars output
of [generateAnnotationId](generateAnnotationId.md). Used for diagnostics; the store accepts
any non-empty string as an externally-supplied id.

## Parameters

### s

`unknown`

## Returns

`s is string`
