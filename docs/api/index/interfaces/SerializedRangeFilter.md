[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedRangeFilter

# Interface: SerializedRangeFilter

Defined in: [persistence/types.ts:36](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L36)

JSON-safe form of [RangeFilter](RangeFilter.md): any `Date` operand becomes a [DateWrapper](DateWrapper.md).

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:38](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L38)

***

### max

> **max**: `string` \| `number` \| [`DateWrapper`](DateWrapper.md)

Defined in: [persistence/types.ts:40](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L40)

***

### maxInclusive?

> `optional` **maxInclusive?**: `boolean`

Defined in: [persistence/types.ts:41](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L41)

***

### min

> **min**: `string` \| `number` \| [`DateWrapper`](DateWrapper.md)

Defined in: [persistence/types.ts:39](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L39)

***

### minExclusive?

> `optional` **minExclusive?**: `boolean`

Defined in: [persistence/types.ts:42](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L42)

***

### type

> **type**: `"range"`

Defined in: [persistence/types.ts:37](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L37)

***

### valueType?

> `optional` **valueType?**: `"time"` \| `"interval"`

Defined in: [persistence/types.ts:47](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L47)

As [RangeFilter.valueType](RangeFilter.md#valuetype): `'interval'` bounds are INTERVAL
literals, and `'time'` compares the column's time of day.
