[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:109](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L109)

A vector column stored by pool reference instead of inline values.

`_poolRef` is a synthetic key (`vp_0`, `vp_1`, …) into the snapshot's
`vectorValuePool`. Multiple stack entries that refer to the same vector
column share the same key, so the values array is materialised exactly
once per snapshot.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:114](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L114)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:110](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L110)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:111](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L111)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:112](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/persistence/types.ts#L112)
