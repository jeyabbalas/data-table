[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnSchema

# Interface: ColumnSchema

Defined in: [core/types.ts:25](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L25)

Column metadata exposed on `state.schema.get()` and threaded through every
subsystem (filter UI, derived columns, export, visualizations). One entry
per column in the active table; ordering matches the underlying DuckDB
`pragma_table_info` plus any synthetic columns the loaders inject (e.g.
`__rowid__`).

## Properties

### expression?

> `optional` **expression?**: `string`

Defined in: [core/types.ts:31](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L31)

***

### isDerived?

> `optional` **isDerived?**: `boolean`

Defined in: [core/types.ts:30](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L30)

***

### name

> **name**: `string`

Defined in: [core/types.ts:26](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L26)

***

### nullable

> **nullable**: `boolean`

Defined in: [core/types.ts:28](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L28)

***

### originalType

> **originalType**: `string`

Defined in: [core/types.ts:29](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L29)

***

### system?

> `optional` **system?**: `boolean`

Defined in: [core/types.ts:39](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L39)

true for library-synthesized columns (e.g. `__rowid__`). System columns are
excluded from the default rendered grid and from default exports, but remain
first-class queryable columns in DuckDB and appear in the column chooser.
Note: this flag is re-applied by loaders on each load; it is not persisted
in the current session snapshot (schema is re-derived on restore).

***

### type

> **type**: [`DataType`](../type-aliases/DataType.md)

Defined in: [core/types.ts:27](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/types.ts#L27)
