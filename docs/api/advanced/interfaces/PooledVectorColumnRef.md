[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:92](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/persistence/types.ts#L92)

A vector column stored by pool reference instead of inline values.

`_poolRef` is a synthetic key (`vp_0`, `vp_1`, …) into the snapshot's
`vectorValuePool`. Multiple stack entries that refer to the same vector
column share the same key, so the values array is materialised exactly
once per snapshot.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:97](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/persistence/types.ts#L97)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:93](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/persistence/types.ts#L93)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:94](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/persistence/types.ts#L94)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:95](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/persistence/types.ts#L95)
