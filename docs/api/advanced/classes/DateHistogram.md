[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DateHistogram

# Class: DateHistogram

Defined in: [visualizations/histogram/DateHistogram.ts:43](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L43)

Calendar-aware histogram for `date` and `timestamp` columns. Picks an
appropriate bin granularity (year / month / day / hour / minute) from the
value range and renders ticks as readable date labels. Same brush /
crossfilter contract as [Histogram](Histogram.md).

## Extends

- `SharedHistogramBase`\<[`DateHistogramData`](../interfaces/DateHistogramData.md)\>

## Constructors

### Constructor

> **new DateHistogram**(`container`, `column`, `options`): `DateHistogram`

Defined in: [visualizations/histogram/DateHistogram.ts:52](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L52)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`DateHistogram`

#### Overrides

`SharedHistogramBase<DateHistogramData>.constructor`

## Properties

### allNullHovered

> `protected` **allNullHovered**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:154](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L154)

#### Inherited from

`SharedHistogramBase.allNullHovered`

***

### backgroundData

> `protected` **backgroundData**: [`DateHistogramData`](../interfaces/DateHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:136](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L136)

#### Inherited from

`SharedHistogramBase.backgroundData`

***

### barPositions

> `protected` **barPositions**: `object`[] = `[]`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:183](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L183)

#### binIndex

> **binIndex**: `number`

#### width

> **width**: `number`

#### x

> **x**: `number`

#### Inherited from

`SharedHistogramBase.barPositions`

***

### brushState

> `protected` **brushState**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:160](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L160)

#### active

> **active**: `boolean` = `false`

#### committed

> **committed**: `boolean` = `false`

#### currentX

> **currentX**: `number` = `0`

#### endBinIndex

> **endBinIndex**: `number` = `-1`

#### lastClickTime

> **lastClickTime**: `number` = `0`

#### lastClickX

> **lastClickX**: `number` = `0`

#### lastClickY

> **lastClickY**: `number` = `0`

#### slideClickOffset

> **slideClickOffset**: `number` = `0`

#### slideStartX

> **slideStartX**: `number` = `0`

#### slideVisualOffset

> **slideVisualOffset**: `number` = `0`

#### sliding

> **sliding**: `boolean` = `false`

#### startBinIndex

> **startBinIndex**: `number` = `-1`

#### startX

> **startX**: `number` = `0`

#### Inherited from

`SharedHistogramBase.brushState`

***

### canvas

> `protected` **canvas**: `HTMLCanvasElement`

Defined in: [visualizations/BaseVisualization.ts:145](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L145)

#### Inherited from

`SharedHistogramBase.canvas`

***

### chartArea

> `protected` **chartArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:181](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L181)

#### height

> **height**: `number` = `0`

#### width

> **width**: `number` = `0`

#### x

> **x**: `number` = `0`

#### y

> **y**: `number` = `0`

#### Inherited from

`SharedHistogramBase.chartArea`

***

### clickConsumedByMouseDown

> `protected` **clickConsumedByMouseDown**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:157](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L157)

#### Inherited from

`SharedHistogramBase.clickConsumedByMouseDown`

***

### colors

> `protected` **colors**: `HistogramColors`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:178](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L178)

#### Inherited from

`SharedHistogramBase.colors`

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:163](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L163)

#### Inherited from

`SharedHistogramBase.column`

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:162](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L162)

#### Inherited from

`SharedHistogramBase.container`

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:146](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L146)

#### Inherited from

`SharedHistogramBase.ctx`

***

### data

> `protected` **data**: [`DateHistogramData`](../interfaces/DateHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:135](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L135)

#### Inherited from

`SharedHistogramBase.data`

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/histogram/SharedHistogramBase.ts:142](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L142)

#### Inherited from

`SharedHistogramBase.dataPromise`

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L150)

#### Inherited from

`SharedHistogramBase.destroyed`

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L149)

#### Inherited from

`SharedHistogramBase.dpr`

***

### fetchSequence

> `protected` **fetchSequence**: `number` = `0`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:139](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L139)

#### Inherited from

`SharedHistogramBase.fetchSequence`

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:148](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L148)

#### Inherited from

`SharedHistogramBase.height`

***

### hoveredBin

> `protected` **hoveredBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:145](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L145)

#### Inherited from

`SharedHistogramBase.hoveredBin`

***

### hoveredNull

> `protected` **hoveredNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:146](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L146)

#### Inherited from

`SharedHistogramBase.hoveredNull`

***

### isAllNullState

> `protected` **isAllNullState**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:153](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L153)

#### Inherited from

`SharedHistogramBase.isAllNullState`

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L151)

#### Inherited from

`SharedHistogramBase.isFilterUpdate`

***

### nullBarArea

> `protected` **nullBarArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:182](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L182)

#### height

> **height**: `number` = `0`

#### width

> **width**: `number` = `0`

#### x

> **x**: `number` = `0`

#### y

> **y**: `number` = `0`

#### Inherited from

`SharedHistogramBase.nullBarArea`

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:164](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L164)

#### Inherited from

`SharedHistogramBase.options`

***

### selectedBin

> `protected` **selectedBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:149](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L149)

#### Inherited from

`SharedHistogramBase.selectedBin`

***

### selectedNull

> `protected` **selectedNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramBase.selectedNull`

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:147](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L147)

#### Inherited from

`SharedHistogramBase.width`

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:403](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L403)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clear`

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1695](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1695)

Clear the brush (public method for external LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrush`

***

### clearBrushStateOnly()

> `protected` **clearBrushStateOnly**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1357](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1357)

Clear brush visual state without triggering filter removal.
Used by syncVisualStateFromFilter() when transitioning from a brush
to a non-brush visual state (e.g., point/set filter → selectedBin).
Unlike resetBrush(), this does NOT call onFilterChange(null) or onBrushClear.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrushStateOnly`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1063](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1063)

Clear single bar selection (public for LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearSelection`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:464](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L464)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.destroy`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:391](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L391)

Called by WindowListenerManager to dispatch window keydown events.

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.dispatchWindowKeyDown`

***

### dispatchWindowMouseUp()

> **dispatchWindowMouseUp**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:380](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L380)

Called by WindowListenerManager to dispatch window mouseup events.
Translates coordinates relative to this instance's canvas.

#### Parameters

##### e

`MouseEvent`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.dispatchWindowMouseUp`

***

### drawAxisLabels()

> `protected` **drawAxisLabels**(): `void`

Defined in: [visualizations/histogram/DateHistogram.ts:262](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L262)

Draw axis labels with human-readable date format

#### Returns

`void`

#### Overrides

`SharedHistogramBase.drawAxisLabels`

***

### drawMinMaxLabels()

> `protected` **drawMinMaxLabels**(`minLabel`, `maxLabel`, `maxX`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:667](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L667)

Draw min/max axis labels with overlap detection and truncation.
If both labels fit, renders as-is; otherwise adaptively allocates
space and truncates the longer label with ellipsis.

#### Parameters

##### minLabel

`string`

##### maxLabel

`string`

##### maxX

`number`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawMinMaxLabels`

***

### drawNullSymbol()

> `protected` **drawNullSymbol**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:648](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L648)

Draw the empty set symbol (∅) below the null bar

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawNullSymbol`

***

### drawRoundedBar()

> `protected` **drawRoundedBar**(`ctx`, `x`, `y`, `width`, `height`, `radius`, `color`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:496](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L496)

Draw a single bar with rounded top corners

#### Parameters

##### ctx

`CanvasRenderingContext2D`

##### x

`number`

##### y

`number`

##### width

`number`

##### height

`number`

##### radius

`number`

##### color

`string`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawRoundedBar`

***

### emitBrushFilter()

> `protected` **emitBrushFilter**(): `void`

Defined in: [visualizations/histogram/DateHistogram.ts:350](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L350)

Emit a range filter based on current brush bin indices

#### Returns

`void`

#### Overrides

`SharedHistogramBase.emitBrushFilter`

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/DateHistogram.ts:161](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L161)

Fetch date histogram data from DuckDB.

Two-branch crossfilter pattern:
A) No filters: simple fetch, cache as initialData
B) Any filter active: ghost = initialData, foreground = allFilters

#### Returns

`Promise`\<`void`\>

#### Overrides

`SharedHistogramBase.fetchData`

***

### formatBinRange()

> `protected` **formatBinRange**(`binIndex`): `string`

Defined in: [visualizations/histogram/DateHistogram.ts:308](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L308)

Format a single bin's range for hover/selection stats

#### Parameters

##### binIndex

`number`

#### Returns

`string`

#### Overrides

`SharedHistogramBase.formatBinRange`

***

### formatBrushRange()

> `protected` **formatBrushRange**(`startIdx`, `endIdx`): `string`

Defined in: [visualizations/histogram/DateHistogram.ts:321](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L321)

Format a brush range spanning startIdx to endIdx

#### Parameters

##### startIdx

`number`

##### endIdx

`number`

#### Returns

`string`

#### Overrides

`SharedHistogramBase.formatBrushRange`

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:410](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L410)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

#### Inherited from

`SharedHistogramBase.formatNumber`

***

### getBrushState()

> **getBrushState**(): \{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1551](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1551)

Get the current brush state for persistence
Returns null if no brush is committed

#### Returns

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Inherited from

`SharedHistogramBase.getBrushState`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:417](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L417)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

`SharedHistogramBase.getColumn`

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1584](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1584)

Get the current selection state for persistence

#### Returns

`object`

##### selectedBin

> **selectedBin**: `number` \| `null`

##### selectedNull

> **selectedNull**: `boolean`

#### Inherited from

`SharedHistogramBase.getSelectionState`

***

### handleClick()

> `protected` **handleClick**(`x`, `y`, `_event?`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:943](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L943)

Handle click - create filter via one-bin brush or null selection

Option A: A quick click on a histogram bar is treated as a one-bin brush,
creating a range filter. The brush is the sole interaction for continuous data.
Null bar click creates a null filter (separate from brush).

#### Parameters

##### x

`number`

##### y

`number`

##### \_event?

`MouseEvent`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleClick`

***

### handleKeyDown()

> `protected` **handleKeyDown**(`_key`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1266](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1266)

Handle keyboard events
Note: Escape is handled by InteractionManager for LIFO behavior across columns

#### Parameters

##### \_key

`string`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleKeyDown`

***

### handleMouseDown()

> `protected` **handleMouseDown**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1119](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1119)

Handle mouse down - start potential brush selection or start sliding

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseDown`

***

### handleMouseLeave()

> `protected` **handleMouseLeave**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1079](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1079)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseLeave`

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:795](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L795)

Handle mouse movement - detect which bar is under cursor and update stats

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseMove`

***

### handleMouseUp()

> `protected` **handleMouseUp**(`_x`, `_y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1217](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1217)

Handle mouse up - stop sliding or commit brush

#### Parameters

##### \_x

`number`

##### \_y

`number`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseUp`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:424](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L424)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

`SharedHistogramBase.isDestroyed`

***

### render()

> **render**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:218](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L218)

Main render method - draws the complete histogram

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.render`

***

### resetBrush()

> `protected` **resetBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1322](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1322)

Reset brush state

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.resetBrush`

***

### setBrushFromBinRange()

> `protected` **setBrushFromBinRange**(`startIdx`, `endIdx`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1682](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1682)

Helper: set brush state to span bins [startIdx, endIdx].

#### Parameters

##### startIdx

`number`

##### endIdx

`number`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.setBrushFromBinRange`

***

### setBrushState()

> **setBrushState**(`state`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1563](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1563)

Restore brush state from saved state
Call after data is loaded (fetchData completed)

#### Parameters

##### state

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.setBrushState`

***

### setSelectionState()

> **setSelectionState**(`state`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1598](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1598)

Restore selection state from saved state
Call after data is loaded (fetchData completed)

#### Parameters

##### state

###### selectedBin

`number` \| `null`

###### selectedNull

`boolean`

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.setSelectionState`

***

### syncVisualStateFromFilter()

> `protected` **syncVisualStateFromFilter**(): `void`

Defined in: [visualizations/histogram/DateHistogram.ts:374](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/DateHistogram.ts#L374)

Base implementation handles null/default cases.
Subclasses override for range/point with type-specific bin boundaries.

#### Returns

`void`

#### Overrides

`SharedHistogramBase.syncVisualStateFromFilter`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:433](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L433)

Update filters on a live visualization and re-fetch data.
Used by CrossfilterCoordinator to push new filter arrays
without recreating the visualization.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>

#### Inherited from

`SharedHistogramBase.updateFilters`

***

### updateSize()

> `protected` **updateSize**(): `void`

Defined in: [visualizations/BaseVisualization.ts:298](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseVisualization.ts#L298)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.updateSize`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1543](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/histogram/SharedHistogramBase.ts#L1543)

Wait for initial data to be loaded without triggering a new fetch.
Use this when you need to restore state after histogram creation.

#### Returns

`Promise`\<`void`\>

#### Inherited from

`SharedHistogramBase.waitForData`
