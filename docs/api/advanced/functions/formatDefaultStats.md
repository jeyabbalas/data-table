[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / formatDefaultStats

# Function: formatDefaultStats()

> **formatDefaultStats**(`stats`, `dataType`, `messages?`): `string`

Defined in: [statistics/StatsFormatters.ts:336](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/statistics/StatsFormatters.ts#L336)

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
