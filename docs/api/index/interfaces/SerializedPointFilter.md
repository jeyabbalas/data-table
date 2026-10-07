[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedPointFilter

# Interface: SerializedPointFilter

Defined in: [persistence/types.ts:46](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L46)

JSON-safe form of [PointFilter](PointFilter.md): any `Date` operand becomes a [DateWrapper](DateWrapper.md).

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:48](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L48)

***

### type

> **type**: `"point"`

Defined in: [persistence/types.ts:47](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L47)

***

### value

> **value**: `string` \| `number` \| `boolean` \| [`DateWrapper`](DateWrapper.md) \| `null`

Defined in: [persistence/types.ts:49](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L49)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:51](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L51)

As [PointFilter.valueType](PointFilter.md#valuetype): `'text'` compares the column's DuckDB text.
