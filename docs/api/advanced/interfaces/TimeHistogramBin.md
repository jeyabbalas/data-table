[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TimeHistogramBin

# Interface: TimeHistogramBin

Defined in: [visualizations/histogram/TimeHistogramData.ts:34](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/histogram/TimeHistogramData.ts#L34)

A single time histogram bin with second ranges and count

## Properties

### binEndSeconds

> **binEndSeconds**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:41](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/histogram/TimeHistogramData.ts#L41)

End of the bin in seconds from midnight (exclusive). A bar ending at
86400 holds `24:00:00` too.

***

### binStartSeconds

> **binStartSeconds**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:36](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/histogram/TimeHistogramData.ts#L36)

Start of the bin in seconds from midnight

***

### count

> **count**: `number`

Defined in: [visualizations/histogram/TimeHistogramData.ts:43](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/visualizations/histogram/TimeHistogramData.ts#L43)

Number of values in this bin
