[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DerivedColumnError

# Class: DerivedColumnError

Defined in: [core/errors.ts:182](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/errors.ts#L182)

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

Defined in: [core/errors.ts:183](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/errors.ts#L183)

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

Defined in: [core/errors.ts:56](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/errors.ts#L56)

#### Inherited from

[`DataTableError`](DataTableError.md).[`code`](DataTableError.md#code)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:57](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/errors.ts#L57)

#### Inherited from

[`DataTableError`](DataTableError.md).[`details`](DataTableError.md#details)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:66](https://github.com/jeyabbalas/data-table/blob/545d3dece9300b5f4a8e75f6e7f930aac0e500d6/src/core/errors.ts#L66)

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
