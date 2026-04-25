[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / SQLValidationError

# Class: SQLValidationError

Defined in: [core/errors.ts:158](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L158)

SQL expression failed user-facing validation (raw-SQL filter modal etc.).

## Example

```ts
table.on('error', ({ error, source }) => {
  if (source === 'sql-validation' && error instanceof SQLValidationError) {
    showInlineErrorInEditor(error.message);
  }
});
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new SQLValidationError**(`message`, `options?`): `SQLValidationError`

Defined in: [core/errors.ts:159](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L159)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`SQLValidationError`

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
