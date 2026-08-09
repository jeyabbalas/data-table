[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterFanOutRequest

# Interface: FilterFanOutRequest

Defined in: [visualizations/CrossfilterCoordinator.ts:39](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/CrossfilterCoordinator.ts#L39)

Request handed to a [FilterFanOutScheduler](FilterFanOutScheduler.md) in place of a coordinator's
own per-registration fan-out.

## Properties

### columns

> **columns**: `string`[]

Defined in: [visualizations/CrossfilterCoordinator.ts:45](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/CrossfilterCoordinator.ts#L45)

Column names with a live (non-destroyed) registration, in registration order.

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/CrossfilterCoordinator.ts:41](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/CrossfilterCoordinator.ts#L41)

The filter array being broadcast.

***

### refresh

> **refresh**: (`columnName`) => `Promise`\<`void`\>

Defined in: [visualizations/CrossfilterCoordinator.ts:51](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/CrossfilterCoordinator.ts#L51)

Perform the coordinator's normal per-column update. Resolves when it
settles. Calling it for a column that is no longer registered (or whose
registration has been destroyed) is a no-op.

#### Parameters

##### columnName

`string`

#### Returns

`Promise`\<`void`\>

***

### sequence

> **sequence**: `number`

Defined in: [visualizations/CrossfilterCoordinator.ts:43](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/visualizations/CrossfilterCoordinator.ts#L43)

The coordinator's monotonic filter sequence for this cycle.
