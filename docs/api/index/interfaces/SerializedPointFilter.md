[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedPointFilter

# Interface: SerializedPointFilter

Defined in: [persistence/types.ts:43](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L43)

JSON-safe form of [PointFilter](PointFilter.md): any `Date` operand becomes a [DateWrapper](DateWrapper.md).

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:45](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L45)

***

### type

> **type**: `"point"`

Defined in: [persistence/types.ts:44](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L44)

***

### value

> **value**: `string` \| `number` \| `boolean` \| [`DateWrapper`](DateWrapper.md) \| `null`

Defined in: [persistence/types.ts:46](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L46)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:48](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L48)

As [PointFilter.valueType](PointFilter.md#valuetype): `'text'` compares the column's DuckDB text.
