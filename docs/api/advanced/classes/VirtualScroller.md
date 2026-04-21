[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VirtualScroller

# Class: VirtualScroller

Defined in: [table/VirtualScroller.ts:71](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L71)

## Example

```ts
import { VirtualScroller } from '@jeyabbalas/data-table/advanced';

const scroller = new VirtualScroller(container, { rowHeight: 32 });
scroller.setTotalRows(10_000);

scroller.onScroll((range) => {
  // Render rows from range.start to range.end
  // Position container at range.offsetY
});

// Later:
scroller.destroy();
```

## See

 - VirtualScrollerOptions
 - VisibleRange
 - ScrollCallback

## Constructors

### Constructor

> **new VirtualScroller**(`container`, `options`): `VirtualScroller`

Defined in: [table/VirtualScroller.ts:96](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L96)

#### Parameters

##### container

`HTMLElement`

##### options

[`VirtualScrollerOptions`](../interfaces/VirtualScrollerOptions.md)

#### Returns

`VirtualScroller`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/VirtualScroller.ts:467](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L467)

Destroy the virtual scroller and clean up resources

#### Returns

`void`

***

### getContentContainer()

> **getContentContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:422](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L422)

Get the content container element

This is the spacer element that sets the scrollable area size.

#### Returns

`HTMLElement`

***

### getRowHeight()

> **getRowHeight**(): `number`

Defined in: [table/VirtualScroller.ts:443](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L443)

Get the row height

#### Returns

`number`

***

### getScrollContainer()

> **getScrollContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:413](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L413)

Get the scroll container element

In external mode, returns the external scroll source.
In legacy mode, returns the internal scroll container.

#### Returns

`HTMLElement`

***

### getScrollTop()

> **getScrollTop**(): `number`

Defined in: [table/VirtualScroller.ts:429](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L429)

Get the current scroll top position

#### Returns

`number`

***

### getTotalRows()

> **getTotalRows**(): `number`

Defined in: [table/VirtualScroller.ts:338](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L338)

Get the total number of rows

#### Returns

`number`

***

### getViewportContainer()

> **getViewportContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:403](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L403)

Get the viewport container element

This is where rows should be rendered.

#### Returns

`HTMLElement`

***

### getViewportHeight()

> **getViewportHeight**(): `number`

Defined in: [table/VirtualScroller.ts:436](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L436)

Get the viewport height

#### Returns

`number`

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/VirtualScroller.ts:331](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L331)

Get the current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/VirtualScroller.ts:450](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L450)

Check if the scroller has been destroyed

#### Returns

`boolean`

***

### onScroll()

> **onScroll**(`callback`): () => `void`

Defined in: [table/VirtualScroller.ts:385](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L385)

Subscribe to scroll events

#### Parameters

##### callback

[`ScrollCallback`](../type-aliases/ScrollCallback.md)

Function to call when visible range changes

#### Returns

Unsubscribe function

() => `void`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/VirtualScroller.ts:459](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L459)

Force a recalculation of the visible range

Useful when the viewport size changes.

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/VirtualScroller.ts:348](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L348)

Scroll to a specific row

#### Parameters

##### index

`number`

Row index to scroll to

##### align?

[`ScrollAlign`](../type-aliases/ScrollAlign.md) = `'start'`

Where to position the row in the viewport (default: 'start')

#### Returns

`void`

***

### setContentWidth()

> **setContentWidth**(`width`): `void`

Defined in: [table/VirtualScroller.ts:320](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L320)

Set the content width for horizontal scrolling

This sets the width of the spacer element AND the content containers
to force the scroll container to recognize the full content width.

#### Parameters

##### width

`number`

Total width in pixels

#### Returns

`void`

***

### setTotalRows()

> **setTotalRows**(`count`): `void`

Defined in: [table/VirtualScroller.ts:293](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/VirtualScroller.ts#L293)

Set the total number of rows

Updates the content container height and recalculates visible range.

#### Parameters

##### count

`number`

#### Returns

`void`
