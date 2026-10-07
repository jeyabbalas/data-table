[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipContent

# Interface: ColumnHeaderTooltipContent

Defined in: [core/types.ts:113](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/types.ts#L113)

Structured content for a column-header tooltip popover.

Every field is optional. An object with all fields empty (or missing)
normalizes to `null` (i.e. clears the tooltip).

The library renders all string fields via `.textContent` — HTML strings
are NOT supported and not interpreted. This eliminates the XSS surface
by construction.

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [core/types.ts:117](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/types.ts#L117)

Optional free-text body. Whitespace preserved (`white-space: pre-wrap`).

***

### items?

> `optional` **items?**: [`ColumnHeaderTooltipItem`](ColumnHeaderTooltipItem.md)[]

Defined in: [core/types.ts:119](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/types.ts#L119)

Optional ordered list of label/value items.

***

### title?

> `optional` **title?**: `string`

Defined in: [core/types.ts:115](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/core/types.ts#L115)

Optional bold heading.
