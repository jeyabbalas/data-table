[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:100](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/persistence/types.ts#L100)

A vector column stored by pool reference instead of inline values.

`_poolRef` is a synthetic key (`vp_0`, `vp_1`, …) into the snapshot's
`vectorValuePool`. Multiple stack entries that refer to the same vector
column share the same key, so the values array is materialised exactly
once per snapshot.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:105](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/persistence/types.ts#L105)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:101](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/persistence/types.ts#L101)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:102](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/persistence/types.ts#L102)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:103](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/persistence/types.ts#L103)
