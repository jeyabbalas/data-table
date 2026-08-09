[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterFanOutScheduler

# Interface: FilterFanOutScheduler

Defined in: [visualizations/CrossfilterCoordinator.ts:82](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/visualizations/CrossfilterCoordinator.ts#L82)

Optional hook that takes over a coordinator's per-registration fan-out on
filter change. When supplied, `refreshOnFilters` is called *instead of*
iterating registrations: the scheduler decides which entries refresh now
(typically only the visible ones) and which are deferred.

The coordinator still performs each update through `request.refresh`, so the
destroyed / stale-sequence guards stay with the coordinator — a scheduler
only ever chooses *which* columns and *when*. Awaiting `refreshOnFilters`
gates nothing else: `updateFilteredRowCount` and `onFilterCycleComplete`
(the public `filterChange` contract) run on their own path.

## Example

```ts
import type { FilterFanOutScheduler } from '@jeyabbalas/data-table/advanced';

// Refresh only what the user can see; leave the rest for scroll-into-view.
const visibleOnly: FilterFanOutScheduler = {
  async refreshOnFilters({ columns, refresh }) {
    await Promise.all(columns.filter(isOnScreen).map(refresh));
  },
};

const coord = new CrossfilterCoordinator(state, actions, bridge, 4, {
  vizScheduler: visibleOnly,
});
```

## Methods

### refreshOnFilters()

> **refreshOnFilters**(`request`): `Promise`\<`void`\>

Defined in: [visualizations/CrossfilterCoordinator.ts:83](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/visualizations/CrossfilterCoordinator.ts#L83)

#### Parameters

##### request

[`FilterFanOutRequest`](FilterFanOutRequest.md)

#### Returns

`Promise`\<`void`\>
