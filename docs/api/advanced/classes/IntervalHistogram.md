[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogram

# Class: IntervalHistogram

Defined in: [visualizations/histogram/IntervalHistogram.ts:50](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L50)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:56](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L56)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:175](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L175)

#### Inherited from

`SharedHistogramBase.allNullHovered`

***

### backgroundData

> `protected` **backgroundData**: [`IntervalHistogramData`](../interfaces/IntervalHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:160](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L160)

#### Inherited from

`SharedHistogramBase.backgroundData`

***

### barPositions

> `protected` **barPositions**: `object`[] = `[]`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:204](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L204)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:181](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L181)

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

Defined in: [visualizations/BaseVisualization.ts:186](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L186)

#### Inherited from

`SharedHistogramBase.canvas`

***

### chartArea

> `protected` **chartArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:202](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L202)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:178](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L178)

#### Inherited from

`SharedHistogramBase.clickConsumedByMouseDown`

***

### colors

> `protected` **colors**: `HistogramColors`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:199](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L199)

#### Inherited from

`SharedHistogramBase.colors`

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:223](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L223)

#### Inherited from

`SharedHistogramBase.column`

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:222](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L222)

#### Inherited from

`SharedHistogramBase.container`

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:187](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L187)

#### Inherited from

`SharedHistogramBase.ctx`

***

### data

> `protected` **data**: [`IntervalHistogramData`](../interfaces/IntervalHistogramData.md) \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:159](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L159)

#### Inherited from

`SharedHistogramBase.data`

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:205](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L205)

#### Inherited from

`SharedHistogramBase.dataPromise`

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:191](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L191)

#### Inherited from

`SharedHistogramBase.destroyed`

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:190](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L190)

#### Inherited from

`SharedHistogramBase.dpr`

***

### fetchSequence

> `protected` **fetchSequence**: `number` = `0`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:163](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L163)

#### Inherited from

`SharedHistogramBase.fetchSequence`

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:189](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L189)

#### Inherited from

`SharedHistogramBase.height`

***

### hoveredBin

> `protected` **hoveredBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:166](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L166)

#### Inherited from

`SharedHistogramBase.hoveredBin`

***

### hoveredNull

> `protected` **hoveredNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:167](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L167)

#### Inherited from

`SharedHistogramBase.hoveredNull`

***

### isAllNullState

> `protected` **isAllNullState**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:174](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L174)

#### Inherited from

`SharedHistogramBase.isAllNullState`

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:192](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L192)

#### Inherited from

`SharedHistogramBase.isFilterUpdate`

***

### nullBarArea

> `protected` **nullBarArea**: `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:203](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L203)

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

Defined in: [visualizations/BaseVisualization.ts:224](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L224)

#### Inherited from

`SharedHistogramBase.options`

***

### selectedBin

> `protected` **selectedBin**: `number` \| `null` = `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:170](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L170)

#### Inherited from

`SharedHistogramBase.selectedBin`

***

### selectedNull

> `protected` **selectedNull**: `boolean` = `false`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:171](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L171)

#### Inherited from

`SharedHistogramBase.selectedNull`

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:188](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L188)

#### Inherited from

`SharedHistogramBase.width`

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:208](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L208)

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

###### approxUniqueCount

> **approxUniqueCount**: (`count`) => `string`

Distinct count from `approx_count_distinct` — used instead of
`uniqueCount` above 100,000 rows. Keep a marker for "approximate" in
the translation.

###### Parameters

###### count

`number`

###### Returns

`string`

###### approxUniquePercent

> **approxUniquePercent**: (`count`, `pct`) => `string`

Approximate distinct count with its share of non-null rows — the
approximate twin of `uniquePercent`.

###### Parameters

###### count

`number`

###### pct

`number`

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

Defined in: [visualizations/BaseVisualization.ts:484](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L484)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clear`

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1828](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1828)

Clear the brush (public method for external LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearBrush`

***

### clearBrushStateOnly()

> `protected` **clearBrushStateOnly**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1429](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1429)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1143](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1143)

Clear single bar selection (public for LIFO handling)

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.clearSelection`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:642](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L642)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.destroy`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:472](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L472)

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

Defined in: [visualizations/BaseVisualization.ts:461](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L461)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:270](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L270)

Draw axis labels with compact interval notation

#### Returns

`void`

#### Overrides

`SharedHistogramBase.drawAxisLabels`

***

### drawMinMaxLabels()

> `protected` **drawMinMaxLabels**(`minLabel`, `maxLabel`, `maxX`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:729](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L729)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:710](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L710)

Draw the empty set symbol (∅) below the null bar

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.drawNullSymbol`

***

### drawRoundedBar()

> `protected` **drawRoundedBar**(`ctx`, `x`, `y`, `width`, `height`, `radius`, `color`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:558](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L558)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:343](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L343)

Emit a range filter based on current brush bin indices

#### Returns

`void`

#### Overrides

`SharedHistogramBase.emitBrushFilter`

***

### emitCommittedStats()

> `protected` **emitCommittedStats**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1597](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1597)

Emit the committed-selection detail text — or clear it — so the stats
slot always reflects this column's own filter, regardless of how the
filter was created (brush, panel, API, preset, session restore, undo)
or which other column's filter just changed. Subclasses call this from
`fetchData` after `syncVisualStateFromFilter` has run.

A refetch can land while the pointer is resting on a bar — any other
column's filter change fans out to every registered viz — so a live
hover takes precedence. Overwriting it would blank a readout still
under the cursor, and `handleMouseMove` re-emits only when the hovered
bin *changes*, so moving within the same bar would not bring it back.
Re-emitting the hover here also refreshes it against the data that just
arrived, which the previous behaviour did not do.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.emitCommittedStats`

***

### exportDataSnapshot()

> **exportDataSnapshot**(): `IntervalHistogramSnapshot` \| `null`

Defined in: [visualizations/histogram/IntervalHistogram.ts:68](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L68)

Adds the cached unfiltered `initialData` to the shared pair.

#### Returns

`IntervalHistogramSnapshot` \| `null`

#### Overrides

`SharedHistogramBase.exportDataSnapshot`

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/histogram/IntervalHistogram.ts:168](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L168)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:308](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L308)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:323](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L323)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:858](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L858)

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

Defined in: [visualizations/BaseVisualization.ts:491](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L491)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:844](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L844)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1684](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1684)

Get the current brush state for persistence
Returns null if no brush is committed

#### Returns

\{ `endBinIndex`: `number`; `startBinIndex`: `number`; \} \| `null`

#### Inherited from

`SharedHistogramBase.getBrushState`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:498](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L498)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

`SharedHistogramBase.getColumn`

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1717](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1717)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1025](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1025)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1338](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1338)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1192](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1192)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1159](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1159)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.handleMouseLeave`

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:913](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L913)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1289](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1289)

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

### hydrateOrFetch()

> `protected` **hydrateOrFetch**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:591](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L591)

The eager-first-load idiom, factored so every built-in shares it: hydrate
from `options.initialSnapshot` when one was supplied and accepted,
otherwise fetch.

Subclasses call this from **their own** constructor body
(`this.dataPromise = this.hydrateOrFetch()`), never from an intermediate
base's — a base-class constructor runs before the subclass's field
initializers, so anything it wrote into a subclass field would be
overwritten by `= null` a moment later.

#### Returns

`Promise`\<`void`\>

#### Inherited from

`SharedHistogramBase.hydrateOrFetch`

***

### importDataSnapshot()

> **importDataSnapshot**(`snapshot`): `boolean`

Defined in: [visualizations/histogram/IntervalHistogram.ts:78](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L78)

#### Parameters

##### snapshot

`unknown`

#### Returns

`boolean`

#### Overrides

`SharedHistogramBase.importDataSnapshot`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:505](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L505)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

`SharedHistogramBase.isDestroyed`

***

### render()

> **render**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:266](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L266)

Main render method - draws the complete histogram

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.render`

***

### resetBrush()

> `protected` **resetBrush**(): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1394](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1394)

Reset brush state

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.resetBrush`

***

### setBrushFromBinRange()

> `protected` **setBrushFromBinRange**(`startIdx`, `endIdx`): `void`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1815](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1815)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1696](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1696)

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

Defined in: [visualizations/histogram/SharedHistogramBase.ts:1731](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/SharedHistogramBase.ts#L1731)

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

Defined in: [visualizations/histogram/IntervalHistogram.ts:368](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/histogram/IntervalHistogram.ts#L368)

Base implementation handles null/default cases.
Subclasses override for range/point with type-specific bin boundaries.

#### Returns

`void`

#### Overrides

`SharedHistogramBase.syncVisualStateFromFilter`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:604](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L604)

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

Defined in: [visualizations/BaseVisualization.ts:379](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L379)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

`SharedHistogramBase.updateSize`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:518](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/visualizations/BaseVisualization.ts#L518)

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
