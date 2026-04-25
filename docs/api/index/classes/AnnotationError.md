[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationError

# Class: AnnotationError

Defined in: [core/errors.ts:214](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L214)

Annotation CRUD, JSON I/O, or session-restore error.

Codes: `ANNOTATION_DUPLICATE_ID`, `ANNOTATION_NOT_FOUND`,
`ANNOTATION_INVALID_SHAPE`, `ANNOTATION_VERSION_UNSUPPORTED`,
`ANNOTATION_SCOPE_IMMUTABLE`, `ANNOTATION_ROWID_IMMUTABLE`,
`ANNOTATION_COLUMN_IMMUTABLE`, default `ANNOTATION_FAILED`.

## Example

```ts
try { table.annotations.loadJSON(file); }
catch (err) {
  if (err instanceof AnnotationError && err.code === 'ANNOTATION_VERSION_UNSUPPORTED') {
    toast('Annotation file was produced by a newer version.');
  }
}
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new AnnotationError**(`message`, `options?`): `AnnotationError`

Defined in: [core/errors.ts:215](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L215)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`AnnotationError`

#### Overrides

[`DataTableError`](DataTableError.md).[`constructor`](DataTableError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: [core/errors.ts:49](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L49)

#### Inherited from

[`DataTableError`](DataTableError.md).[`code`](DataTableError.md#code)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L50)

#### Inherited from

[`DataTableError`](DataTableError.md).[`details`](DataTableError.md#details)

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

#### Inherited from

[`DataTableError`](DataTableError.md).[`toJSON`](DataTableError.md#tojson)
