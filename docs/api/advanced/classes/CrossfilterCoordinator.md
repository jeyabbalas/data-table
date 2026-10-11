[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CrossfilterCoordinator

# Class: CrossfilterCoordinator

Defined in: [visualizations/CrossfilterCoordinator.ts:53](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L53)

Coordinates filter rebroadcasting across all column-header visualizations
on a table. Composed by the facade; rarely needed directly. Bounds in-flight
fan-out via a small concurrency cap so DuckDB-WASM (single-threaded) stays
responsive on wide tables.

## Constructors

### Constructor

> **new CrossfilterCoordinator**(`state`, `actions`, `bridge`, `concurrency?`, `options?`): `CrossfilterCoordinator`

Defined in: [visualizations/CrossfilterCoordinator.ts:61](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L61)

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

[`CrossfilterCoordinatorOptions`](../interfaces/CrossfilterCoordinatorOptions.md) = `{}`

#### Returns

`CrossfilterCoordinator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:246](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L246)

Clean up signal subscription and clear registrations. A row-count query
still in flight is discarded when it settles: it writes nothing to
`state.filteredRows` and fires no `onFilterCycleComplete`.

#### Returns

`void`

***

### handleFilterChange()

> **handleFilterChange**(`columnName`, `filter`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:115](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L115)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:74](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L74)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:90](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L90)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:79](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/CrossfilterCoordinator.ts#L79)

Unregister a visualization

#### Parameters

##### columnName

`string`

#### Returns

`void`
