[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VirtualScroller

# Class: VirtualScroller

Defined in: [table/VirtualScroller.ts:109](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L109)

Fixed-row-height virtual scroller — emits a `VisibleRange` whenever the
viewport crosses a row boundary so the host renders only the rows that are
actually on screen. Composed internally by [TableBody](TableBody.md); reach for
the class on `/advanced` when building a custom row renderer.

**Scroll-space compression:** the physical spacer height is capped at
`maxVirtualHeight` (default 15,000,000 px) because browsers silently clamp
element heights. Below the cap the scroller behaves exactly as if the
spacer were `totalRows * rowHeight` tall. Above it, a dual-mode mapping
translates physical scroll positions into virtual ones: small deltas
(wheel, trackpad, keyboard — at most one viewport height per event) move
the virtual position linearly for native feel, while large deltas
(scrollbar thumb drags, programmatic jumps) map proportionally across the
full range, with exact reconciliation at the top and bottom edges.

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

Defined in: [table/VirtualScroller.ts:146](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L146)

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

Defined in: [table/VirtualScroller.ts:675](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L675)

Destroy the virtual scroller and clean up resources

#### Returns

`void`

***

### getContentContainer()

> **getContentContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:616](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L616)

Get the content container element

This is the spacer element that sets the scrollable area size.

#### Returns

`HTMLElement`

***

### getRowHeight()

> **getRowHeight**(): `number`

Defined in: [table/VirtualScroller.ts:651](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L651)

Get the row height

#### Returns

`number`

***

### getScrollContainer()

> **getScrollContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:607](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L607)

Get the scroll container element

In external mode, returns the external scroll source.
In legacy mode, returns the internal scroll container.

#### Returns

`HTMLElement`

***

### getScrollTop()

> **getScrollTop**(): `number`

Defined in: [table/VirtualScroller.ts:627](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L627)

Get the current physical scroll top position

This is the raw `scrollTop` of the scroll element. Above the height
cap it diverges from row space — use [getVirtualScrollTop](#getvirtualscrolltop) for
the virtual-space position; the two are identical below the cap.

#### Returns

`number`

***

### getTotalRows()

> **getTotalRows**(): `number`

Defined in: [table/VirtualScroller.ts:499](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L499)

Get the total number of rows

#### Returns

`number`

***

### getViewportContainer()

> **getViewportContainer**(): `HTMLElement`

Defined in: [table/VirtualScroller.ts:597](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L597)

Get the viewport container element

This is where rows should be rendered.

#### Returns

`HTMLElement`

***

### getViewportHeight()

> **getViewportHeight**(): `number`

Defined in: [table/VirtualScroller.ts:644](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L644)

Get the viewport height

#### Returns

`number`

***

### getVirtualScrollTop()

> **getVirtualScrollTop**(): `number`

Defined in: [table/VirtualScroller.ts:637](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L637)

Get the current scroll position in virtual space

Virtual-space counterpart of `getScrollTop()`; identical below the
height cap.

#### Returns

`number`

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/VirtualScroller.ts:492](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L492)

Get the current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/VirtualScroller.ts:658](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L658)

Check if the scroller has been destroyed

#### Returns

`boolean`

***

### onScroll()

> **onScroll**(`callback`): () => `void`

Defined in: [table/VirtualScroller.ts:579](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L579)

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

Defined in: [table/VirtualScroller.ts:667](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L667)

Force a recalculation of the visible range

Useful when the viewport size changes.

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/VirtualScroller.ts:515](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L515)

Scroll to a specific row

The target is computed in virtual space, so any index lands exactly even
above the height cap. In compressed mode, targets within about one
compression ratio of an exact edge get snapped by the top/bottom
reconciliation branches on the follow-up scroll event — the target row
stays fully visible (same class of clamp this method already performs).

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

Defined in: [table/VirtualScroller.ts:481](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L481)

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

Defined in: [table/VirtualScroller.ts:433](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/VirtualScroller.ts#L433)

Set the total number of rows

Updates the (height-capped) content container height and recalculates
the visible range, preserving the current scroll position across the
identity ↔ compressed boundary.

#### Parameters

##### count

`number`

#### Returns

`void`
