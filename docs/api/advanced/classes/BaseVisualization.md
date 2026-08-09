[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseVisualization

# Abstract Class: BaseVisualization

Defined in: [visualizations/BaseVisualization.ts:191](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L191)

Abstract base class for column visualizations.

## Example

```typescript
class Histogram extends BaseVisualization {
  async fetchData() {
    // Fetch histogram bins from DuckDB
  }
  render() {
    // Draw histogram bars
  }
  // ... implement mouse handlers
}
```

## Extended by

- [`ValueCounts`](ValueCounts.md)

## Constructors

### Constructor

> **new BaseVisualization**(`container`, `column`, `options`): `BaseVisualization`

Defined in: [visualizations/BaseVisualization.ts:227](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L227)

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

Defined in: [visualizations/BaseVisualization.ts:192](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L192)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:229](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L229)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:228](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L228)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:193](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L193)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:211](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L211)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:197](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L197)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:196](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L196)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:195](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L195)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:198](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L198)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:230](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L230)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:194](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L194)

## Accessors

### statsMessages

#### Get Signature

> **get** `protected` **statsMessages**(): `object`

Defined in: [visualizations/BaseVisualization.ts:214](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L214)

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

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:490](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L490)

Clear the entire canvas

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:648](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L648)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:478](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L478)

Called by WindowListenerManager to dispatch window keydown events.

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

***

### dispatchWindowMouseUp()

> **dispatchWindowMouseUp**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:467](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L467)

Called by WindowListenerManager to dispatch window mouseup events.
Translates coordinates relative to this instance's canvas.

#### Parameters

##### e

`MouseEvent`

#### Returns

`void`

***

### exportDataSnapshot()

> **exportDataSnapshot**(): `unknown`

Defined in: [visualizations/BaseVisualization.ts:550](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L550)

Capture this visualization's fetched data so it can outlive the
instance. Returned values are treated as opaque by the caller and are
only ever handed back to [importDataSnapshot](#importdatasnapshot) on a **new instance
of the same class, for the same column**.

The default returns `null` — "I have nothing worth keeping", which makes
a re-created instance fetch as before. All five built-ins override it.

Column header DOM is rebuilt wholesale on every hide / show / pin /
reorder, so a visualization instance cannot survive one. This pair is
what lets its *data* survive instead.

#### Returns

`unknown`

#### Example

```ts
const snapshot = viz.exportDataSnapshot();
viz.destroy();
// …header rebuilt…
const next = new Histogram(freshContainer, column, { ...options, initialSnapshot: snapshot });
// `next` renders immediately and issues no query.
```

***

### fetchData()

> `abstract` **fetchData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:325](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L325)

Fetch data needed for this visualization from DuckDB.
Called when the visualization is created and when filters change.

#### Returns

`Promise`\<`void`\>

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:497](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L497)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:504](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L504)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### handleClick()

> `abstract` `protected` **handleClick**(`x`, `y`, `event?`): `void`

Defined in: [visualizations/BaseVisualization.ts:346](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L346)

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

Defined in: [visualizations/BaseVisualization.ts:375](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L375)

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

Defined in: [visualizations/BaseVisualization.ts:360](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L360)

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

Defined in: [visualizations/BaseVisualization.ts:352](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L352)

Handle mouse leaving the visualization.
Used to clear hover states.

#### Returns

`void`

***

### handleMouseMove()

> `abstract` `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/BaseVisualization.ts:338](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L338)

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

Defined in: [visualizations/BaseVisualization.ts:368](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L368)

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

### hydrateOrFetch()

> `protected` **hydrateOrFetch**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:597](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L597)

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

***

### importDataSnapshot()

> **importDataSnapshot**(`snapshot`): `boolean`

Defined in: [visualizations/BaseVisualization.ts:581](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L581)

Adopt a snapshot produced by [exportDataSnapshot](#exportdatasnapshot) and reflect it —
an implementation is expected to leave the instance fully rendered, as
though its fetch had just landed.

#### Parameters

##### snapshot

`unknown`

opaque value previously returned by
  [exportDataSnapshot](#exportdatasnapshot) on an instance of the same class.

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

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseVisualization.ts:511](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L511)

Check if the visualization has been destroyed

#### Returns

`boolean`

***

### render()

> `abstract` **render**(): `void`

Defined in: [visualizations/BaseVisualization.ts:331](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L331)

Render the visualization on the canvas.
Called after data fetch and on resize.

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:610](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L610)

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

Defined in: [visualizations/BaseVisualization.ts:385](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L385)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:524](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/BaseVisualization.ts#L524)

Resolves once the visualization's initial `fetchData()` settles. The
facade awaits this during `loadData` so a consumer chaining `addFilter`
after `await createDataTable` doesn't race the unfiltered first fetch.

Subclasses that don't fetch in their constructor return a pre-resolved
promise. Resolves on success, rejection (observable via
`options.onError`), and post-destroy. Never hangs.

#### Returns

`Promise`\<`void`\>
