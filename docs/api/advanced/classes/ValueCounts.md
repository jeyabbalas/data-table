[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCounts

# Class: ValueCounts

Defined in: [visualizations/valuecounts/ValueCounts.ts:151](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L151)

Stacked bar visualization rendered into the column header for categorical
columns (`string` / `boolean` / `uuid`). Each segment represents a distinct
value sized by row count; click toggles a `SetFilter` membership. Long
tails fold into an "other" segment.

## Extends

- [`BaseVisualization`](BaseVisualization.md)

## Constructors

### Constructor

> **new ValueCounts**(`container`, `column`, `options`): `ValueCounts`

Defined in: [visualizations/valuecounts/ValueCounts.ts:202](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L202)

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

Defined in: [visualizations/BaseVisualization.ts:148](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L148)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`canvas`](BaseVisualization.md#canvas)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:184](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L184)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`column`](BaseVisualization.md#column)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:183](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L183)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`container`](BaseVisualization.md#container)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L149)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`ctx`](BaseVisualization.md#ctx)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:167](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L167)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dataPromise`](BaseVisualization.md#datapromise)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:153](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L153)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroyed`](BaseVisualization.md#destroyed)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:152](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L152)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dpr`](BaseVisualization.md#dpr)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L151)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`height`](BaseVisualization.md#height)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:154](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L154)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isFilterUpdate`](BaseVisualization.md#isfilterupdate)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:185](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L185)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`options`](BaseVisualization.md#options)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L150)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`width`](BaseVisualization.md#width)

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

[`BaseVisualization`](BaseVisualization.md).[`statsMessages`](BaseVisualization.md#statsmessages)

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:424](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L424)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`clear`](BaseVisualization.md#clear)

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1743](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1743)

Clear brush - no-op for value counts
Provided for interface compatibility

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1711](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1711)

Clear segment selection (public method for external LIFO handling)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:505](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L505)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroy`](BaseVisualization.md#destroy)

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

[`BaseVisualization`](BaseVisualization.md).[`dispatchWindowKeyDown`](BaseVisualization.md#dispatchwindowkeydown)

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

[`BaseVisualization`](BaseVisualization.md).[`dispatchWindowMouseUp`](BaseVisualization.md#dispatchwindowmouseup)

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/valuecounts/ValueCounts.ts:220](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L220)

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

Defined in: [visualizations/BaseVisualization.ts:431](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L431)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1727](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1727)

Get brush state - value counts doesn't support brush
Provided for interface compatibility

#### Returns

`null`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:438](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L438)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`getColumn`](BaseVisualization.md#getcolumn)

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1659](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1659)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1334](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1334)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1647](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1647)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1633](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1633)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1612](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1612)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseLeave`](BaseVisualization.md#handlemouseleave)

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1211](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1211)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1640](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1640)

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

Defined in: [visualizations/BaseVisualization.ts:445](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L445)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isDestroyed`](BaseVisualization.md#isdestroyed)

***

### render()

> **render**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:370](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L370)

Main render function - orchestrates all drawing

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`render`](BaseVisualization.md#render)

***

### setBrushState()

> **setBrushState**(`_state`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1735](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1735)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1678](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/valuecounts/ValueCounts.ts#L1678)

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

[`BaseVisualization`](BaseVisualization.md).[`updateFilters`](BaseVisualization.md#updatefilters)

***

### updateSize()

> `protected` **updateSize**(): `void`

Defined in: [visualizations/BaseVisualization.ts:319](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/BaseVisualization.ts#L319)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`updateSize`](BaseVisualization.md#updatesize)

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

[`BaseVisualization`](BaseVisualization.md).[`waitForData`](BaseVisualization.md#waitfordata)
