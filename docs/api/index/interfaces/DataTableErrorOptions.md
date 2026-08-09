[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTableErrorOptions

# Interface: DataTableErrorOptions

Defined in: [core/errors.ts:37](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/errors.ts#L37)

Constructor options for [DataTableError](../classes/DataTableError.md) and its subclasses. All
fields are optional; `code` defaults to `'UNKNOWN'` (subclasses pass a
type-specific default), `cause` chains via the standard `Error.cause`
mechanism, and `details` is a free-form structured payload that consumers
read off `err.details` after narrowing on `err.code`.

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: [core/errors.ts:39](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/errors.ts#L39)

***

### code?

> `optional` **code?**: `string`

Defined in: [core/errors.ts:38](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/errors.ts#L38)

***

### details?

> `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:40](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/core/errors.ts#L40)
