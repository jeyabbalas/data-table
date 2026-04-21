[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeHistogram

# Class: TimeHistogram

Defined in: [visualizations/histogram/TimeHistogram.ts:35](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L35)

## Extends

- `SharedHistogramBase`\<[`TimeHistogramData`](../interfaces/TimeHistogramData.md)\>

## Constructors

### Constructor

> **new TimeHistogram**(`container`, `column`, `options`): `TimeHistogram`

Defined in: [visualizations/histogram/TimeHistogram.ts:41](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L41)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`TimeHistogram`

#### Overrides

`SharedHistogramBase<TimeHistogramData>.constructor`

## Properties

### allNullHovered

> `protected` **allNullHovered**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:146](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L146)

#### Inherited from

`SharedHistogramBase.allNullHovered`

***

### backgroundData

> `protected` **backgroundData**: [`TimeHistogramData`](../interfaces/TimeHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:128](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L128)

#### Inherited from

`SharedHistogramBase.backgroundData`

***

### barPositions

> `protected` **barPositions**: `object`[] = `[]`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:175](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L175)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:152](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L152)

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

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L149)

#### Inherited from

`SharedHistogramBase.canvas`

***

### chartArea

> `protected` **chartArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:173](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L173)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:149](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L149)

#### Inherited from

`SharedHistogramBase.clickConsumedByMouseDown`

***

### colors

> `protected` **colors**: `HistogramColors`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:170](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L170)

#### Inherited from

`SharedHistogramBase.colors`

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:167](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L167)

#### Inherited from

`SharedHistogramBase.column`

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:166](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L166)

#### Inherited from

`SharedHistogramBase.container`

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L150)

#### Inherited from

`SharedHistogramBase.ctx`

***

### data

> `protected` **data**: [`TimeHistogramData`](../interfaces/TimeHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:127](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L127)

#### Inherited from

`SharedHistogramBase.data`

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/histogram/SharedHistogramBase.ts:134](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L134)

#### Inherited from

`SharedHistogramBase.dataPromise`

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:154](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L154)

#### Inherited from

`SharedHistogramBase.destroyed`

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:153](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L153)

#### Inherited from

`SharedHistogramBase.dpr`

***

### fetchSequence

> `protected` **fetchSequence**: `number` = `0`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:131](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L131)

#### Inherited from

`SharedHistogramBase.fetchSequence`

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:152](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L152)

#### Inherited from

`SharedHistogramBase.height`

***

### hoveredBin

> `protected` **hoveredBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:137](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L137)

#### Inherited from

`SharedHistogramBase.hoveredBin`

***

### hoveredNull

> `protected` **hoveredNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:138](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L138)

#### Inherited from

`SharedHistogramBase.hoveredNull`

***

### isAllNullState

> `protected` **isAllNullState**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:145](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L145)

#### Inherited from

`SharedHistogramBase.isAllNullState`

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:155](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L155)

#### Inherited from

`SharedHistogramBase.isFilterUpdate`

***

### nullBarArea

> `protected` **nullBarArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:174](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L174)

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

Defined in: [visualizations/BaseVisualization.ts:168](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L168)

#### Inherited from

`SharedHistogramBase.options`

***

### selectedBin

> `protected` **selectedBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:141](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L141)

#### Inherited from

`SharedHistogramBase.selectedBin`

***

### selectedNull

> `protected` **selectedNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:142](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L142)

#### Inherited from

`SharedHistogramBase.selectedNull`

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L151)

#### Inherited from

`SharedHistogramBase.width`

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:407](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L407)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clear`

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1729](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1729)

Clear the brush (public method for external LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrush`

***

### clearBrushStateOnly()

> `protected` **clearBrushStateOnly**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1369](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1369)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1068](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1068)

Clear single bar selection (public for LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearSelection`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:468](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L468)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.destroy`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:395](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L395)

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

Defined in: [visualizations/BaseVisualization.ts:384](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L384)

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

Defined in: [visualizations/histogram/TimeHistogram.ts:226](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L226)

Draw axis labels with human-readable time format

#### Returns

`void`

#### Overrides

`SharedHistogramBase.drawAxisLabels`

***

### drawMinMaxLabels()

> `protected` **drawMinMaxLabels**(`minLabel`, `maxLabel`, `maxX`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:664](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L664)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:645](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L645)

Draw the empty set symbol (∅) below the null bar

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawNullSymbol`

***

### drawRoundedBar()

> `protected` **drawRoundedBar**(`ctx`, `x`, `y`, `width`, `height`, `radius`, `color`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:498](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L498)

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

Defined in: [visualizations/histogram/TimeHistogram.ts:326](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L326)

Emit a range filter based on current brush bin indices

#### Returns

`void`

#### Overrides

`SharedHistogramBase.emitBrushFilter`

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/TimeHistogram.ts:147](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L147)

Fetch time histogram data from DuckDB.

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

Defined in: [visualizations/histogram/TimeHistogram.ts:281](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L281)

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

Defined in: [visualizations/histogram/TimeHistogram.ts:298](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L298)

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

Defined in: [visualizations/BaseVisualization.ts:414](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L414)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1580](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1580)

Get the current brush state for persistence
Returns null if no brush is committed

#### Returns

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Inherited from

`SharedHistogramBase.getBrushState`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:421](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L421)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

`SharedHistogramBase.getColumn`

***

### getMinMaxDisplay()

> **getMinMaxDisplay**(): \{ `max`: `string`; `min`: `string`; \} \| `null`

Defined in: [visualizations/histogram/TimeHistogram.ts:359](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L359)

Get data min/max for display purposes

#### Returns

\{ `max`: `string`; `min`: `string`; \} \| `null`

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1615](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1615)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:948](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L948)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1278](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1278)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1124](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1124)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1084](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1084)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseLeave`

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:792](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L792)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1229](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1229)

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

Defined in: [visualizations/BaseVisualization.ts:428](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L428)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

`SharedHistogramBase.isDestroyed`

***

### render()

> **render**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:214](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L214)

Main render method - draws the complete histogram

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.render`

***

### resetBrush()

> `protected` **resetBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1334](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1334)

Reset brush state

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.resetBrush`

***

### setBrushFromBinRange()

> `protected` **setBrushFromBinRange**(`startIdx`, `endIdx`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1716](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1716)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1592](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1592)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1629](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1629)

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

Defined in: [visualizations/histogram/TimeHistogram.ts:373](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/TimeHistogram.ts#L373)

Base implementation handles null/default cases.
Subclasses override for range/point with type-specific bin boundaries.

#### Returns

`void`

#### Overrides

`SharedHistogramBase.syncVisualStateFromFilter`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:437](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L437)

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

Defined in: [visualizations/BaseVisualization.ts:302](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L302)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.updateSize`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1572](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/histogram/SharedHistogramBase.ts#L1572)

Wait for initial data to be loaded without triggering a new fetch.
Use this when you need to restore state after histogram creation.

#### Returns

`Promise`\<`void`\>

#### Inherited from

`SharedHistogramBase.waitForData`
