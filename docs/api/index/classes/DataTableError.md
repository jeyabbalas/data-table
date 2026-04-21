[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTableError

# Class: DataTableError

Defined in: [core/errors.ts:47](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/errors.ts#L47)

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
- [`ExportError`](ExportError.md)
- [`ConfigurationError`](ConfigurationError.md)
- [`DestroyedError`](DestroyedError.md)

## Constructors

### Constructor

> **new DataTableError**(`message`, `options?`): `DataTableError`

Defined in: [core/errors.ts:51](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/errors.ts#L51)

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

Defined in: [core/errors.ts:48](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/errors.ts#L48)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:49](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/errors.ts#L49)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:58](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/errors.ts#L58)

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
