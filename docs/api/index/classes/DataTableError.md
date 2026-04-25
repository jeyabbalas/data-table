[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTableError

# Class: DataTableError

Defined in: [core/errors.ts:48](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L48)

Base class for every error thrown by the library.

## Example

```ts
import { DataTableError } from '@jeyabbalas/data-table';

table.on('error', ({ error, source }) => {
  if (error instanceof DataTableError) {
    log({ name: error.name, code: error.code, source, details: error.details });
  }
});
```

## Extends

- `Error`

## Extended by

- [`WorkerInitError`](WorkerInitError.md)
- [`WorkerTerminatedError`](WorkerTerminatedError.md)
- [`QueryError`](QueryError.md)
- [`LoadError`](LoadError.md)
- [`SQLValidationError`](SQLValidationError.md)
- [`DerivedColumnError`](DerivedColumnError.md)
- [`PersistenceError`](PersistenceError.md)
- [`AnnotationError`](AnnotationError.md)
- [`ExportError`](ExportError.md)
- [`ConfigurationError`](ConfigurationError.md)
- [`DestroyedError`](DestroyedError.md)

## Constructors

### Constructor

> **new DataTableError**(`message`, `options?`): `DataTableError`

Defined in: [core/errors.ts:52](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L52)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`DataTableError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `string`

Defined in: [core/errors.ts:49](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L49)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L50)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:59](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L59)

#### Returns

`object`

##### cause?

> `optional` **cause?**: `unknown`

##### code

> **code**: `string`

##### details?

> `optional` **details?**: `Record`\<`string`, `unknown`\>

##### message

> **message**: `string`

##### name

> **name**: `string`
