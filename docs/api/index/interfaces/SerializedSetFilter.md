[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedSetFilter

# Interface: SerializedSetFilter

Defined in: [persistence/types.ts:52](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L52)

JSON-safe form of [SetFilter](SetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:54](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L54)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:56](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L56)

***

### type

> **type**: `"set"`

Defined in: [persistence/types.ts:53](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L53)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:55](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L55)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:58](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L58)

As [SetFilter.valueType](SetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
