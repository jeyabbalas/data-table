[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationOptions

# Interface: VisualizationOptions

Defined in: [visualizations/BaseVisualization.ts:107](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L107)

Options for creating a visualization

## Properties

### bridge

> **bridge**: [`WorkerBridge`](../../index/classes/WorkerBridge.md)

Defined in: [visualizations/BaseVisualization.ts:111](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L111)

Bridge for executing queries

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/BaseVisualization.ts:113](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L113)

Current active filters

***

### maxBins?

> `optional` **maxBins?**: `number`

Defined in: [visualizations/BaseVisualization.ts:123](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L123)

Maximum number of histogram bins (default: 15)

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [visualizations/BaseVisualization.ts:121](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L121)

Resolved i18n strings for viz-emitted stats text. Defaults to English.

***

### onBrushClear?

> `optional` **onBrushClear?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:127](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L127)

Callback when brush is cleared (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onBrushCommit?

> `optional` **onBrushCommit?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:125](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L125)

Callback when brush is committed (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onDefaultStatsChange?

> `optional` **onDefaultStatsChange?**: (`stats`) => `void`

Defined in: [visualizations/BaseVisualization.ts:119](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L119)

Callback providing computed column stats for default display (not hover)

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md)

#### Returns

`void`

***

### onError?

> `optional` **onError?**: (`error`, `context`) => `void`

Defined in: [visualizations/BaseVisualization.ts:138](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L138)

Callback invoked when the visualization fails to fetch, render, or
update filters. Receives a typed [DataTableError](../../index/classes/DataTableError.md) and a context
describing which stage failed. `superseded` is set on a filter update
that failed after a newer one had started, which is what the chart will
show. The facade routes these to the `error` event with
`source: 'visualization'`.

#### Parameters

##### error

[`DataTableError`](../../index/classes/DataTableError.md)

##### context

###### columnName?

`string`

###### stage

`"fetch"` \| `"render"` \| `"filter"`

###### superseded?

`boolean`

#### Returns

`void`

***

### onFilterChange?

> `optional` **onFilterChange?**: (`filter`) => `void`

Defined in: [visualizations/BaseVisualization.ts:115](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L115)

Callback when visualization creates/removes a filter (null = remove)

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md) \| `null`

#### Returns

`void`

***

### onSelectionChange?

> `optional` **onSelectionChange?**: (`columnName`, `hasSelection`) => `void`

Defined in: [visualizations/BaseVisualization.ts:129](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L129)

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

Defined in: [visualizations/BaseVisualization.ts:117](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L117)

Callback to update stats line on hover (null restores default)

#### Parameters

##### stats

`string` \| `null`

#### Returns

`void`

***

### tableName

> **tableName**: `string`

Defined in: [visualizations/BaseVisualization.ts:109](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/visualizations/BaseVisualization.ts#L109)

Name of the DuckDB table
