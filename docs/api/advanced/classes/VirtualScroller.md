[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VirtualScroller

# Class: VirtualScroller

Defined in: [table/VirtualScroller.ts:76](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L76)

Fixed-row-height virtual scroller — emits a `VisibleRange` whenever the
viewport crosses a row boundary so the host renders only the rows that are
actually on screen. Composed internally by [TableBody](TableBody.md); reach for
the class on `/advanced` when building a custom row renderer.

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

Defined in: [table/VirtualScroller.ts:101](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L101)

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

Defined in: [table/VirtualScroller.ts:469](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L469)

Destroy the virtual scroller and clean up resources

#### Returns

`void`

***

### getContentContainer()

> **getContentContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:424](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L424)

Get the content container element

This is the spacer element that sets the scrollable area size.

#### Returns

`HTMLElement`

***

### getRowHeight()

> **getRowHeight**(): `number`

Defined in: [table/VirtualScroller.ts:445](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L445)

Get the row height

#### Returns

`number`

***

### getScrollContainer()

> **getScrollContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:415](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L415)

Get the scroll container element

In external mode, returns the external scroll source.
In legacy mode, returns the internal scroll container.

#### Returns

`HTMLElement`

***

### getScrollTop()

> **getScrollTop**(): `number`

Defined in: [table/VirtualScroller.ts:431](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L431)

Get the current scroll top position

#### Returns

`number`

***

### getTotalRows()

> **getTotalRows**(): `number`

Defined in: [table/VirtualScroller.ts:340](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L340)

Get the total number of rows

#### Returns

`number`

***

### getViewportContainer()

> **getViewportContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:405](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L405)

Get the viewport container element

This is where rows should be rendered.

#### Returns

`HTMLElement`

***

### getViewportHeight()

> **getViewportHeight**(): `number`

Defined in: [table/VirtualScroller.ts:438](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L438)

Get the viewport height

#### Returns

`number`

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/VirtualScroller.ts:333](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L333)

Get the current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/VirtualScroller.ts:452](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L452)

Check if the scroller has been destroyed

#### Returns

`boolean`

***

### onScroll()

> **onScroll**(`callback`): () => `void`

Defined in: [table/VirtualScroller.ts:387](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L387)

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

Defined in: [table/VirtualScroller.ts:461](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L461)

Force a recalculation of the visible range

Useful when the viewport size changes.

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/VirtualScroller.ts:350](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L350)

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

Defined in: [table/VirtualScroller.ts:322](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L322)

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

Defined in: [table/VirtualScroller.ts:295](https://github.com/jeyabbalas/data-table/blob/8e290efb68a3352eb95067f414af92985757dec0/src/table/VirtualScroller.ts#L295)

Set the total number of rows

Updates the content container height and recalculates visible range.

#### Parameters

##### count

`number`

#### Returns

`void`
