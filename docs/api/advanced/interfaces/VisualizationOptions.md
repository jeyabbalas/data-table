[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationOptions

# Interface: VisualizationOptions

Defined in: [visualizations/BaseVisualization.ts:99](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L99)

Options for creating a visualization

## Properties

### bridge

> **bridge**: [`WorkerBridge`](../../index/classes/WorkerBridge.md)

Defined in: [visualizations/BaseVisualization.ts:103](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L103)

Bridge for executing queries

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/BaseVisualization.ts:105](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L105)

Current active filters

***

### maxBins?

> `optional` **maxBins?**: `number`

Defined in: [visualizations/BaseVisualization.ts:113](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L113)

Maximum number of histogram bins (default: 15)

***

### onBrushClear?

> `optional` **onBrushClear?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:117](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L117)

Callback when brush is cleared (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onBrushCommit?

> `optional` **onBrushCommit?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:115](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L115)

Callback when brush is committed (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onDefaultStatsChange?

> `optional` **onDefaultStatsChange?**: (`stats`) => `void`

Defined in: [visualizations/BaseVisualization.ts:111](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L111)

Callback providing computed column stats for default display (not hover)

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md)

#### Returns

`void`

***

### onError?

> `optional` **onError?**: (`error`, `context`) => `void`

Defined in: [visualizations/BaseVisualization.ts:126](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L126)

Callback invoked when the visualization fails to fetch, render, or
update filters. Receives a typed [DataTableError](../../index/classes/DataTableError.md) and a context
describing which stage failed. The facade routes these to the
`error` event with `source: 'visualization'`.

#### Parameters

##### error

[`DataTableError`](../../index/classes/DataTableError.md)

##### context

###### columnName?

`string`

###### stage

`"filter"` \| `"fetch"` \| `"render"`

#### Returns

`void`

***

### onFilterChange?

> `optional` **onFilterChange?**: (`filter`) => `void`

Defined in: [visualizations/BaseVisualization.ts:107](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L107)

Callback when visualization creates/removes a filter (null = remove)

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md) \| `null`

#### Returns

`void`

***

### onSelectionChange?

> `optional` **onSelectionChange?**: (`columnName`, `hasSelection`) => `void`

Defined in: [visualizations/BaseVisualization.ts:119](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L119)

Callback when selection changes (column name and hasSelection passed)

#### Parameters

##### columnName

`string`

##### hasSelection

`boolean`

#### Returns

`void`

***

### onStatsChange?

> `optional` **onStatsChange?**: (`stats`) => `void`

Defined in: [visualizations/BaseVisualization.ts:109](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L109)

Callback to update stats line on hover (null restores default)

#### Parameters

##### stats

`string` \| `null`

#### Returns

`void`

***

### tableName

> **tableName**: `string`

Defined in: [visualizations/BaseVisualization.ts:101](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/BaseVisualization.ts#L101)

Name of the DuckDB table
