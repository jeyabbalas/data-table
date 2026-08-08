[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StatsPanelErrorContext

# Interface: StatsPanelErrorContext

Defined in: [visualizations/BaseStatsPanel.ts:80](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L80)

Context passed to [StatsPanelOptions.onError](StatsPanelOptions.md#onerror) so listeners can
disambiguate stats-panel errors from visualization or load errors. The
facade re-emits these on its `error` event with `source: 'stats-panel'`.

## Properties

### column

> **column**: `string`

Defined in: [visualizations/BaseStatsPanel.ts:82](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L82)

***

### phase

> **phase**: [`StatsPanelErrorPhase`](../type-aliases/StatsPanelErrorPhase.md)

Defined in: [visualizations/BaseStatsPanel.ts:83](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L83)

***

### source

> **source**: `"stats-panel"`

Defined in: [visualizations/BaseStatsPanel.ts:81](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L81)
