[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationOptions

# Interface: VisualizationOptions

Defined in: [visualizations/BaseVisualization.ts:110](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L110)

Options for creating a visualization

## Properties

### bridge

> **bridge**: [`WorkerBridge`](../../index/classes/WorkerBridge.md)

Defined in: [visualizations/BaseVisualization.ts:114](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L114)

Bridge for executing queries

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/BaseVisualization.ts:116](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L116)

Current active filters

***

### maxBins?

> `optional` **maxBins?**: `number`

Defined in: [visualizations/BaseVisualization.ts:126](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L126)

Maximum number of histogram bins (default: 15)

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [visualizations/BaseVisualization.ts:124](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L124)

Resolved i18n strings for viz-emitted stats text. Defaults to English.

***

### onBrushClear?

> `optional` **onBrushClear?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:130](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L130)

Callback when brush is cleared (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onBrushCommit?

> `optional` **onBrushCommit?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:128](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L128)

Callback when brush is committed (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onDefaultStatsChange?

> `optional` **onDefaultStatsChange?**: (`stats`) => `void`

Defined in: [visualizations/BaseVisualization.ts:122](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L122)

Callback providing computed column stats for default display (not hover)

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md)

#### Returns

`void`

***

### onError?

> `optional` **onError?**: (`error`, `context`) => `void`

Defined in: [visualizations/BaseVisualization.ts:141](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L141)

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

Defined in: [visualizations/BaseVisualization.ts:118](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L118)

Callback when visualization creates/removes a filter (null = remove)

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md) \| `null`

#### Returns

`void`

***

### onSelectionChange?

> `optional` **onSelectionChange?**: (`columnName`, `hasSelection`) => `void`

Defined in: [visualizations/BaseVisualization.ts:132](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L132)

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

Defined in: [visualizations/BaseVisualization.ts:120](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L120)

Callback to update stats line on hover (null restores default)

#### Parameters

##### stats

`string` \| `null`

#### Returns

`void`

***

### tableName

> **tableName**: `string`

Defined in: [visualizations/BaseVisualization.ts:112](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/BaseVisualization.ts#L112)

Name of the DuckDB table
