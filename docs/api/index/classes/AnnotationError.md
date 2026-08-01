[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotationError

# Class: AnnotationError

Defined in: [core/errors.ts:222](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/errors.ts#L222)

Annotation CRUD, JSON I/O, or session-restore error.

Codes: `ANNOTATION_DUPLICATE_ID`, `ANNOTATION_NOT_FOUND`,
`ANNOTATION_INVALID_SHAPE`, `ANNOTATION_VERSION_UNSUPPORTED`,
`ANNOTATION_ID_IMMUTABLE`, `ANNOTATION_SCOPE_IMMUTABLE`,
`ANNOTATION_ROWID_IMMUTABLE`, `ANNOTATION_COLUMN_IMMUTABLE`,
`ANNOTATION_TABLENAME_MISMATCH`, default `ANNOTATION_FAILED`.

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

Defined in: [core/errors.ts:223](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/errors.ts#L223)

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

Defined in: [core/errors.ts:56](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/errors.ts#L56)

#### Inherited from

[`DataTableError`](DataTableError.md).[`code`](DataTableError.md#code)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:57](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/errors.ts#L57)

#### Inherited from

[`DataTableError`](DataTableError.md).[`details`](DataTableError.md#details)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:66](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/core/errors.ts#L66)

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
