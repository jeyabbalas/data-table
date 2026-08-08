[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StatsPanelCoordinator

# Class: StatsPanelCoordinator

Defined in: [visualizations/StatsPanelCoordinator.ts:59](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L59)

Mirrors [CrossfilterCoordinator](CrossfilterCoordinator.md) for `BaseStatsPanel` subclasses:
stamps a monotonic `filterSequence` on every broadcast so panels can drop
stale results, and bounds panel-issued query fan-out via its own
concurrency cap. Composed by the facade; expose for power users
orchestrating panels manually.

## Constructors

### Constructor

> **new StatsPanelCoordinator**(`state`, `concurrency?`, `options?`): `StatsPanelCoordinator`

Defined in: [visualizations/StatsPanelCoordinator.ts:76](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L76)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### concurrency?

`number` = `DEFAULT_PANEL_CONCURRENCY`

##### options?

`StatsPanelCoordinatorOptions` = `{}`

#### Returns

`StatsPanelCoordinator`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:198](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L198)

Clean up the signal subscription and clear registrations.

#### Returns

`void`

***

### get()

> **get**(`columnName`): [`BaseStatsPanel`](BaseStatsPanel.md) \| `undefined`

Defined in: [visualizations/StatsPanelCoordinator.ts:98](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L98)

Get the panel registered for a column, or undefined.

#### Parameters

##### columnName

`string`

#### Returns

[`BaseStatsPanel`](BaseStatsPanel.md) \| `undefined`

***

### has()

> **has**(`columnName`): `boolean`

Defined in: [visualizations/StatsPanelCoordinator.ts:103](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L103)

True if a panel is registered for the column.

#### Parameters

##### columnName

`string`

#### Returns

`boolean`

***

### register()

> **register**(`columnName`, `panel`): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:87](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L87)

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

Defined in: [visualizations/StatsPanelCoordinator.ts:125](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L125)

Re-broadcast the current filter array to every registered panel.
Returns a promise that resolves once every panel's `updateFilters` call
settles (per-panel errors are swallowed by `callUpdateFilters`). The
facade awaits this during `loadData` so `loadComplete` doesn't fire
while initial panel queries are still in flight.

Useful after registering new panels so they see filters that were
already in state (e.g., restored from persistence) before the
coordinator was created or the panel was registered.

Deliberately asymmetric with the `state.filters` subscription path: this
one **always** fans out directly over every registered panel, even when a
FilterFanOutScheduler is attached. The facade's load gate awaits
this call, so routing it through the scheduler would make load completion
depend on the header-visibility wave — precisely the coupling the lazy
visualization work removes. A scheduler only ever owns filter *changes*.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>

***

### unregister()

> **unregister**(`columnName`): `void`

Defined in: [visualizations/StatsPanelCoordinator.ts:93](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/visualizations/StatsPanelCoordinator.ts#L93)

Unregister a panel. Idempotent.

#### Parameters

##### columnName

`string`

#### Returns

`void`
