[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CrossfilterCoordinator

# Class: CrossfilterCoordinator

Defined in: [visualizations/CrossfilterCoordinator.ts:34](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L34)

## Constructors

### Constructor

> **new CrossfilterCoordinator**(`state`, `actions`, `bridge`, `concurrency?`): `CrossfilterCoordinator`

Defined in: [visualizations/CrossfilterCoordinator.ts:40](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L40)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### concurrency?

`number` = `DEFAULT_VIZ_CONCURRENCY`

#### Returns

`CrossfilterCoordinator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:134](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L134)

Clean up signal subscription and clear registrations

#### Returns

`void`

***

### handleFilterChange()

> **handleFilterChange**(`columnName`, `filter`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:71](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L71)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:51](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L51)

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

Defined in: [visualizations/CrossfilterCoordinator.ts:63](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L63)

Sync filtered row count with current filter state.
Call after registering all visualizations when filters may have been
restored from persistence before the coordinator was created.

#### Returns

`void`

***

### unregister()

> **unregister**(`columnName`): `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:56](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/CrossfilterCoordinator.ts#L56)

Unregister a visualization

#### Parameters

##### columnName

`string`

#### Returns

`void`
