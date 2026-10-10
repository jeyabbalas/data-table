[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / NestedSummaryData

# Interface: NestedSummaryData

Defined in: [visualizations/nested/NestedSummaryData.ts:30](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/nested/NestedSummaryData.ts#L30)

The counts a nested column's summary chart draws: rows and non-NULL
values, over the whole relation and over the rows passing the filters.

## Example

```ts
const data: NestedSummaryData = {
  total: 1000,
  nonNullCount: 990,
  filtered: { total: 120, nonNullCount: 118 },
};
```

## Properties

### filtered

> **filtered**: \{ `nonNullCount`: `number`; `total`: `number`; \} \| `null`

Defined in: [visualizations/nested/NestedSummaryData.ts:39](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/nested/NestedSummaryData.ts#L39)

Rows passing the filters, and of them those whose value is not NULL.
`null` when no filter is active.

***

### nonNullCount

> **nonNullCount**: `number`

Defined in: [visualizations/nested/NestedSummaryData.ts:34](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/nested/NestedSummaryData.ts#L34)

Of them, rows whose value is not NULL.

***

### total

> **total**: `number`

Defined in: [visualizations/nested/NestedSummaryData.ts:32](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/nested/NestedSummaryData.ts#L32)

Rows in the relation, filters aside.
