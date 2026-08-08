[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SerializedDerivedColumnDef

# Type Alias: SerializedDerivedColumnDef

> **SerializedDerivedColumnDef** = [`ExpressionColumnDef`](../../index/interfaces/ExpressionColumnDef.md) \| [`VectorColumnDef`](../../index/interfaces/VectorColumnDef.md) \| [`PooledVectorColumnRef`](../interfaces/PooledVectorColumnRef.md)

Defined in: [persistence/types.ts:126](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/persistence/types.ts#L126)

Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
Pool references replace inline values to deduplicate vector data across
undo/redo stack entries.
