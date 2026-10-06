[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipContent

# Interface: ColumnHeaderTooltipContent

Defined in: [core/types.ts:108](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L108)

Structured content for a column-header tooltip popover.

Every field is optional. An object with all fields empty (or missing)
normalizes to `null` (i.e. clears the tooltip).

The library renders all string fields via `.textContent` — HTML strings
are NOT supported and not interpreted. This eliminates the XSS surface
by construction.

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [core/types.ts:112](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L112)

Optional free-text body. Whitespace preserved (`white-space: pre-wrap`).

***

### items?

> `optional` **items?**: [`ColumnHeaderTooltipItem`](ColumnHeaderTooltipItem.md)[]

Defined in: [core/types.ts:114](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L114)

Optional ordered list of label/value items.

***

### title?

> `optional` **title?**: `string`

Defined in: [core/types.ts:110](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/types.ts#L110)

Optional bold heading.
