[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationOptions

# Interface: VisualizationOptions

Defined in: [visualizations/BaseVisualization.ts:97](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L97)

Options for creating a visualization

## Properties

### bridge

> **bridge**: [`WorkerBridge`](../../index/classes/WorkerBridge.md)

Defined in: [visualizations/BaseVisualization.ts:101](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L101)

Bridge for executing queries

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/BaseVisualization.ts:103](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L103)

Current active filters

***

### initialSnapshot?

> `optional` **initialSnapshot?**: `unknown`

Defined in: [visualizations/BaseVisualization.ts:156](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L156)

Data captured from a previous instance of the same column via
[BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot). When present, the built-in
visualizations hydrate from it in their constructor instead of issuing
their initial fetch — that is what makes a column hide/show/reorder cost
**zero** DuckDB queries even though the header DOM (and therefore the
instance) is rebuilt.

Ignored by any subclass that does not implement
[BaseVisualization.importDataSnapshot](../classes/BaseVisualization.md#importdatasnapshot); such a subclass simply
fetches as before.

***

### maxBins?

> `optional` **maxBins?**: `number`

Defined in: [visualizations/BaseVisualization.ts:113](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L113)

Maximum number of histogram bins (default: 15)

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [visualizations/BaseVisualization.ts:111](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L111)

Resolved i18n strings for viz-emitted stats text. Defaults to English.

***

### onBrushClear?

> `optional` **onBrushClear?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:160](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L160)

Callback when brush is cleared (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onBrushCommit?

> `optional` **onBrushCommit?**: (`columnName`) => `void`

Defined in: [visualizations/BaseVisualization.ts:158](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L158)

Callback when brush is committed (column name passed)

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### onDefaultStatsChange?

> `optional` **onDefaultStatsChange?**: (`stats`) => `void`

Defined in: [visualizations/BaseVisualization.ts:109](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L109)

Callback providing computed column stats for default display (not hover)

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md)

#### Returns

`void`

***

### onError?

> `optional` **onError?**: (`error`, `context`) => `void`

Defined in: [visualizations/BaseVisualization.ts:169](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L169)

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

`"fetch"` \| `"render"` \| `"filter"`

#### Returns

`void`

***

### onFilterChange?

> `optional` **onFilterChange?**: (`filter`) => `void`

Defined in: [visualizations/BaseVisualization.ts:105](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L105)

Callback when visualization creates/removes a filter (null = remove)

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md) \| `null`

#### Returns

`void`

***

### onSelectionChange?

> `optional` **onSelectionChange?**: (`columnName`, `hasSelection`) => `void`

Defined in: [visualizations/BaseVisualization.ts:162](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L162)

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

Defined in: [visualizations/BaseVisualization.ts:107](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L107)

Callback to update stats line on hover (null restores default)

#### Parameters

##### stats

`string` \| `null`

#### Returns

`void`

***

### tableName

> **tableName**: `string`

Defined in: [visualizations/BaseVisualization.ts:99](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L99)

Name of the DuckDB table

***

### useApproxDistinct?

> `optional` **useApproxDistinct?**: `boolean`

Defined in: [visualizations/BaseVisualization.ts:128](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/BaseVisualization.ts#L128)

Compute distinct counts with DuckDB's HyperLogLog
`approx_count_distinct(col)` instead of an exact `COUNT(DISTINCT col)`.

The facade sets this from `state.totalRows` via
`shouldUseApproxDistinct` (`histogram/HistogramData.ts`) — above
`APPROX_DISTINCT_ROW_THRESHOLD` rows the exact count is the single most
expensive term in the per-column stats scan.

Absent (the default) keeps the exact count. When set, the count is a
genuine estimate, so the stats line renders the `~` marker and the
"all unique" shortcut is suppressed — see
`StatsFormatters.formatStatsLine2`.
