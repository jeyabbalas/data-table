[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipContent

# Interface: ColumnHeaderTooltipContent

Defined in: [core/types.ts:113](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/types.ts#L113)

Structured content for a column-header tooltip popover.

Every field is optional. An object with all fields empty (or missing)
normalizes to `null` (i.e. clears the tooltip).

The library renders all string fields via `.textContent` — HTML strings
are NOT supported and not interpreted. This eliminates the XSS surface
by construction.

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [core/types.ts:117](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/types.ts#L117)

Optional free-text body. Whitespace preserved (`white-space: pre-wrap`).

***

### items?

> `optional` **items?**: [`ColumnHeaderTooltipItem`](ColumnHeaderTooltipItem.md)[]

Defined in: [core/types.ts:119](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/types.ts#L119)

Optional ordered list of label/value items.

***

### title?

> `optional` **title?**: `string`

Defined in: [core/types.ts:115](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/types.ts#L115)

Optional bold heading.
