[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCounts

# Class: ValueCounts

Defined in: [visualizations/valuecounts/ValueCounts.ts:151](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L151)

Stacked bar visualization rendered into the column header for categorical
columns (`string` / `boolean` / `uuid`). Each segment represents a distinct
value sized by row count; click toggles a `SetFilter` membership. Long
tails fold into an "other" segment.

## Extends

- [`BaseVisualization`](BaseVisualization.md)

## Constructors

### Constructor

> **new ValueCounts**(`container`, `column`, `options`): `ValueCounts`

Defined in: [visualizations/valuecounts/ValueCounts.ts:211](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L211)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`ValueCounts`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`constructor`](BaseVisualization.md#constructor)

## Properties

### canvas

> `protected` **canvas**: `HTMLCanvasElement`

Defined in: [visualizations/BaseVisualization.ts:176](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L176)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`canvas`](BaseVisualization.md#canvas)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:222](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L222)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`column`](BaseVisualization.md#column)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:221](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L221)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`container`](BaseVisualization.md#container)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:177](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L177)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`ctx`](BaseVisualization.md#ctx)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:205](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L205)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dataPromise`](BaseVisualization.md#datapromise)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:181](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L181)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroyed`](BaseVisualization.md#destroyed)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:180](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L180)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dpr`](BaseVisualization.md#dpr)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:179](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L179)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`height`](BaseVisualization.md#height)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:182](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L182)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isFilterUpdate`](BaseVisualization.md#isfilterupdate)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:223](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L223)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`options`](BaseVisualization.md#options)

***

### reportsDefaultStats

> `readonly` **reportsDefaultStats**: `boolean` = `true`

Defined in: [visualizations/valuecounts/ValueCounts.ts:163](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L163)

Value counts report their stats each time a fetch lands.

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`reportsDefaultStats`](BaseVisualization.md#reportsdefaultstats)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:178](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L178)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`width`](BaseVisualization.md#width)

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:208](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L208)

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

###### chartFailed

> **chartFailed**: `string`

Stats-slot line for a column whose chart's data failed to load.

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

###### noData

> **noData**: `string`

What a column-header chart draws for a column with no values and no
nulls, as an empty table has: "No data".

###### nonFiniteCount

> **nonFiniteCount**: (`count`) => `string`

The end of line 2 for a column holding values its chart leaves out,
having no place on its axis: a numeric column's `NaN`, `Infinity` and
`-Infinity`, and a date column's `infinity`, `-infinity` and dates a
JavaScript `Date` cannot hold. "30 non-finite".

###### Parameters

###### count

`number`

###### Returns

`string`

###### nonNullCategory

> **nonNullCategory**: `string`

Display value for the non-null segment of a nested column's summary
bar in a hover detail line, the counterpart of `nullBinLabel`.

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

###### otherSegmentLabel

> **otherSegmentLabel**: `string`

The label drawn inside the folded "Other" segment of a value-count
bar, where it fits; `otherCategory` is its hover text.

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

[`BaseVisualization`](BaseVisualization.md).[`statsMessages`](BaseVisualization.md#statsmessages)

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:464](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L464)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`clear`](BaseVisualization.md#clear)

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1781](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1781)

Clear brush - no-op for value counts
Provided for interface compatibility

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1749](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1749)

Clear segment selection (public method for external LIFO handling)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:546](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L546)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroy`](BaseVisualization.md#destroy)

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:452](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L452)

Called by WindowListenerManager to dispatch window keydown events.

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dispatchWindowKeyDown`](BaseVisualization.md#dispatchwindowkeydown)

***

### dispatchWindowMouseUp()

> **dispatchWindowMouseUp**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:441](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L441)

Called by WindowListenerManager to dispatch window mouseup events.
Translates coordinates relative to this instance's canvas.

#### Parameters

##### e

`MouseEvent`

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dispatchWindowMouseUp`](BaseVisualization.md#dispatchwindowmouseup)

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/valuecounts/ValueCounts.ts:229](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L229)

Fetch value counts data from DuckDB.

Two-branch crossfilter pattern:
A) No filters: simple fetch, cache as initialData
B) Any filter active: ghost = initialData, foreground = allFilters aligned to initial order

#### Returns

`Promise`\<`void`\>

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`fetchData`](BaseVisualization.md#fetchdata)

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:471](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L471)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`formatNumber`](BaseVisualization.md#formatnumber)

***

### getBrushState()

> **getBrushState**(): `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1765](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1765)

Get brush state - value counts doesn't support brush
Provided for interface compatibility

#### Returns

`null`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:478](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L478)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`getColumn`](BaseVisualization.md#getcolumn)

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1699](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1699)

Get the current selection state for persistence
Returns array of selected segment indices

#### Returns

`object`

##### selectedNull

> **selectedNull**: `boolean`

##### selectedSegments

> **selectedSegments**: `number`[]

***

### handleClick()

> `protected` **handleClick**(`x`, `y`, `event?`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1316](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1316)

Handle click - select segment(s) and create filter
Supports multi-select with Ctrl/Cmd+click for regular categories

#### Parameters

##### x

`number`

##### y

`number`

##### event?

`MouseEvent`

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleClick`](BaseVisualization.md#handleclick)

***

### handleKeyDown()

> `protected` **handleKeyDown**(`_key`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1687](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1687)

Handle keyboard events - ESC handled globally

#### Parameters

##### \_key

`string`

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleKeyDown`](BaseVisualization.md#handlekeydown)

***

### handleMouseDown()

> `protected` **handleMouseDown**(`_x`, `_y`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1673](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1673)

Handle mouse down - no brush for value counts

#### Parameters

##### \_x

`number`

##### \_y

`number`

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseDown`](BaseVisualization.md#handlemousedown)

***

### handleMouseLeave()

> `protected` **handleMouseLeave**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1656](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1656)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseLeave`](BaseVisualization.md#handlemouseleave)

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1193](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1193)

Handle mouse movement - detect which segment is under cursor and update stats

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseMove`](BaseVisualization.md#handlemousemove)

***

### handleMouseUp()

> `protected` **handleMouseUp**(`_x`, `_y`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1680](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1680)

Handle mouse up - no brush for value counts

#### Parameters

##### \_x

`number`

##### \_y

`number`

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseUp`](BaseVisualization.md#handlemouseup)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:485](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L485)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isDestroyed`](BaseVisualization.md#isdestroyed)

***

### render()

> **render**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:385](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L385)

Main render function - orchestrates all drawing

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`render`](BaseVisualization.md#render)

***

### setBrushState()

> **setBrushState**(`_state`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1773](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1773)

Set brush state - no-op for value counts
Provided for interface compatibility

#### Parameters

##### \_state

`unknown`

#### Returns

`void`

***

### setSelectionState()

> **setSelectionState**(`state`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1718](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/valuecounts/ValueCounts.ts#L1718)

Restore selection state from saved state
Call after data is loaded (fetchData completed)

#### Parameters

##### state

\{ `selectedNull`: `boolean`; `selectedSegments`: `number`[]; \} \| `null`

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:507](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L507)

Update filters on a live visualization and re-fetch data.
Used by CrossfilterCoordinator to push new filter arrays
without recreating the visualization.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`updateFilters`](BaseVisualization.md#updatefilters)

***

### updateSize()

> `protected` **updateSize**(): `void`

Defined in: [visualizations/BaseVisualization.ts:359](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L359)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`updateSize`](BaseVisualization.md#updatesize)

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:498](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L498)

Resolves once the visualization's initial `fetchData()` settles. The
facade awaits this during `loadData` so a consumer chaining `addFilter`
after `await createDataTable` doesn't race the unfiltered first fetch.

Subclasses that don't fetch in their constructor return a pre-resolved
promise. Resolves on success, rejection (observable via
`options.onError`), and post-destroy. Never hangs.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`waitForData`](BaseVisualization.md#waitfordata)
