[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedSetFilter

# Interface: SerializedSetFilter

Defined in: [persistence/types.ts:60](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L60)

JSON-safe form of [SetFilter](SetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:62](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L62)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:64](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L64)

***

### type

> **type**: `"set"`

Defined in: [persistence/types.ts:61](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L61)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:63](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L63)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:66](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L66)

As [SetFilter.valueType](SetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
