[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DerivedColumnError

# Class: DerivedColumnError

Defined in: [core/errors.ts:186](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/errors.ts#L186)

Derived-column expression / vector / lifecycle error.

The derived-column actions resolve with their failures rather than throw:
`replaceDerivedColumn` with this error, `addDerivedColumn` and
`updateDerivedColumn` with its message. A derived column a restored
session, an undo or a redo cannot bring back is reported with it in a
`console.warn`, coded `DUPLICATE_NAME` for a name another column has.

## Example

```ts
const result = await table.actions.replaceDerivedColumn('tip_pct', def);
if (!result.success && result.error.code === 'DEPENDENTS_INCOMPATIBLE') {
  console.warn('It would break:', result.error.details?.dependentsAffected);
}
```

## Extends

- [`DataTableError`](DataTableError.md)

## Constructors

### Constructor

> **new DerivedColumnError**(`message`, `options?`): `DerivedColumnError`

Defined in: [core/errors.ts:187](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/errors.ts#L187)

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

Defined in: [core/errors.ts:56](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/errors.ts#L56)

#### Inherited from

[`DataTableError`](DataTableError.md).[`code`](DataTableError.md#code)

***

### details?

> `readonly` `optional` **details?**: `Record`\<`string`, `unknown`\>

Defined in: [core/errors.ts:57](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/errors.ts#L57)

#### Inherited from

[`DataTableError`](DataTableError.md).[`details`](DataTableError.md#details)

## Methods

### toJSON()

> **toJSON**(): `object`

Defined in: [core/errors.ts:66](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/errors.ts#L66)

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
