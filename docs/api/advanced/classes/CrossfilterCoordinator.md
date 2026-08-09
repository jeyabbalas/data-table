[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CrossfilterCoordinator

# Class: CrossfilterCoordinator

Defined in: [visualizations/CrossfilterCoordinator.ts:107](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L107)

Coordinates filter rebroadcasting across all column-header visualizations
on a table. Composed by the facade; rarely needed directly. Bounds in-flight
fan-out via a small concurrency cap so DuckDB-WASM (single-threaded) stays
responsive on wide tables.

## Constructors

### Constructor

> **new CrossfilterCoordinator**(`state`, `actions`, `bridge`, `concurrency?`, `options?`): `CrossfilterCoordinator`

Defined in: [visualizations/CrossfilterCoordinator.ts:114](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L114)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### concurrency?

`number` = `DEFAULT_VIZ_CONCURRENCY`

##### options?

`CrossfilterCoordinatorOptions` = `{}`

#### Returns

`CrossfilterCoordinator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:244](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L244)

Clean up signal subscription and clear registrations

#### Returns

`void`

***

### handleFilterChange()

> **handleFilterChange**(`columnName`, `filter`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:154](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L154)

Route a visualization's onFilterChange to StateActions

#### Parameters

##### columnName

`string`

##### filter

[`Filter`](../../index/type-aliases/Filter.md) \| `null`

#### Returns

`void`

***

### register()

> **register**(`columnName`, `viz`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:127](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L127)

Register a visualization for crossfilter updates

#### Parameters

##### columnName

`string`

##### viz

[`BaseVisualization`](BaseVisualization.md)

#### Returns

`void`

***

### syncExistingFilters()

> **syncExistingFilters**(): `Promise`\<`void`\>

Defined in: [visualizations/CrossfilterCoordinator.ts:143](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L143)

Sync filtered row count with current filter state. Returns a promise
that resolves once the row-count query settles (or immediately when
there are no filters in state). The facade awaits this during `loadData`
so `loadComplete` doesn't fire while the count query is still in flight.

Call after registering all visualizations when filters may have been
restored from persistence before the coordinator was created.

#### Returns

`Promise`\<`void`\>

***

### unregister()

> **unregister**(`columnName`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:132](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/CrossfilterCoordinator.ts#L132)

Unregister a visualization

#### Parameters

##### columnName

`string`

#### Returns

`void`
