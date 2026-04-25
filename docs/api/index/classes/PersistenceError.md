[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / PersistenceError

# Class: PersistenceError

Defined in: [core/errors.ts:192](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L192)

Session persistence (IndexedDB) error.

## Example

```ts
table.on('error', ({ error, source }) => {
  if (source === 'persistence' && error instanceof PersistenceError) {
    // IDB writes are best-effort; degrade gracefully.
    console.warn('Session save failed:', error.code);
  }
});
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new PersistenceError**(`message`, `options?`): `PersistenceError`

Defined in: [core/errors.ts:193](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L193)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`PersistenceError`

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
