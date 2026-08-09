[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DateHistogramSnapshot

# Interface: DateHistogramSnapshot

Defined in: [visualizations/histogram/DateHistogram.ts:40](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/DateHistogram.ts#L40)

[DateHistogram](../classes/DateHistogram.md)'s data snapshot — see [BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot).

## Extends

- `SharedHistogramSnapshot`\<[`DateHistogramData`](DateHistogramData.md)\>

## Properties

### backgroundData

> **backgroundData**: [`DateHistogramData`](DateHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramSnapshot.backgroundData`

***

### data

> **data**: [`DateHistogramData`](DateHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramSnapshot.data`

***

### initialData

> **initialData**: [`DateHistogramData`](DateHistogramData.md) \| `null`

Defined in: [visualizations/histogram/DateHistogram.ts:42](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/DateHistogram.ts#L42)

The cached unfiltered pass `ensureInitialData` would otherwise re-issue.
