[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StatsPanelCoordinatorOptions

# Interface: StatsPanelCoordinatorOptions

Defined in: [visualizations/StatsPanelCoordinator.ts:51](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/visualizations/StatsPanelCoordinator.ts#L51)

Optional hooks for the panel coordinator, supplied as the constructor's
trailing argument. Separate from `CrossfilterCoordinatorOptions` because
panels have no row-count cycle to hook.

## Properties

### vizScheduler?

> `optional` **vizScheduler?**: [`FilterFanOutScheduler`](FilterFanOutScheduler.md)

Defined in: [visualizations/StatsPanelCoordinator.ts:57](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/visualizations/StatsPanelCoordinator.ts#L57)

See [FilterFanOutScheduler](FilterFanOutScheduler.md). Absent = today's fan-out over every
registered panel. Note this governs [StatsPanelCoordinator](../classes/StatsPanelCoordinator.md) filter
*changes* only — `syncExistingFilters` always bypasses it.
