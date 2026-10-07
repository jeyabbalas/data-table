[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:103](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L103)

A vector column stored by pool reference instead of inline values.

`_poolRef` is a synthetic key (`vp_0`, `vp_1`, …) into the snapshot's
`vectorValuePool`. Multiple stack entries that refer to the same vector
column share the same key, so the values array is materialised exactly
once per snapshot.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:108](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L108)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:104](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L104)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:105](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L105)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:106](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/persistence/types.ts#L106)
