[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / formatDefaultStats

# Function: formatDefaultStats()

> **formatDefaultStats**(`stats`, `dataType`, `messages?`): `string`

Defined in: [statistics/StatsFormatters.ts:285](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/statistics/StatsFormatters.ts#L285)

Format the complete two-line default stats HTML for a column header.

## Parameters

### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md)

The computed column stats data

### dataType

[`DataType`](../../index/type-aliases/DataType.md)

The column's DataType (needed to disambiguate categorical subtypes)

### messages?

[`Strings`](../../index/interfaces/Strings.md) = `defaultStrings`

Resolved i18n strings. Defaults to English.

## Returns

`string`

HTML string with line1 and optional line2 wrapped in span elements
