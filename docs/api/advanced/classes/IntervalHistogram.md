[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogram

# Class: IntervalHistogram

Defined in: [visualizations/histogram/IntervalHistogram.ts:38](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L38)

Histogram for DuckDB `interval` columns (durations). Displays bins by
duration unit (seconds, minutes, hours, days, ...) auto-selected from the
value range. Brush emits [RangeFilter](../../index/interfaces/RangeFilter.md) entries with
`valueType: 'interval'` so SQL generation prefixes the literals with
`INTERVAL`.

## Extends

- `SharedHistogramBase`\<[`IntervalHistogramData`](../interfaces/IntervalHistogramData.md)\>

## Constructors

### Constructor

> **new IntervalHistogram**(`container`, `column`, `options`): `IntervalHistogram`

Defined in: [visualizations/histogram/IntervalHistogram.ts:44](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L44)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`IntervalHistogram`

#### Overrides

`SharedHistogramBase<IntervalHistogramData>.constructor`

## Properties

### allNullHovered

> `protected` **allNullHovered**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramBase.allNullHovered`

***

### backgroundData

> `protected` **backgroundData**: [`IntervalHistogramData`](../interfaces/IntervalHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:136](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L136)

#### Inherited from

`SharedHistogramBase.backgroundData`

***

### barPositions

> `protected` **barPositions**: `object`[] = `[]`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:180](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L180)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:157](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L157)

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

Defined in: [visualizations/BaseVisualization.ts:145](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L145)

#### Inherited from

`SharedHistogramBase.canvas`

***

### chartArea

> `protected` **chartArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:178](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L178)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:154](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L154)

#### Inherited from

`SharedHistogramBase.clickConsumedByMouseDown`

***

### colors

> `protected` **colors**: `HistogramColors`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:175](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L175)

#### Inherited from

`SharedHistogramBase.colors`

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:176](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L176)

#### Inherited from

`SharedHistogramBase.column`

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:175](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L175)

#### Inherited from

`SharedHistogramBase.container`

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:146](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L146)

#### Inherited from

`SharedHistogramBase.ctx`

***

### data

> `protected` **data**: [`IntervalHistogramData`](../interfaces/IntervalHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:135](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L135)

#### Inherited from

`SharedHistogramBase.data`

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:164](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L164)

#### Inherited from

`SharedHistogramBase.dataPromise`

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L150)

#### Inherited from

`SharedHistogramBase.destroyed`

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L149)

#### Inherited from

`SharedHistogramBase.dpr`

***

### fetchSequence

> `protected` **fetchSequence**: `number` = `0`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:139](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L139)

#### Inherited from

`SharedHistogramBase.fetchSequence`

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:148](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L148)

#### Inherited from

`SharedHistogramBase.height`

***

### hoveredBin

> `protected` **hoveredBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:142](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L142)

#### Inherited from

`SharedHistogramBase.hoveredBin`

***

### hoveredNull

> `protected` **hoveredNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:143](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L143)

#### Inherited from

`SharedHistogramBase.hoveredNull`

***

### isAllNullState

> `protected` **isAllNullState**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramBase.isAllNullState`

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L151)

#### Inherited from

`SharedHistogramBase.isFilterUpdate`

***

### nullBarArea

> `protected` **nullBarArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:179](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L179)

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

Defined in: [visualizations/BaseVisualization.ts:177](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L177)

#### Inherited from

`SharedHistogramBase.options`

***

### selectedBin

> `protected` **selectedBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:146](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L146)

#### Inherited from

`SharedHistogramBase.selectedBin`

***

### selectedNull

> `protected` **selectedNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:147](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L147)

#### Inherited from

`SharedHistogramBase.selectedNull`

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:147](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L147)

#### Inherited from

`SharedHistogramBase.width`

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:416](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L416)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clear`

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1730](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1730)

Clear the brush (public method for external LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrush`

***

### clearBrushStateOnly()

> `protected` **clearBrushStateOnly**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1396](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1396)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1103](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1103)

Clear single bar selection (public for LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearSelection`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:497](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L497)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.destroy`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:404](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L404)

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

Defined in: [visualizations/BaseVisualization.ts:393](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L393)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:225](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L225)

Draw axis labels with compact interval notation

#### Returns

`void`

#### Overrides

`SharedHistogramBase.drawAxisLabels`

***

### drawMinMaxLabels()

> `protected` **drawMinMaxLabels**(`minLabel`, `maxLabel`, `maxX`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:678](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L678)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:659](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L659)

Draw the empty set symbol (∅) below the null bar

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawNullSymbol`

***

### drawRoundedBar()

> `protected` **drawRoundedBar**(`ctx`, `x`, `y`, `width`, `height`, `radius`, `color`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:507](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L507)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:298](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L298)

Emit a range filter based on current brush bin indices

#### Returns

`void`

#### Overrides

`SharedHistogramBase.emitBrushFilter`

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/IntervalHistogram.ts:127](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L127)

Fetch interval histogram data from DuckDB.

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:263](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L263)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:278](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L278)

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

Defined in: [visualizations/BaseVisualization.ts:423](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L423)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1586](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1586)

Get the current brush state for persistence
Returns null if no brush is committed

#### Returns

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Inherited from

`SharedHistogramBase.getBrushState`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:430](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L430)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

`SharedHistogramBase.getColumn`

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1619](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1619)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:983](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L983)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1305](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1305)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1159](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1159)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1119](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1119)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseLeave`

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:840](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L840)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1256](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1256)

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

Defined in: [visualizations/BaseVisualization.ts:437](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L437)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

`SharedHistogramBase.isDestroyed`

***

### render()

> **render**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:215](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L215)

Main render method - draws the complete histogram

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.render`

***

### resetBrush()

> `protected` **resetBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1361](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1361)

Reset brush state

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.resetBrush`

***

### setBrushFromBinRange()

> `protected` **setBrushFromBinRange**(`startIdx`, `endIdx`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1717](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1717)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1598](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1598)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1633](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/SharedHistogramBase.ts#L1633)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:323](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/histogram/IntervalHistogram.ts#L323)

Base implementation handles null/default cases.
Subclasses override for range/point with type-specific bin boundaries.

#### Returns

`void`

#### Overrides

`SharedHistogramBase.syncVisualStateFromFilter`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:459](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L459)

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

Defined in: [visualizations/BaseVisualization.ts:311](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L311)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.updateSize`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:450](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/visualizations/BaseVisualization.ts#L450)

Resolves once the visualization's initial `fetchData()` settles. The
facade awaits this during `loadData` so a consumer chaining `addFilter`
after `await createDataTable` doesn't race the unfiltered first fetch.

Subclasses that don't fetch in their constructor return a pre-resolved
promise. Resolves on success, rejection (observable via
`options.onError`), and post-destroy. Never hangs.

#### Returns

`Promise`\<`void`\>

#### Inherited from

`SharedHistogramBase.waitForData`
