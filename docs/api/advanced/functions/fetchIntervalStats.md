[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / fetchIntervalStats

# Function: fetchIntervalStats()

> **fetchIntervalStats**(`tableName`, `column`, `filters`, `bridge`, `unfilteredTotal?`): `Promise`\<[`IntervalColumnStats`](../interfaces/IntervalColumnStats.md)\>

Defined in: [statistics/StatsComputer.ts:36](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/statistics/StatsComputer.ts#L36)

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
