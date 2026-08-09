[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CategorySegment

# Interface: CategorySegment

Defined in: [visualizations/valuecounts/ValueCountsData.ts:44](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/valuecounts/ValueCountsData.ts#L44)

A single category segment in the stacked bar

## Properties

### count

> **count**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:48](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/valuecounts/ValueCountsData.ts#L48)

Count of rows with this value

***

### isOther

> **isOther**: `boolean`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:50](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/valuecounts/ValueCountsData.ts#L50)

Is this the "Other" aggregation segment?

***

### otherCount?

> `optional` **otherCount?**: `number`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:58](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/valuecounts/ValueCountsData.ts#L58)

For "Other" segment: how many distinct values it represents.

Derived from [ValueCountsData.distinctCount](ValueCountsData.md#distinctcount), so it is an estimate —
floored at 1 — whenever [ValueCountsData.distinctCountApprox](ValueCountsData.md#distinctcountapprox) is set
on the enclosing result. [CategorySegment.count](#count) is exact either way.

***

### value

> **value**: `string`

Defined in: [visualizations/valuecounts/ValueCountsData.ts:46](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/valuecounts/ValueCountsData.ts#L46)

The category value (string representation)
