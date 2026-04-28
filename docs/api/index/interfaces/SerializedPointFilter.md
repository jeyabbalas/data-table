[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedPointFilter

# Interface: SerializedPointFilter

Defined in: [persistence/types.ts:41](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/persistence/types.ts#L41)

JSON-safe form of [PointFilter](PointFilter.md): any `Date` operand becomes a [DateWrapper](DateWrapper.md).

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:43](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/persistence/types.ts#L43)

***

### type

> **type**: `"point"`

Defined in: [persistence/types.ts:42](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/persistence/types.ts#L42)

***

### value

> **value**: `string` \| `number` \| `boolean` \| [`DateWrapper`](DateWrapper.md) \| `null`

Defined in: [persistence/types.ts:44](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/persistence/types.ts#L44)
