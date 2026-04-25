[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / fetchIntervalStats

# Function: fetchIntervalStats()

> **fetchIntervalStats**(`tableName`, `column`, `filters`, `bridge`, `unfilteredTotal?`): `Promise`\<[`IntervalColumnStats`](../interfaces/IntervalColumnStats.md)\>

Defined in: [statistics/StatsComputer.ts:33](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/statistics/StatsComputer.ts#L33)

Fetch stats for an interval column via DuckDB SQL.

DuckDB supports MIN, MAX, and APPROX_QUANTILE on INTERVAL types.
Results are cast to VARCHAR for display.

## Parameters

### tableName

`string`

### column

`string`

### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

### unfilteredTotal?

`number`

## Returns

`Promise`\<[`IntervalColumnStats`](../interfaces/IntervalColumnStats.md)\>
