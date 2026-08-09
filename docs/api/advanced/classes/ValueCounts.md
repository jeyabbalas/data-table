[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ValueCounts

# Class: ValueCounts

Defined in: [visualizations/valuecounts/ValueCounts.ts:182](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L182)

Stacked bar visualization rendered into the column header for categorical
columns (`string` / `boolean` / `uuid`). Each segment represents a distinct
value sized by row count; click toggles a `SetFilter` membership. Long
tails fold into an "other" segment.

## Extends

- [`BaseVisualization`](BaseVisualization.md)

## Constructors

### Constructor

> **new ValueCounts**(`container`, `column`, `options`): `ValueCounts`

Defined in: [visualizations/valuecounts/ValueCounts.ts:233](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L233)

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

Defined in: [visualizations/BaseVisualization.ts:192](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L192)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`canvas`](BaseVisualization.md#canvas)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:229](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L229)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`column`](BaseVisualization.md#column)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:228](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L228)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`container`](BaseVisualization.md#container)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:193](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L193)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`ctx`](BaseVisualization.md#ctx)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:211](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L211)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dataPromise`](BaseVisualization.md#datapromise)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:197](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L197)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroyed`](BaseVisualization.md#destroyed)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:196](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L196)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`dpr`](BaseVisualization.md#dpr)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:195](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L195)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`height`](BaseVisualization.md#height)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:198](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L198)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isFilterUpdate`](BaseVisualization.md#isfilterupdate)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:230](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L230)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`options`](BaseVisualization.md#options)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:194](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L194)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`width`](BaseVisualization.md#width)

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:214](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L214)

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

###### approxOtherCategory

> **approxOtherCategory**: (`count`) => `string`

The approximate twin of `otherCategory`, used above the
`approx_count_distinct` threshold. Its own string for the same reason
`approxUniqueCount` is: a translation of the exact form would present an
estimate as a fact. The segment's *row* count is exact either way — only
the folded distinct count is estimated.

###### Parameters

###### count

`number`

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

[`BaseVisualization`](BaseVisualization.md).[`statsMessages`](BaseVisualization.md#statsmessages)

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:490](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L490)

Clear the entire canvas

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`clear`](BaseVisualization.md#clear)

***

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1917](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1917)

Clear brush - no-op for value counts
Provided for interface compatibility

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1885](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1885)

Clear segment selection (public method for external LIFO handling)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:648](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L648)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`destroy`](BaseVisualization.md#destroy)

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:478](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L478)

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

Defined in: [visualizations/BaseVisualization.ts:467](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L467)

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

### exportDataSnapshot()

> **exportDataSnapshot**(): [`ValueCountsSnapshot`](../interfaces/ValueCountsSnapshot.md) \| `null`

Defined in: [visualizations/valuecounts/ValueCounts.ts:252](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L252)

Value counts caches more than the foreground/background pair: the
unfiltered category **order**, its counts, whether an "Other" bucket
existed, and the top-N values the "Other" click turns into an exclusion
filter. All of it is derived from the unfiltered scan, so all of it has
to travel — otherwise a re-created chart under an active filter both
re-scans and re-orders its segments under the user.

#### Returns

[`ValueCountsSnapshot`](../interfaces/ValueCountsSnapshot.md) \| `null`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`exportDataSnapshot`](BaseVisualization.md#exportdatasnapshot)

***

### fetchData()

> **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/valuecounts/ValueCounts.ts:314](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L314)

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

Defined in: [visualizations/BaseVisualization.ts:497](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L497)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1901](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1901)

Get brush state - value counts doesn't support brush
Provided for interface compatibility

#### Returns

`null`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:504](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L504)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`getColumn`](BaseVisualization.md#getcolumn)

***

### getSelectionState()

> **getSelectionState**(): `object`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1835](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1835)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1457](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1457)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1823](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1823)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1809](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1809)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1792](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1792)

Handle mouse leave - clear hover states

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`handleMouseLeave`](BaseVisualization.md#handlemouseleave)

***

### handleMouseMove()

> `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1322](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1322)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1816](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1816)

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

### hydrateOrFetch()

> `protected` **hydrateOrFetch**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:597](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L597)

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

[`BaseVisualization`](BaseVisualization.md).[`hydrateOrFetch`](BaseVisualization.md#hydrateorfetch)

***

### importDataSnapshot()

> **importDataSnapshot**(`snapshot`): `boolean`

Defined in: [visualizations/valuecounts/ValueCounts.ts:266](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L266)

Adopt a snapshot produced by [exportDataSnapshot](BaseVisualization.md#exportdatasnapshot) and reflect it —
an implementation is expected to leave the instance fully rendered, as
though its fetch had just landed.

#### Parameters

##### snapshot

`unknown`

opaque value previously returned by
  [exportDataSnapshot](BaseVisualization.md#exportdatasnapshot) on an instance of the same class.

#### Returns

`boolean`

`true` when the snapshot was recognized and adopted. `false`
  (the default) means "not supported / not usable", and the caller
  falls back to a normal fetch — so an unrecognized or corrupt snapshot
  degrades to today's behavior rather than to an empty chart.

#### Example

```ts
class SparkLine extends BaseVisualization {
  private points: number[] = [];
  override exportDataSnapshot() { return this.points.length ? { points: this.points } : null; }
  override importDataSnapshot(s: unknown) {
    const snap = s as { points?: number[] } | null;
    if (!snap?.points) return false;
    this.points = snap.points;
    this.render();
    return true;
  }
}
```

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`importDataSnapshot`](BaseVisualization.md#importdatasnapshot)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:511](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L511)

Check if the visualization has been destroyed

#### Returns

`boolean`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`isDestroyed`](BaseVisualization.md#isdestroyed)

***

### render()

> **render**(): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:468](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L468)

Main render function - orchestrates all drawing

#### Returns

`void`

#### Overrides

[`BaseVisualization`](BaseVisualization.md).[`render`](BaseVisualization.md#render)

***

### setBrushState()

> **setBrushState**(`_state`): `void`

Defined in: [visualizations/valuecounts/ValueCounts.ts:1909](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1909)

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

Defined in: [visualizations/valuecounts/ValueCounts.ts:1854](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/valuecounts/ValueCounts.ts#L1854)

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

Defined in: [visualizations/BaseVisualization.ts:610](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L610)

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

Defined in: [visualizations/BaseVisualization.ts:385](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L385)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

#### Inherited from

[`BaseVisualization`](BaseVisualization.md).[`updateSize`](BaseVisualization.md#updatesize)

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:524](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/visualizations/BaseVisualization.ts#L524)

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
