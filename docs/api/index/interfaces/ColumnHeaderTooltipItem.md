[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipItem

# Interface: ColumnHeaderTooltipItem

Defined in: [core/types.ts:98](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/types.ts#L98)

A label/value entry inside a column-header tooltip.

- `value: string` renders inline next to the label ("Units: USD").
- `value: string[]` renders as a wrapping chip list — a natural fit for
  enum sets. Empty array drops the row.

## Properties

### label

> **label**: `string`

Defined in: [core/types.ts:99](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/types.ts#L99)

***

### value

> **value**: `string` \| `string`[]

Defined in: [core/types.ts:100](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/core/types.ts#L100)
