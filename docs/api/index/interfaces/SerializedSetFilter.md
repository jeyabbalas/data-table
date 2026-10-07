[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedSetFilter

# Interface: SerializedSetFilter

Defined in: [persistence/types.ts:55](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L55)

JSON-safe form of [SetFilter](SetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:57](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L57)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:59](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L59)

***

### type

> **type**: `"set"`

Defined in: [persistence/types.ts:56](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L56)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:58](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L58)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:61](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/persistence/types.ts#L61)

As [SetFilter.valueType](SetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
