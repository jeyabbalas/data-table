[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisibleRange

# Interface: VisibleRange

Defined in: [table/VirtualScroller.ts:41](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/VirtualScroller.ts#L41)

Represents the currently visible range of rows

## Properties

### end

> **end**: `number`

Defined in: [table/VirtualScroller.ts:45](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/VirtualScroller.ts#L45)

Last visible row index (exclusive)

***

### offsetY

> **offsetY**: `number`

Defined in: [table/VirtualScroller.ts:51](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/VirtualScroller.ts#L51)

Physical Y offset in px at which the viewport container is positioned
inside the (possibly height-capped) content element. Equals
`start * rowHeight` whenever the dataset fits under the cap.

***

### start

> **start**: `number`

Defined in: [table/VirtualScroller.ts:43](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/VirtualScroller.ts#L43)

First visible row index (inclusive)
