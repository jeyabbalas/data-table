[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnSchema

# Interface: ColumnSchema

Defined in: [core/types.ts:19](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L19)

## Properties

### expression?

> `optional` **expression?**: `string`

Defined in: [core/types.ts:25](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L25)

***

### isDerived?

> `optional` **isDerived?**: `boolean`

Defined in: [core/types.ts:24](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L24)

***

### name

> **name**: `string`

Defined in: [core/types.ts:20](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L20)

***

### nullable

> **nullable**: `boolean`

Defined in: [core/types.ts:22](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L22)

***

### originalType

> **originalType**: `string`

Defined in: [core/types.ts:23](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L23)

***

### system?

> `optional` **system?**: `boolean`

Defined in: [core/types.ts:33](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L33)

true for library-synthesized columns (e.g. `__rowid__`). System columns are
excluded from the default rendered grid and from default exports, but remain
first-class queryable columns in DuckDB and appear in the column chooser.
Note: this flag is re-applied by loaders on each load; it is not persisted
in the current session snapshot (schema is re-derived on restore).

***

### type

> **type**: [`DataType`](../type-aliases/DataType.md)

Defined in: [core/types.ts:21](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L21)
