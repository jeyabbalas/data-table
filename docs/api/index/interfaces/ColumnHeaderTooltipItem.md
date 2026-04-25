[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipItem

# Interface: ColumnHeaderTooltipItem

Defined in: [core/types.ts:75](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L75)

A label/value entry inside a column-header tooltip.

- `value: string` renders inline next to the label ("Units: USD").
- `value: string[]` renders as a wrapping chip list — a natural fit for
  enum sets. Empty array drops the row.

## Properties

### label

> **label**: `string`

Defined in: [core/types.ts:76](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L76)

***

### value

> **value**: `string` \| `string`[]

Defined in: [core/types.ts:77](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/types.ts#L77)
