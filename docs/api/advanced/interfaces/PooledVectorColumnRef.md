[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:71](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L71)

A vector column stored by pool reference instead of inline values.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:76](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L76)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:72](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L72)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:73](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L73)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:74](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/persistence/types.ts#L74)
