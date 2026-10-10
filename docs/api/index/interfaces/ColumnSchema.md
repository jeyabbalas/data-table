[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnSchema

# Interface: ColumnSchema

Defined in: [core/types.ts:39](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L39)

Column metadata exposed on `state.schema.get()` and threaded through every
subsystem (filter UI, derived columns, export, visualizations). One entry
per column in the active table; ordering matches the underlying DuckDB
`pragma_table_info` plus any synthetic columns the loaders inject (e.g.
`__rowid__`).

## Properties

### expression?

> `optional` **expression?**: `string`

Defined in: [core/types.ts:45](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L45)

***

### isDerived?

> `optional` **isDerived?**: `boolean`

Defined in: [core/types.ts:44](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L44)

***

### name

> **name**: `string`

Defined in: [core/types.ts:40](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L40)

***

### nullable

> **nullable**: `boolean`

Defined in: [core/types.ts:42](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L42)

***

### originalType

> **originalType**: `string`

Defined in: [core/types.ts:43](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L43)

***

### system?

> `optional` **system?**: `boolean`

Defined in: [core/types.ts:53](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L53)

true for library-synthesized columns (e.g. `__rowid__`). System columns are
excluded from the default rendered grid and from default exports, but remain
first-class queryable columns in DuckDB and appear in the column chooser.
Note: this flag is re-applied by loaders on each load; it is not persisted
in the current session snapshot (schema is re-derived on restore).

***

### type

> **type**: [`DataType`](../type-aliases/DataType.md)

Defined in: [core/types.ts:41](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/types.ts#L41)
