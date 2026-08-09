[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NumericHistogramSnapshot

# Interface: NumericHistogramSnapshot

Defined in: [visualizations/histogram/Histogram.ts:53](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/histogram/Histogram.ts#L53)

[Histogram](../classes/Histogram.md)'s data snapshot — see [BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot).

## Extends

- `SharedHistogramSnapshot`\<[`HistogramData`](HistogramData.md)\>

## Properties

### backgroundData

> **backgroundData**: [`HistogramData`](HistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramSnapshot.backgroundData`

***

### data

> **data**: [`HistogramData`](HistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramSnapshot.data`

***

### initialData

> **initialData**: [`HistogramData`](HistogramData.md) \| `null`

Defined in: [visualizations/histogram/Histogram.ts:55](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/visualizations/histogram/Histogram.ts#L55)

The cached unfiltered pass `ensureInitialData` would otherwise re-issue.
