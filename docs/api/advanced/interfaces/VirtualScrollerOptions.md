[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VirtualScrollerOptions

# Interface: VirtualScrollerOptions

Defined in: [table/VirtualScroller.ts:14](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L14)

Options for configuring the VirtualScroller

## Properties

### bufferRows?

> `optional` **bufferRows?**: `number`

Defined in: [table/VirtualScroller.ts:18](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L18)

Number of buffer rows above/below viewport (default: 5)

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/VirtualScroller.ts:20](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L20)

CSS class prefix (default: 'dt')

***

### externalScrollContainer?

> `optional` **externalScrollContainer?**: `HTMLElement`

Defined in: [table/VirtualScroller.ts:27](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L27)

External scroll container to use for scroll events.
If provided, VirtualScroller won't create its own scroll container.
This enables unified scrolling where both horizontal and vertical
scrollbars appear on a single outer container.

***

### maxVirtualHeight?

> `optional` **maxVirtualHeight?**: `number`

Defined in: [table/VirtualScroller.ts:35](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L35)

Caps the physical height (in px) written to the scroll spacer
(default: 15,000,000). Raising it past ~17.8M px breaks Firefox, which
saturates element heights at ≈17,895,697 px. Primarily a test hook —
tests inject small values to exercise scroll-space compression at
human scale.

***

### rowHeight

> **rowHeight**: `number`

Defined in: [table/VirtualScroller.ts:16](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/VirtualScroller.ts#L16)

Fixed height per row in pixels
