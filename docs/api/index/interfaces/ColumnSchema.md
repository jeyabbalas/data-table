[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnSchema

# Interface: ColumnSchema

Defined in: [core/types.ts:34](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L34)

Column metadata exposed on `state.schema.get()` and threaded through every
subsystem (filter UI, derived columns, export, visualizations). One entry
per column in the active table; ordering matches the underlying DuckDB
`pragma_table_info` plus any synthetic columns the loaders inject (e.g.
`__rowid__`).

## Properties

### expression?

> `optional` **expression?**: `string`

Defined in: [core/types.ts:40](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L40)

***

### isDerived?

> `optional` **isDerived?**: `boolean`

Defined in: [core/types.ts:39](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L39)

***

### name

> **name**: `string`

Defined in: [core/types.ts:35](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L35)

***

### nullable

> **nullable**: `boolean`

Defined in: [core/types.ts:37](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L37)

***

### originalType

> **originalType**: `string`

Defined in: [core/types.ts:38](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L38)

***

### system?

> `optional` **system?**: `boolean`

Defined in: [core/types.ts:48](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L48)

true for library-synthesized columns (e.g. `__rowid__`). System columns are
excluded from the default rendered grid and from default exports, but remain
first-class queryable columns in DuckDB and appear in the column chooser.
Note: this flag is re-applied by loaders on each load; it is not persisted
in the current session snapshot (schema is re-derived on restore).

***

### type

> **type**: [`DataType`](../type-aliases/DataType.md)

Defined in: [core/types.ts:36](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L36)
