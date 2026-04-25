[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DerivedColumnError

# Class: DerivedColumnError

Defined in: [core/errors.ts:175](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L175)

Derived-column expression / vector / lifecycle error.

## Example

```ts
try { await table.actions.addDerivedColumn(def); }
catch (err) {
  if (err instanceof DerivedColumnError && err.code === 'DUPLICATE_NAME') {
    toast('A column with that name already exists.');
  }
}
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new DerivedColumnError**(`message`, `options?`): `DerivedColumnError`

Defined in: [core/errors.ts:176](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L176)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`DerivedColumnError`

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
