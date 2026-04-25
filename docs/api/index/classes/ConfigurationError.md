[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ConfigurationError

# Class: ConfigurationError

Defined in: [core/errors.ts:248](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L248)

Invalid configuration / options / internal invariant violation.

## Example

```ts
try { table.setColorScheme('neon' as 'light'); }
catch (err) {
  if (err instanceof ConfigurationError && err.code === 'OPTIONS_INVALID') {
    // Programmer error — surface loudly in dev.
  }
}
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new ConfigurationError**(`message`, `options?`): `ConfigurationError`

Defined in: [core/errors.ts:249](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/errors.ts#L249)

#### Parameters

##### message

`string`

##### options?

[`DataTableErrorOptions`](../interfaces/DataTableErrorOptions.md) = `{}`

#### Returns

`ConfigurationError`

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
