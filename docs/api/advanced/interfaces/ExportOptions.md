[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ExportOptions

# Interface: ExportOptions

Defined in: [export/CSVExport.ts:44](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L44)

Options controlling CSV export behavior

## Properties

### columns

> **columns**: `"all"` \| `string`[]

Defined in: [export/CSVExport.ts:48](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L48)

Which columns to include

***

### delimiter

> **delimiter**: `string`

Defined in: [export/CSVExport.ts:52](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L52)

Field delimiter character

***

### includeHeaders

> **includeHeaders**: `boolean`

Defined in: [export/CSVExport.ts:50](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L50)

Whether to include a header row

***

### nullValue

> **nullValue**: `string`

Defined in: [export/CSVExport.ts:54](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L54)

String to use for NULL values

***

### scope

> **scope**: `"all"` \| `"filtered"` \| `"selected"`

Defined in: [export/CSVExport.ts:46](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/export/CSVExport.ts#L46)

Which rows to export
