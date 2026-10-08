[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / IntervalHistogramBin

# Interface: IntervalHistogramBin

Defined in: [visualizations/histogram/IntervalHistogramData.ts:42](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L42)

A single interval histogram bin with seconds-based ranges

## Properties

### binEndSeconds

> **binEndSeconds**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:46](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L46)

End of the bin in total seconds (exclusive)

***

### binStartSeconds

> **binStartSeconds**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:44](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L44)

Start of the bin in total seconds (inclusive)

***

### count

> **count**: `number`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:48](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L48)

Number of values in this bin

***

### maxValue?

> `optional` **maxValue?**: `string`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:56](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L56)

The bin's largest value as DuckDB writes it; set with [minValue](#minvalue).

***

### minValue?

> `optional` **minValue?**: `string`

Defined in: [visualizations/histogram/IntervalHistogramData.ts:54](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/histogram/IntervalHistogramData.ts#L54)

The bin's smallest value as DuckDB writes it (`400 days 07:30:00.000001`).
Set by the unfiltered fetch for a bin holding values: a brush filters from
the first such bin's smallest value to the last one's largest.
