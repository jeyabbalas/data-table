[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipItem

# Interface: ColumnHeaderTooltipItem

Defined in: [core/types.ts:84](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/types.ts#L84)

A label/value entry inside a column-header tooltip.

- `value: string` renders inline next to the label ("Units: USD").
- `value: string[]` renders as a wrapping chip list — a natural fit for
  enum sets. Empty array drops the row.

## Properties

### label

> **label**: `string`

Defined in: [core/types.ts:85](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/types.ts#L85)

***

### value

> **value**: `string` \| `string`[]

Defined in: [core/types.ts:86](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/core/types.ts#L86)
