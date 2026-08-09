[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogramSnapshot

# Interface: IntervalHistogramSnapshot

Defined in: [visualizations/histogram/IntervalHistogram.ts:34](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/IntervalHistogram.ts#L34)

[IntervalHistogram](../classes/IntervalHistogram.md)'s data snapshot — see [BaseVisualization.exportDataSnapshot](../classes/BaseVisualization.md#exportdatasnapshot).

## Extends

- `SharedHistogramSnapshot`\<[`IntervalHistogramData`](IntervalHistogramData.md)\>

## Properties

### backgroundData

> **backgroundData**: [`IntervalHistogramData`](IntervalHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:151](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/SharedHistogramBase.ts#L151)

#### Inherited from

`SharedHistogramSnapshot.backgroundData`

***

### data

> **data**: [`IntervalHistogramData`](IntervalHistogramData.md) \| `null`

Defined in: [visualizations/histogram/SharedHistogramBase.ts:150](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/SharedHistogramBase.ts#L150)

#### Inherited from

`SharedHistogramSnapshot.data`

***

### initialData

> **initialData**: [`IntervalHistogramData`](IntervalHistogramData.md) \| `null`

Defined in: [visualizations/histogram/IntervalHistogram.ts:36](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/visualizations/histogram/IntervalHistogram.ts#L36)

The cached unfiltered pass `ensureInitialData` would otherwise re-issue.
