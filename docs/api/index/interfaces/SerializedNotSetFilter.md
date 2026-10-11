[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedNotSetFilter

# Interface: SerializedNotSetFilter

Defined in: [persistence/types.ts:70](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L70)

JSON-safe form of [NotSetFilter](NotSetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:72](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L72)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:74](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L74)

***

### type

> **type**: `"not-set"`

Defined in: [persistence/types.ts:71](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L71)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:73](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L73)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:76](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L76)

As [NotSetFilter.valueType](NotSetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
