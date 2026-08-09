[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / formatDefaultStats

# Function: formatDefaultStats()

> **formatDefaultStats**(`stats`, `dataType`, `messages?`): `string`

Defined in: [statistics/StatsFormatters.ts:336](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/statistics/StatsFormatters.ts#L336)

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
