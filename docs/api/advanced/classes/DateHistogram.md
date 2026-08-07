[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DateHistogram

# Class: DateHistogram

Defined in: [visualizations/histogram/DateHistogram.ts:43](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L43)

Calendar-aware histogram for `date` and `timestamp` columns. Picks an
appropriate bin granularity (year / month / day / hour / minute) from the
value range and renders ticks as readable date labels. Same brush /
crossfilter contract as [Histogram](Histogram.md).

## Extends

- `SharedHistogramBase`\<[`DateHistogramData`](../interfaces/DateHistogramData.md)\>

## Constructors

### Constructor

> **new DateHistogram**(`container`, `column`, `options`): `DateHistogram`

Defined in: [visualizations/histogram/DateHistogram.ts:52](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L52)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramBase.allNullHovered`

***

### backgroundData

> `protected` **backgroundData**: [`DateHistogramData`](../interfaces/DateHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:136](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L136)

#### Inherited from

`SharedHistogramBase.backgroundData`

***

### barPositions

> `protected` **barPositions**: `object`[] = `[]`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:180](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L180)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:157](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L157)

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

Defined in: [visualizations/BaseVisualization.ts:148](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L148)

#### Inherited from

`SharedHistogramBase.canvas`

***

### chartArea

> `protected` **chartArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:178](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L178)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:154](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L154)

#### Inherited from

`SharedHistogramBase.clickConsumedByMouseDown`

***

### colors

> `protected` **colors**: `HistogramColors`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:175](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L175)

#### Inherited from

`SharedHistogramBase.colors`

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:184](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L184)

#### Inherited from

`SharedHistogramBase.column`

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:183](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L183)

#### Inherited from

`SharedHistogramBase.container`

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L149)

#### Inherited from

`SharedHistogramBase.ctx`

***

### data

> `protected` **data**: [`DateHistogramData`](../interfaces/DateHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:135](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L135)

#### Inherited from

`SharedHistogramBase.data`

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:167](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L167)

#### Inherited from

`SharedHistogramBase.dataPromise`

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:153](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L153)

#### Inherited from

`SharedHistogramBase.destroyed`

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:152](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L152)

#### Inherited from

`SharedHistogramBase.dpr`

***

### fetchSequence

> `protected` **fetchSequence**: `number` = `0`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:139](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L139)

#### Inherited from

`SharedHistogramBase.fetchSequence`

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L151)

#### Inherited from

`SharedHistogramBase.height`

***

### hoveredBin

> `protected` **hoveredBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:142](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L142)

#### Inherited from

`SharedHistogramBase.hoveredBin`

***

### hoveredNull

> `protected` **hoveredNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:143](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L143)

#### Inherited from

`SharedHistogramBase.hoveredNull`

***

### isAllNullState

> `protected` **isAllNullState**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramBase.isAllNullState`

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:154](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L154)

#### Inherited from

`SharedHistogramBase.isFilterUpdate`

***

### nullBarArea

> `protected` **nullBarArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:179](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L179)

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

Defined in: [visualizations/BaseVisualization.ts:185](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L185)

#### Inherited from

`SharedHistogramBase.options`

***

### selectedBin

> `protected` **selectedBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:146](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L146)

#### Inherited from

`SharedHistogramBase.selectedBin`

***

### selectedNull

> `protected` **selectedNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:147](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L147)

#### Inherited from

`SharedHistogramBase.selectedNull`

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L150)

#### Inherited from

`SharedHistogramBase.width`

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:170](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L170)

Resolved i18n statistics strings; English defaults when no `messages` supplied.

##### Returns

###### allNull

> **allNull**: `string`

###### allUnique

> **allUnique**: `string`

###### allUniqueCategory

> **allUniqueCategory**: (`count`) => `string`

Display value for the all-unique segment (count = distinct values).

###### Parameters

###### count

`number`

###### Returns

`string`

###### allValues

> **allValues**: (`value`) => `string`

###### Parameters

###### value

`string`

###### Returns

`string`

###### binLabel

> **binLabel**: `string`

Bold label prefix for a histogram bin/brush selection detail line.

###### categoryLabel

> **categoryLabel**: `string`

Bold label prefix for a single selected category detail line.

###### filteredRowCount

> **filteredRowCount**: (`filtered`, `total`) => `string`

###### Parameters

###### filtered

`number`

###### total

`number`

###### Returns

`string`

###### matchCount

> **matchCount**: (`count`) => `string`

Rows of a hovered bin/segment passing all active filters, e.g. "300 match".

###### Parameters

###### count

`number`

###### Returns

`string`

###### max

> **max**: (`value`) => `string`

###### Parameters

###### value

`string`

###### Returns

`string`

###### median

> **median**: (`value`) => `string`

###### Parameters

###### value

`string`

###### Returns

`string`

###### min

> **min**: (`value`) => `string`

###### Parameters

###### value

`string`

###### Returns

`string`

###### nullBinLabel

> **nullBinLabel**: `string`

Display value for the null bin/segment in a selection detail line.

###### nullCount

> **nullCount**: (`count`) => `string`

###### Parameters

###### count

`number`

###### Returns

`string`

###### otherCategory

> **otherCategory**: (`count`) => `string`

Display value for the folded "Other" segment (count = folded distinct values).

###### Parameters

###### count

`number`

###### Returns

`string`

###### percentTrue

> **percentTrue**: (`pct`) => `string`

###### Parameters

###### pct

`number`

###### Returns

`string`

###### rowCount

> **rowCount**: (`count`) => `string`

###### Parameters

###### count

`number`

###### Returns

`string`

###### rowWord

> **rowWord**: (`count`) => `string`

###### Parameters

###### count

`number`

###### Returns

`string`

###### selectedLabel

> **selectedLabel**: `string`

Bold label prefix for a multi-category selection detail line.

###### selectionRowCount

> **selectionRowCount**: (`count`, `pct`) => `string`

Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted.

###### Parameters

###### count

`number`

###### pct

`string`

###### Returns

`string`

###### separator

> **separator**: `string`

" · " separator used between stats segments.

###### uniqueCount

> **uniqueCount**: (`count`) => `string`

###### Parameters

###### count

`number`

###### Returns

`string`

###### uniquePercent

> **uniquePercent**: (`count`, `pct`) => `string`

###### Parameters

###### count

`number`

###### pct

`number`

###### Returns

`string`

###### valueListSuffix

> **valueListSuffix**: (`total`) => `string`

Truncation suffix for a long multi-select value list (total = selected values).

###### Parameters

###### total

`number`

###### Returns

`string`

#### Inherited from

`SharedHistogramBase.statsMessages`

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:424](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L424)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clear`

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1758](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1758)

Clear the brush (public method for external LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrush`

***

### clearBrushStateOnly()

> `protected` **clearBrushStateOnly**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1413](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1413)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1120](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1120)

Clear single bar selection (public for LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearSelection`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:505](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L505)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.destroy`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:412](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L412)

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

Defined in: [visualizations/BaseVisualization.ts:401](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L401)

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

Defined in: [visualizations/histogram/DateHistogram.ts:267](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L267)

Draw axis labels with human-readable date format

#### Returns

`void`

#### Overrides

`SharedHistogramBase.drawAxisLabels`

***

### drawMinMaxLabels()

> `protected` **drawMinMaxLabels**(`minLabel`, `maxLabel`, `maxX`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:678](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L678)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:659](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L659)

Draw the empty set symbol (∅) below the null bar

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawNullSymbol`

***

### drawRoundedBar()

> `protected` **drawRoundedBar**(`ctx`, `x`, `y`, `width`, `height`, `radius`, `color`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:507](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L507)

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

Defined in: [visualizations/histogram/DateHistogram.ts:355](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L355)

Emit a range filter based on current brush bin indices

#### Returns

`void`

#### Overrides

`SharedHistogramBase.emitBrushFilter`

***

### emitCommittedStats()

> `protected` **emitCommittedStats**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1522](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1522)

Emit the committed-selection detail text — or clear it — so the stats
slot always reflects this column's own filter, regardless of how the
filter was created (brush, panel, API, preset, session restore, undo)
or which other column's filter just changed. Subclasses call this from
`fetchData` after `syncVisualStateFromFilter` has run.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.emitCommittedStats`

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/DateHistogram.ts:161](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L161)

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

Defined in: [visualizations/histogram/DateHistogram.ts:313](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L313)

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

Defined in: [visualizations/histogram/DateHistogram.ts:326](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L326)

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

### formatHoverCountLine()

> `protected` **formatHoverCountLine**(`sel`): `string`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:807](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L807)

Count line for a transient hover: the hovered bin's unfiltered size out
of the full dataset, plus — when filters are active — how many of its
rows pass all current filters.

#### Parameters

##### sel

`"null"` \| \{ `end`: `number`; `start`: `number`; \}

#### Returns

`string`

#### Inherited from

`SharedHistogramBase.formatHoverCountLine`

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:431](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L431)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

#### Inherited from

`SharedHistogramBase.formatNumber`

***

### formatSelectionCountLine()

> `protected` **formatSelectionCountLine**(`sel`): `string`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:793](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L793)

Count line for a committed selection: how many rows this column's filter
alone matches, out of the full dataset. Measured on the unfiltered
background (or the current data before any filter exists), so the text
is stable when other columns' filters change.

#### Parameters

##### sel

`"null"` \| \{ `end`: `number`; `start`: `number`; \}

#### Returns

`string`

#### Inherited from

`SharedHistogramBase.formatSelectionCountLine`

***

### getBrushState()

> **getBrushState**(): \{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1614](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1614)

Get the current brush state for persistence
Returns null if no brush is committed

#### Returns

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Inherited from

`SharedHistogramBase.getBrushState`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:438](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L438)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

`SharedHistogramBase.getColumn`

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1647](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1647)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1002](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1002)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1322](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1322)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1176](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1176)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1136](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1136)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseLeave`

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:862](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L862)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1273](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1273)

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

Defined in: [visualizations/BaseVisualization.ts:445](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L445)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

`SharedHistogramBase.isDestroyed`

***

### render()

> **render**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:215](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L215)

Main render method - draws the complete histogram

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.render`

***

### resetBrush()

> `protected` **resetBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1378](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1378)

Reset brush state

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.resetBrush`

***

### setBrushFromBinRange()

> `protected` **setBrushFromBinRange**(`startIdx`, `endIdx`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1745](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1745)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1626](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1626)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1661](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/SharedHistogramBase.ts#L1661)

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

Defined in: [visualizations/histogram/DateHistogram.ts:379](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/histogram/DateHistogram.ts#L379)

Base implementation handles null/default cases.
Subclasses override for range/point with type-specific bin boundaries.

#### Returns

`void`

#### Overrides

`SharedHistogramBase.syncVisualStateFromFilter`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:467](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L467)

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

Defined in: [visualizations/BaseVisualization.ts:319](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L319)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.updateSize`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:458](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L458)

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
