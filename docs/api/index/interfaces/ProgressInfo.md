[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ProgressInfo

# Interface: ProgressInfo

Defined in: [core/Progress.ts:13](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L13)

Progress information for long-running operations

## Properties

### cancelable

> **cancelable**: `boolean`

Defined in: [core/Progress.ts:25](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L25)

Whether the operation can be cancelled

***

### estimatedRemaining?

> `optional` **estimatedRemaining?**: `number`

Defined in: [core/Progress.ts:23](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L23)

Estimated time remaining in milliseconds

***

### loaded?

> `optional` **loaded?**: `number`

Defined in: [core/Progress.ts:19](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L19)

Bytes or rows loaded so far

***

### percent

> **percent**: `number`

Defined in: [core/Progress.ts:17](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L17)

Completion percentage (0-100)

***

### stage

> **stage**: [`ProgressStage`](../type-aliases/ProgressStage.md)

Defined in: [core/Progress.ts:15](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L15)

Current processing stage

***

### total?

> `optional` **total?**: `number`

Defined in: [core/Progress.ts:21](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/Progress.ts#L21)

Total bytes or rows expected
