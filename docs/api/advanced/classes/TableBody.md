[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:174](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L174)

TableBody renders data rows using virtual scrolling.

## Example

```typescript
const body = new TableBody(container, state, bridge, actions);
await body.initialize();

// Later, clean up
body.destroy();
```

## Constructors

### Constructor

> **new TableBody**(`container`, `state`, `bridge`, `actions?`, `options?`): `TableBody`

Defined in: [table/TableBody.ts:348](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L348)

#### Parameters

##### container

`HTMLElement`

##### state

[`TableState`](../interfaces/TableState.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### actions?

[`StateActions`](StateActions.md)

##### options?

[`TableBodyOptions`](../interfaces/TableBodyOptions.md) = `{}`

#### Returns

`TableBody`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/TableBody.ts:2706](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2706)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getColumnSpan()

> **getColumnSpan**(`column`): \{ `left`: `number`; `width`: `number`; \} \| `null`

Defined in: [table/TableBody.ts:2632](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2632)

Where `column` sits on the horizontal content axis, in px, or `null` when
it is not a visible column.

Reads the same cached prefix sums the window and the spacers are built
from, so a caller that scrolls to `left` lands exactly where the body drew
the column — which is what keyboard navigation needs and what a private
`for` loop over `columnWidths` kept getting subtly wrong (it summed raw
widths; the body sums rounded ones).

#### Parameters

##### column

`string`

#### Returns

\{ `left`: `number`; `width`: `number`; \} \| `null`

#### Example

```typescript
const span = body.getColumnSpan('price');
if (span) bodyScroll.scrollLeft = span.left - body.getPinnedWidthPx();
```

***

### getColumnWindow()

> **getColumnWindow**(): [`ColumnWindow`](../interfaces/ColumnWindow.md)

Defined in: [table/TableBody.ts:2612](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2612)

The column window the rendered rows were built for.

A copy: the live window is replaced wholesale on every pass, and handing
out the object itself would let a caller hold something that silently
stops describing the DOM.

#### Returns

[`ColumnWindow`](../interfaces/ColumnWindow.md)

#### Example

```typescript
const win = body.getColumnWindow();
// rows render visibleColumns[0, win.pinnedCount) then [win.start, win.end)
const rendered = win.pinnedCount + (win.end - win.start);
```

***

### getPinnedWidthPx()

> **getPinnedWidthPx**(): `number`

Defined in: [table/TableBody.ts:2652](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2652)

Total width of the leading pinned run — where unpinned content starts, and
the width of the sticky band covering it.

Summed over `visibleColumns[0, pinnedCount)` rather than over
`pinnedColumns`, because `hideColumn` leaves a hidden column in
`pinnedColumns` and counting it overstates the band by a full column.

#### Returns

`number`

***

### getVirtualScroller()

> **getVirtualScroller**(): [`VirtualScroller`](VirtualScroller.md)

Defined in: [table/TableBody.ts:2542](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2542)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:2549](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2549)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:412](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L412)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableBody.ts:2677](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2677)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:2662](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2662)

Force a refresh of the table body

#### Returns

`void`

***

### refreshColumnWindow()

> **refreshColumnWindow**(): `void`

Defined in: [table/TableBody.ts:2574](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2574)

Recompute the column window and re-render the body if it moved.

Synchronous: when this returns, the DOM matches the current `scrollLeft`.
That is the whole reason it is public. The browser does not dispatch
`scroll` until after the current task, so code that *writes* `scrollLeft`
— keyboard navigation, the filter-change scroll pin, the scroll restore
after a re-render — would otherwise leave a frame in which the rows on
screen belong to the previous offset. At 1,000 columns that frame is a
blank body.

Cheap when nothing moved: one binary search over cached prefix sums and a
three-field comparison, no DOM work at all. Safe to call unconditionally
after any programmatic scroll.

#### Returns

`void`

#### Example

```typescript
bodyScroll.scrollLeft = targetLeft;
body.refreshColumnWindow(); // cells for the new offset exist now
```

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:2670](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/TableBody.ts#L2670)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
