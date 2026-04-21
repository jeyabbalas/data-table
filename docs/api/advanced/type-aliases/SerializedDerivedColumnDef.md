[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedDerivedColumnDef

# Type Alias: SerializedDerivedColumnDef

> **SerializedDerivedColumnDef** = `ExpressionColumnDef` \| `VectorColumnDef` \| [`PooledVectorColumnRef`](../interfaces/PooledVectorColumnRef.md)

Defined in: [persistence/types.ts:89](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L89)

Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
Pool references replace inline values to deduplicate vector data across
undo/redo stack entries.
