[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SerializedNotSetFilter

# Interface: SerializedNotSetFilter

Defined in: [persistence/types.ts:62](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L62)

JSON-safe form of [NotSetFilter](NotSetFilter.md); values pass through `serializeValue`.

## Properties

### column

> **column**: `string`

Defined in: [persistence/types.ts:64](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L64)

***

### includeNull?

> `optional` **includeNull?**: `boolean`

Defined in: [persistence/types.ts:66](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L66)

***

### type

> **type**: `"not-set"`

Defined in: [persistence/types.ts:63](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L63)

***

### values

> **values**: `unknown`[]

Defined in: [persistence/types.ts:65](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L65)

***

### valueType?

> `optional` **valueType?**: `"text"`

Defined in: [persistence/types.ts:68](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/persistence/types.ts#L68)

As [NotSetFilter.valueType](NotSetFilter.md#valuetype): `'text'` compares the column's DuckDB text.
