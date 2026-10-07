[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CrossfilterCoordinatorOptions

# Interface: CrossfilterCoordinatorOptions

Defined in: [visualizations/CrossfilterCoordinator.ts:42](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/visualizations/CrossfilterCoordinator.ts#L42)

Optional hooks the facade can pass into the coordinator. `onFilterCycleComplete`
fires for a filter cycle as soon as its async row-count query has settled,
unless a newer cycle has started by then — that's the contract the public
`filterChange` event relies on so its `filteredRowCount` payload is never
stale. It does not wait for the charts' refetches, which run alongside the
count and can take seconds longer on a large table.

## Properties

### onFilterCycleComplete?

> `optional` **onFilterCycleComplete?**: (`filters`) => `void`

Defined in: [visualizations/CrossfilterCoordinator.ts:43](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/visualizations/CrossfilterCoordinator.ts#L43)

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`void`
