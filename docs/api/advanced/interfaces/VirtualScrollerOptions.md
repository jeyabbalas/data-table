[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VirtualScrollerOptions

# Interface: VirtualScrollerOptions

Defined in: [table/VirtualScroller.ts:14](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/VirtualScroller.ts#L14)

Options for configuring the VirtualScroller

## Properties

### bufferRows?

> `optional` **bufferRows?**: `number`

Defined in: [table/VirtualScroller.ts:18](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/VirtualScroller.ts#L18)

Number of buffer rows above/below viewport (default: 5)

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/VirtualScroller.ts:20](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/VirtualScroller.ts#L20)

CSS class prefix (default: 'dt')

***

### externalScrollContainer?

> `optional` **externalScrollContainer?**: `HTMLElement`

Defined in: [table/VirtualScroller.ts:27](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/VirtualScroller.ts#L27)

External scroll container to use for scroll events.
If provided, VirtualScroller won't create its own scroll container.
This enables unified scrolling where both horizontal and vertical
scrollbars appear on a single outer container.

***

### rowHeight

> **rowHeight**: `number`

Defined in: [table/VirtualScroller.ts:16](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/VirtualScroller.ts#L16)

Fixed height per row in pixels
