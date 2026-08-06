[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseVisualization

# Abstract Class: BaseVisualization

Defined in: [visualizations/BaseVisualization.ts:144](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L144)

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

Defined in: [visualizations/BaseVisualization.ts:174](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L174)

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

Defined in: [visualizations/BaseVisualization.ts:145](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L145)

***

### column

> `protected` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:176](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L176)

***

### container

> `protected` **container**: `HTMLElement`

Defined in: [visualizations/BaseVisualization.ts:175](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L175)

***

### ctx

> `protected` **ctx**: `CanvasRenderingContext2D`

Defined in: [visualizations/BaseVisualization.ts:146](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L146)

***

### dataPromise

> `protected` **dataPromise**: `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:164](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L164)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:150](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L150)

***

### dpr

> `protected` **dpr**: `number`

Defined in: [visualizations/BaseVisualization.ts:149](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L149)

***

### height

> `protected` **height**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:148](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L148)

***

### isFilterUpdate

> `protected` **isFilterUpdate**: `boolean` = `false`

Defined in: [visualizations/BaseVisualization.ts:151](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L151)

***

### options

> `protected` **options**: [`VisualizationOptions`](../interfaces/VisualizationOptions.md)

Defined in: [visualizations/BaseVisualization.ts:177](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L177)

***

### width

> `protected` **width**: `number` = `0`

Defined in: [visualizations/BaseVisualization.ts:147](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L147)

## Methods

### clear()

> `protected` **clear**(): `void`

Defined in: [visualizations/BaseVisualization.ts:416](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L416)

Clear the entire canvas

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseVisualization.ts:497](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L497)

Destroy the visualization and clean up all resources.
Must be called when the visualization is no longer needed.

#### Returns

`void`

***

### dispatchWindowKeyDown()

> **dispatchWindowKeyDown**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:404](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L404)

Called by WindowListenerManager to dispatch window keydown events.

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

***

### dispatchWindowMouseUp()

> **dispatchWindowMouseUp**(`e`): `void`

Defined in: [visualizations/BaseVisualization.ts:393](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L393)

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

Defined in: [visualizations/BaseVisualization.ts:251](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L251)

Fetch data needed for this visualization from DuckDB.
Called when the visualization is created and when filters change.

#### Returns

`Promise`\<`void`\>

***

### formatNumber()

> `protected` **formatNumber**(`value`): `string`

Defined in: [visualizations/BaseVisualization.ts:423](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L423)

Format a number with locale-specific formatting

#### Parameters

##### value

`number`

#### Returns

`string`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseVisualization.ts:430](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L430)

Get the column this visualization represents

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### handleClick()

> `abstract` `protected` **handleClick**(`x`, `y`, `event?`): `void`

Defined in: [visualizations/BaseVisualization.ts:272](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L272)

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

Defined in: [visualizations/BaseVisualization.ts:301](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L301)

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

Defined in: [visualizations/BaseVisualization.ts:286](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L286)

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

Defined in: [visualizations/BaseVisualization.ts:278](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L278)

Handle mouse leaving the visualization.
Used to clear hover states.

#### Returns

`void`

***

### handleMouseMove()

> `abstract` `protected` **handleMouseMove**(`x`, `y`): `void`

Defined in: [visualizations/BaseVisualization.ts:264](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L264)

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

Defined in: [visualizations/BaseVisualization.ts:294](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L294)

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

Defined in: [visualizations/BaseVisualization.ts:437](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L437)

Check if the visualization has been destroyed

#### Returns

`boolean`

***

### render()

> `abstract` **render**(): `void`

Defined in: [visualizations/BaseVisualization.ts:257](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L257)

Render the visualization on the canvas.
Called after data fetch and on resize.

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:459](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L459)

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

Defined in: [visualizations/BaseVisualization.ts:311](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L311)

Update canvas dimensions to match container.
Accounts for device pixel ratio for crisp rendering.

#### Returns

`void`

***

### waitForData()

> **waitForData**(): `Promise`\<`void`\>

Defined in: [visualizations/BaseVisualization.ts:450](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/BaseVisualization.ts#L450)

Resolves once the visualization's initial `fetchData()` settles. The
facade awaits this during `loadData` so a consumer chaining `addFilter`
after `await createDataTable` doesn't race the unfiltered first fetch.

Subclasses that don't fetch in their constructor return a pre-resolved
promise. Resolves on success, rejection (observable via
`options.onError`), and post-destroy. Never hangs.

#### Returns

`Promise`\<`void`\>
