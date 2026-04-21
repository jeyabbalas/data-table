[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / PooledVectorColumnRef

# Interface: PooledVectorColumnRef

Defined in: [persistence/types.ts:70](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L70)

A vector column stored by pool reference instead of inline values.

## Properties

### \_poolRef

> **\_poolRef**: `string`

Defined in: [persistence/types.ts:75](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L75)

Key into SessionSnapshot.vectorValuePool

***

### kind

> **kind**: `"vector"`

Defined in: [persistence/types.ts:71](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L71)

***

### name

> **name**: `string`

Defined in: [persistence/types.ts:72](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L72)

***

### vectorType

> **vectorType**: [`VectorDataType`](../../index/type-aliases/VectorDataType.md)

Defined in: [persistence/types.ts:73](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/persistence/types.ts#L73)
