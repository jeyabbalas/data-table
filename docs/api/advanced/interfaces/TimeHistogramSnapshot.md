[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeHistogramSnapshot

# Interface: TimeHistogramSnapshot

Defined in: [visualizations/histogram/TimeHistogram.ts:39](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/TimeHistogram.ts#L39)

[TimeHistogram](../classes/TimeHistogram.md)'s data snapshot — see [BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot).

## Extends

- `SharedHistogramSnapshot`\<[`TimeHistogramData`](TimeHistogramData.md)\>

## Properties

### backgroundData

> **backgroundData**: [`TimeHistogramData`](TimeHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramSnapshot.backgroundData`

***

### data

> **data**: [`TimeHistogramData`](TimeHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramSnapshot.data`

***

### initialData

> **initialData**: [`TimeHistogramData`](TimeHistogramData.md) \| `null`

Defined in: [visualizations/histogram/TimeHistogram.ts:41](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/histogram/TimeHistogram.ts#L41)

The cached unfiltered pass `ensureInitialData` would otherwise re-issue.
