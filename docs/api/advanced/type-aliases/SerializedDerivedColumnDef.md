[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedDerivedColumnDef

# Type Alias: SerializedDerivedColumnDef

> **SerializedDerivedColumnDef** = [`ExpressionColumnDef`](../../index/interfaces/ExpressionColumnDef.md) \| [`VectorColumnDef`](../../index/interfaces/VectorColumnDef.md) \| [`PooledVectorColumnRef`](../interfaces/PooledVectorColumnRef.md)

Defined in: [persistence/types.ts:134](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/persistence/types.ts#L134)

Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
Pool references replace inline values to deduplicate vector data across
undo/redo stack entries.
