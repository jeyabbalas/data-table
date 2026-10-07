[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseVisualization

# Abstract Class: BaseVisualization

Defined in: [visualizations/BaseVisualization.ts:170](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L170)

Abstract base class for column visualizations.

## Example

```typescript
class Histogram extends BaseVisualization {
  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    this.dataPromise = this.fetchData(); // the base class does not fetch on construction
  }
  async fetchData() {
    // Fetch histogram bins from DuckDB, keep them, then render()
  }
  render() {
    // Draw histogram bars
  }
  // The six input handlers: empty for a chart that takes no input
  protected handleMouseMove() {}
  protected handleClick() {}
  protected handleMouseLeave() {}
  protected handleMouseDown() {}
  protected handleMouseUp() {}
  protected handleKeyDown() {}
}
```

## Extended by

- [`ValueCounts`](ValueCounts.md)
- [`NestedSummaryVisualization`](NestedSummaryVisualization.md)

## Constructors

### Constructor

> **new BaseVisualization**(`container`, `column`, `options`): `BaseVisualization`

Defined in: [visualizations/BaseVisualization.ts:215](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L215)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

`BaseVisualization`

## Properties

### canvas

> `protected` **canvas**: `HTMLCanvasElement`

Defined in: [visualizations/BaseVisualization.ts:171](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L171)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:217](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L217)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:216](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L216)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:172](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L172)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:200](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L200)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:176](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L176)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:175](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L175)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:174](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L174)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:177](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L177)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:218](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L218)

***

### reportsDefaultStats

> `readonly` **reportsDefaultStats**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:187](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L187)

Whether the chart reports its stats through `onDefaultStatsChange` each
time a fetch lands, as the built-in charts do. The table's stats slot
says a chart's fetch failed only for a chart that does, or that has
reported stats before: nothing else would take the line back. A custom
chart that reports its stats after every fetch can set it, to have a
failure of its first fetch said too.

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:173](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L173)

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:203](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L203)

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

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:457](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L457)

Clear the entire canvas

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:539](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L539)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:445](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L445)

Called by WindowListenerManager to dispatch window keydown events.

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

***

### dispatchWindowMouseUp()

> **dispatchWindowMouseUp**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:434](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L434)

Called by WindowListenerManager to dispatch window mouseup events.
Translates coordinates relative to this instance's canvas.

#### Parameters

##### e

`MouseEvent`

#### Returns

`void`

***

### fetchData()

> `abstract` **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:292](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L292)

Fetch data needed for this visualization from DuckDB.
Called when the visualization is created and when filters change.

#### Returns

`Promise`\<`void`\>

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:464](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L464)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:471](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L471)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### handleClick()

> `abstract` `protected` **handleClick**(`x`, `y`, `event?`): `void`

Defined in: [visualizations/BaseVisualization.ts:313](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L313)

Handle click on the visualization.

#### Parameters

##### x

`number`

X coordinate relative to canvas

##### y

`number`

Y coordinate relative to canvas

##### event?

`MouseEvent`

Optional MouseEvent for detecting modifier keys

#### Returns

`void`

***

### handleKeyDown()

> `abstract` `protected` **handleKeyDown**(`key`): `void`

Defined in: [visualizations/BaseVisualization.ts:342](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L342)

Handle keyboard events for the visualization.
Used for canceling brush with Escape, etc.

#### Parameters

##### key

`string`

The key that was pressed

#### Returns

`void`

***

### handleMouseDown()

> `abstract` `protected` **handleMouseDown**(`x`, `y`): `void`

Defined in: [visualizations/BaseVisualization.ts:327](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L327)

Handle mouse down on the visualization.
Used for brush/drag interactions.

#### Parameters

##### x

`number`

X coordinate relative to canvas

##### y

`number`

Y coordinate relative to canvas

#### Returns

`void`

***

### handleMouseLeave()

> `abstract` `protected` **handleMouseLeave**(): `void`

Defined in: [visualizations/BaseVisualization.ts:319](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L319)

Handle mouse leaving the visualization.
Used to clear hover states.

#### Returns

`void`

***

### handleMouseMove()

> `abstract` `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/BaseVisualization.ts:305](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L305)

Handle mouse movement over the visualization.

#### Parameters

##### x

`number`

X coordinate relative to canvas (0 to width)

##### y

`number`

Y coordinate relative to canvas (0 to height)

#### Returns

`void`

***

### handleMouseUp()

> `abstract` `protected` **handleMouseUp**(`x`, `y`): `void`

Defined in: [visualizations/BaseVisualization.ts:335](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L335)

Handle mouse up on the visualization.
Used for completing brush/drag interactions.

#### Parameters

##### x

`number`

X coordinate relative to canvas

##### y

`number`

Y coordinate relative to canvas

#### Returns

`void`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:478](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L478)

Check if the visualization has been destroyed

#### Returns

`boolean`

***

### render()

> `abstract` **render**(): `void`

Defined in: [visualizations/BaseVisualization.ts:298](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L298)

Render the visualization on the canvas.
Called after data fetch and on resize.

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:500](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L500)

Update filters on a live visualization and re-fetch data.
Used by CrossfilterCoordinator to push new filter arrays
without recreating the visualization.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>

***

### updateSize()

> `protected` **updateSize**(): `void`

Defined in: [visualizations/BaseVisualization.ts:352](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L352)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:491](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L491)

Resolves once the visualization's initial `fetchData()` settles. The
facade awaits this during `loadData` so a consumer chaining `addFilter`
after `await createDataTable` doesn't race the unfiltered first fetch.

Subclasses that don't fetch in their constructor return a pre-resolved
promise. Resolves on success, rejection (observable via
`options.onError`), and post-destroy. Never hangs.

#### Returns

`Promise`\<`void`\>
