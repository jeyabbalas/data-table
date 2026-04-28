[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CrossfilterCoordinator

# Class: CrossfilterCoordinator

Defined in: [visualizations/CrossfilterCoordinator.ts:50](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L50)

Coordinates filter rebroadcasting across all column-header visualizations
on a table. Composed by the facade; rarely needed directly. Bounds in-flight
fan-out via a small concurrency cap so DuckDB-WASM (single-threaded) stays
responsive on wide tables.

## Constructors

### Constructor

> **new CrossfilterCoordinator**(`state`, `actions`, `bridge`, `concurrency?`, `options?`): `CrossfilterCoordinator`

Defined in: [visualizations/CrossfilterCoordinator.ts:57](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L57)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:165](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L165)

Clean up signal subscription and clear registrations

#### Returns

`void`

***

### handleFilterChange()

> **handleFilterChange**(`columnName`, `filter`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:94](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L94)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:70](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L70)

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

> **syncExistingFilters**(): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:82](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L82)

Sync filtered row count with current filter state.
Call after registering all visualizations when filters may have been
restored from persistence before the coordinator was created.

#### Returns

`void`

***

### unregister()

> **unregister**(`columnName`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:75](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/CrossfilterCoordinator.ts#L75)

Unregister a visualization

#### Parameters

##### columnName

`string`

#### Returns

`void`
