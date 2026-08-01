[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedRangeFilter

# Interface: SerializedRangeFilter

Defined in: [persistence/types.ts:31](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L31)

JSON-safe form of [RangeFilter](RangeFilter.md): any `Date` operand becomes a [DateWrapper](DateWrapper.md).

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:33](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L33)

***

### max

> **max**: `string` \| `number` \| [`DateWrapper`](DateWrapper.md)

Defined in: [persistence/types.ts:35](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L35)

***

### maxInclusive?

> `optional` **maxInclusive?**: `boolean`

Defined in: [persistence/types.ts:36](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L36)

***

### min

> **min**: `string` \| `number` \| [`DateWrapper`](DateWrapper.md)

Defined in: [persistence/types.ts:34](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L34)

***

### minExclusive?

> `optional` **minExclusive?**: `boolean`

Defined in: [persistence/types.ts:37](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L37)

***

### type

> **type**: `"range"`

Defined in: [persistence/types.ts:32](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L32)
