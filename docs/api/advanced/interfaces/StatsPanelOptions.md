[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StatsPanelOptions

# Interface: StatsPanelOptions

Defined in: [visualizations/BaseStatsPanel.ts:92](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L92)

Options passed to a stats panel constructor and refreshed on filter
changes. Mirrors the shape of [VisualizationOptions](VisualizationOptions.md) so panel
authors can reach the same DuckDB worker, filter array, and i18n strings
the visualizations use.

## Properties

### bridge

> **bridge**: [`WorkerBridge`](../../index/classes/WorkerBridge.md)

Defined in: [visualizations/BaseStatsPanel.ts:96](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L96)

Bridge for executing custom SQL against DuckDB-WASM.

***

### filters

> **filters**: [`Filter`](../../index/type-aliases/Filter.md)[]

Defined in: [visualizations/BaseStatsPanel.ts:98](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L98)

Currently active filters. Refreshed on each `updateFilters` call.

***

### messages

> **messages**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [visualizations/BaseStatsPanel.ts:100](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L100)

Resolved i18n strings; use these to localize any text the panel renders.

***

### onError?

> `optional` **onError?**: (`error`, `context`) => `void`

Defined in: [visualizations/BaseStatsPanel.ts:105](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L105)

Called when the panel fails to fetch, render, or update. The facade
routes these to the `error` event with `source: 'statsPanel'`.

#### Parameters

##### error

[`DataTableError`](../../index/classes/DataTableError.md)

##### context

[`StatsPanelErrorContext`](StatsPanelErrorContext.md)

#### Returns

`void`

***

### tableName

> **tableName**: `string`

Defined in: [visualizations/BaseStatsPanel.ts:94](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/visualizations/BaseStatsPanel.ts#L94)

Name of the DuckDB table the panel can query.
