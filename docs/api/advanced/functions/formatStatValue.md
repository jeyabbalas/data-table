[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / formatStatValue

# Function: formatStatValue()

> **formatStatValue**(`value`): `string`

Defined in: [statistics/StatsFormatters.ts:26](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/statistics/StatsFormatters.ts#L26)

Format a data value for display in the stats panel.

Uses the same rules as the histogram axis labels (formatAxisValue):
- |value| >= 1e6 → scientific notation (e.g., "1.23e+6")
- |value| < 0.01 (except 0) → scientific notation (e.g., "1.00e-3")
- Integer → locale-formatted with separators (e.g., "1,234")
- Float → locale-formatted, up to 2 decimal places (e.g., "3.14")

## Parameters

### value

`number`

## Returns

`string`
