[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTableError

# Class: DataTableError

Defined in: [core/errors.ts:55](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/errors.ts#L55)

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

Defined in: [core/errors.ts:59](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/errors.ts#L59)

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

Defined in: [core/errors.ts:56](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/errors.ts#L56)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:57](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/errors.ts#L57)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:66](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/core/errors.ts#L66)

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
