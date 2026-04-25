[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedDerivedColumnDef

# Type Alias: SerializedDerivedColumnDef

> **SerializedDerivedColumnDef** = `ExpressionColumnDef` \| `VectorColumnDef` \| [`PooledVectorColumnRef`](../interfaces/PooledVectorColumnRef.md)

Defined in: [persistence/types.ts:90](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L90)

Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
Pool references replace inline values to deduplicate vector data across
undo/redo stack entries.
