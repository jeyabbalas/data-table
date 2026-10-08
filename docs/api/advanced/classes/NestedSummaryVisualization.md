[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NestedSummaryVisualization

# Class: NestedSummaryVisualization

Defined in: [visualizations/nested/NestedSummary.ts:169](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L169)

The header chart the default registry gives a nested column (`'nested'`:
LIST, ARRAY, STRUCT, MAP, UNION, VARIANT): a bar of its non-null and null
shares with the active filters' share drawn solid over each, and its type
outline. Built from one cheap count query; hover shows a segment's counts
in the stats slot; clicking does nothing.

Only instantiate it directly when composing a custom visualization
pipeline, or to give it a column type of your own choosing.

## Example

```ts
import { VisualizationRegistry, createDataTable } from '@jeyabbalas/data-table';
import { NestedSummaryVisualization } from '@jeyabbalas/data-table/advanced';

// Give text columns (JSON ones included) the cheap summary bar instead of
// value counts, which group every value.
const visualizationRegistry = new VisualizationRegistry();
visualizationRegistry.register({
  name: 'text-summary',
  isApplicable: (type) => type === 'string',
  constructor: NestedSummaryVisualization,
  priority: 10,
});
await createDataTable({ container, source, visualizationRegistry });
```

## Extends

- [`BaseVisualization`](BaseVisualization.md)

## Constructors

### Constructor

> **new NestedSummaryVisualization**(`container`, `column`, `options`): `NestedSummaryVisualization`

Defined in: [visualizations/nested/NestedSummary.ts:199](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L199)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`NestedSummaryVisualization`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`constructor`](BaseVisualization.md#constructor)

## Properties

### canvas

> `protected` **canvas**: `HTMLCanvasElement`

Defined in: [visualizations/BaseVisualization.ts:176](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L176)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`canvas`](BaseVisualization.md#canvas)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:222](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L222)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`column`](BaseVisualization.md#column)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:221](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L221)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`container`](BaseVisualization.md#container)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:177](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L177)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`ctx`](BaseVisualization.md#ctx)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:205](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L205)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dataPromise`](BaseVisualization.md#datapromise)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:181](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L181)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroyed`](BaseVisualization.md#destroyed)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:180](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L180)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dpr`](BaseVisualization.md#dpr)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:179](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L179)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`height`](BaseVisualization.md#height)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:182](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L182)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isFilterUpdate`](BaseVisualization.md#isfilterupdate)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:223](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L223)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`options`](BaseVisualization.md#options)

***

### reportsDefaultStats

> `readonly` **reportsDefaultStats**: `boolean` = `true`

Defined in: [visualizations/nested/NestedSummary.ts:171](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L171)

The summary reports its stats each time a fetch lands.

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`reportsDefaultStats`](BaseVisualization.md#reportsdefaultstats)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:178](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L178)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`width`](BaseVisualization.md#width)

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:208](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L208)

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

Defined in: [visualizations/BaseVisualization.ts:464](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L464)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`clear`](BaseVisualization.md#clear)

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:546](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L546)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroy`](BaseVisualization.md#destroy)

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:452](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L452)

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

Defined in: [visualizations/BaseVisualization.ts:441](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L441)

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

Defined in: [visualizations/nested/NestedSummary.ts:218](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L218)

Count the column's rows and non-null values, filtered and not, in one
query. The latest fetch wins: one that settles after a newer one started
is dropped.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`fetchData`](BaseVisualization.md#fetchdata)

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:471](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L471)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`formatNumber`](BaseVisualization.md#formatnumber)

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:478](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L478)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`getColumn`](BaseVisualization.md#getcolumn)

***

### handleClick()

> `protected` **handleClick**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:611](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L611)

Clicking does nothing: a nested column is filtered from its filter panel.

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleClick`](BaseVisualization.md#handleclick)

***

### handleKeyDown()

> `protected` **handleKeyDown**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:627](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L627)

No keyboard selection on the summary bar.

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleKeyDown`](BaseVisualization.md#handlekeydown)

***

### handleMouseDown()

> `protected` **handleMouseDown**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:617](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L617)

No brush on the summary bar.

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseDown`](BaseVisualization.md#handlemousedown)

***

### handleMouseLeave()

> `protected` **handleMouseLeave**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:570](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L570)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseLeave`](BaseVisualization.md#handlemouseleave)

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/nested/NestedSummary.ts:546](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L546)

Hover a segment: highlight it, fade the other one, and show its counts
in the stats slot.

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

> `protected` **handleMouseUp**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:622](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L622)

No brush on the summary bar.

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseUp`](BaseVisualization.md#handlemouseup)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:485](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L485)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isDestroyed`](BaseVisualization.md#isdestroyed)

***

### render()

> **render**(): `void`

Defined in: [visualizations/nested/NestedSummary.ts:285](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/nested/NestedSummary.ts#L285)

Main render function - orchestrates all drawing

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`render`](BaseVisualization.md#render)

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:507](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L507)

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

Defined in: [visualizations/BaseVisualization.ts:359](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L359)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`updateSize`](BaseVisualization.md#updatesize)

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:498](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/BaseVisualization.ts#L498)

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
