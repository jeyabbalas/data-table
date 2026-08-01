[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColumnHeaderTooltipContent

# Interface: ColumnHeaderTooltipContent

Defined in: [core/types.ts:99](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/core/types.ts#L99)

Structured content for a column-header tooltip popover.

Every field is optional. An object with all fields empty (or missing)
normalizes to `null` (i.e. clears the tooltip).

The library renders all string fields via `.textContent` — HTML strings
are NOT supported and not interpreted. This eliminates the XSS surface
by construction.

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [core/types.ts:103](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/core/types.ts#L103)

Optional free-text body. Whitespace preserved (`white-space: pre-wrap`).

***

### items?

> `optional` **items?**: [`ColumnHeaderTooltipItem`](ColumnHeaderTooltipItem.md)[]

Defined in: [core/types.ts:105](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/core/types.ts#L105)

Optional ordered list of label/value items.

***

### title?

> `optional` **title?**: `string`

Defined in: [core/types.ts:101](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/core/types.ts#L101)

Optional bold heading.
