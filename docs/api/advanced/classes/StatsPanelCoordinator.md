[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StatsPanelCoordinator

# Class: StatsPanelCoordinator

Defined in: [visualizations/StatsPanelCoordinator.ts:51](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L51)

Mirrors [CrossfilterCoordinator](CrossfilterCoordinator.md) for `BaseStatsPanel` subclasses:
stamps a monotonic `filterSequence` on every broadcast so panels can drop
stale results, and bounds panel-issued query fan-out via its own
concurrency cap. Composed by the facade; expose for power users
orchestrating panels manually.

## Constructors

### Constructor

> **new StatsPanelCoordinator**(`state`, `concurrency?`): `StatsPanelCoordinator`

Defined in: [visualizations/StatsPanelCoordinator.ts:67](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L67)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### concurrency?

`number` = `DEFAULT_PANEL_CONCURRENCY`

#### Returns

`StatsPanelCoordinator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:158](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L158)

Clean up the signal subscription and clear registrations.

#### Returns

`void`

***

### get()

> **get**(`columnName`): [`BaseStatsPanel`](BaseStatsPanel.md) \| `undefined`

Defined in: [visualizations/StatsPanelCoordinator.ts:84](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L84)

Get the panel registered for a column, or undefined.

#### Parameters

##### columnName

`string`

#### Returns

[`BaseStatsPanel`](BaseStatsPanel.md) \| `undefined`

***

### has()

> **has**(`columnName`): `boolean`

Defined in: [visualizations/StatsPanelCoordinator.ts:89](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L89)

True if a panel is registered for the column.

#### Parameters

##### columnName

`string`

#### Returns

`boolean`

***

### register()

> **register**(`columnName`, `panel`): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:73](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L73)

Register a panel for filter-broadcast updates. Same-column re-register replaces.

#### Parameters

##### columnName

`string`

##### panel

[`BaseStatsPanel`](BaseStatsPanel.md)

#### Returns

`void`

***

### syncExistingFilters()

> **syncExistingFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/StatsPanelCoordinator.ts:104](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L104)

Re-broadcast the current filter array to every registered panel.
Returns a promise that resolves once every panel's `updateFilters` call
settles (per-panel errors are swallowed by `callUpdateFilters`). The
facade awaits this during `loadData` so `loadComplete` doesn't fire
while initial panel queries are still in flight.

Useful after registering new panels so they see filters that were
already in state (e.g., restored from persistence) before the
coordinator was created or the panel was registered.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>

***

### unregister()

> **unregister**(`columnName`): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:79](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/visualizations/StatsPanelCoordinator.ts#L79)

Unregister a panel. Idempotent.

#### Parameters

##### columnName

`string`

#### Returns

`void`
