[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedDerivedColumnDef

# Type Alias: SerializedDerivedColumnDef

> **SerializedDerivedColumnDef** = [`ExpressionColumnDef`](../../index/interfaces/ExpressionColumnDef.md) \| [`VectorColumnDef`](../../index/interfaces/VectorColumnDef.md) \| [`PooledVectorColumnRef`](../interfaces/PooledVectorColumnRef.md)

Defined in: [persistence/types.ts:126](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/persistence/types.ts#L126)

Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
Pool references replace inline values to deduplicate vector data across
undo/redo stack entries.
